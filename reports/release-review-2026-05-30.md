# Home Plus v1.0.61 — Release Decision

**Date:** 2026-05-30
**Reviewers:** security · legal-compliance · architecture-scalability · qa-testing · release-readiness · ui-ux-design
**Decision:** Do all blockers, no scope reductions, global launch.

## Verdict: 🔴 **NO-GO**

Multiple independent automatic blockers exist across security, legal/privacy, and App Store submission requirements. Security has 5 🔴 (unauth API routes including an SSRF, PIN scheme that lets any child impersonate a parent, bypassable invite-mailer auth). Legal has 4 🔴 (no privacy policy, no ToS, no in-app account deletion, no children's-data consent model — three of which are guaranteed Apple Guideline 5.1.1 rejections). Release-readiness has 9 🔴 (version desync, missing PrivacyInfo.xcprivacy, missing account deletion, missing usage strings, broken relative `/api/...` paths inside WKWebView, etc.). Architecture has 3 🔴 hot spots that will hurt under real load (full-history bulk-poll every 20s, missing `recipes`/`meal_plans` migrations, O(N) auth.users scan on every invite). This is not close — do not submit to TestFlight in this state.

---

## 🔴 Blockers (consolidated, with owner)

### Security (security-reviewer)
- **S1 — PINs use a non-cryptographic "demo" hash readable by every family member.** Any child can read every parent's `pin_hash`, brute-force 10,000 4-digit PINs in microseconds locally, and unlock parent mode (which gates approvals, Google connect, deletions, voice-chore-adds). Fix: route `setMemberPin` / `verifyPin` through the existing pgcrypto `set_member_pin` / `verify_member_pin` RPCs, and `revoke select(pin_hash)` from `family_members`. (`src/lib/storage.ts:615`, `src/context/FamilyContext.tsx:1143`, `src/components/SetPinModal.tsx:62`, schema.sql `family_members` SELECT policy)
- **S2 — Children can self-promote to parent.** `family_members` UPDATE policy only checks `is_family_member(family_id)`. Any authed child can `update family_members set role='parent'` on themselves. Fix: BEFORE UPDATE trigger that rejects `role` / `family_id` / `auth_user_id` changes unless caller is a parent in that family.
- **S3 — Children can approve their own redemptions and edit balances.** `chore_completions`, `redemptions`, `family_members.reward_balances` all writable by any family member. Fix: parent-only policy on approval transitions; move balance arithmetic into a SECURITY DEFINER `redeem_reward` RPC.
- **S4 — `/api/voice-intake` is unauthenticated + no rate limit.** Anyone on the internet can burn the Anthropic credit balance. Fix: require Bearer JWT via `getCallerUser`, validate `family_id`, fetch context server-side instead of trusting the client payload, add per-user rate limit.
- **S5 — `/api/extract-events` is unauthenticated.** Same fix as S4.
- **S6 — `/api/import-recipe` is unauthenticated and an SSRF.** No block-list for `127.0.0.1`, RFC1918, `169.254.169.254` (cloud metadata). Fix: require auth + SSRF filter (allow-list of recipe domains or `ssrf-req-filter`).
- **S7 — `send-invite` Edge Function skips its parent check when `Authorization` header is missing.** Any unauthenticated attacker can trigger Home-Plus-branded phishing emails via Resend with attacker-controlled copy. Fix: make the auth check unconditional; tighten CORS to `SITE_URL`. (`supabase/functions/send-invite/index.ts:160`)

### Legal / privacy (legal-compliance-reviewer)
- **L1 — No privacy policy anywhere in the repo or app.** Apple Guideline 5.1.1 auto-reject. GDPR/UK-AADC notice obligations also unmet. Fix: lawyer-drafted policy, host at `home-plus-lyart.vercel.app/privacy`, link from App Store metadata + AuthPage + Settings.
- **L2 — No Terms of Service / no acceptance at sign-up.** Add ToS with affirmative checkbox on the signup screen.
- **L3 — No in-app account deletion.** Apple Guideline 5.1.1(v) auto-reject. Add a "Delete account" flow in Settings backed by an Edge Function (or `/api/account/delete`) using the service-role key to cascade through Supabase. *(Also surfaced by release-readiness as R5.)*
- **L4 — Children's data with no consent model.** Product is explicitly child-centric (PIN-gated child profiles, ages 11/14/16 in seed data, voice transcripts of minors sent to Anthropic). No VPC for COPPA, no DPIA for UK-AADC, no GDPR-K consent flow, no DPAs with Supabase/Anthropic/Google/Resend disclosed. Fix (lawyer required): stand up COPPA verifiable-parental-consent UX, UK-AADC DPIA + age-appropriate defaults, GDPR-K parental consent flow, and sign DPAs with all sub-processors. Block voice for child profiles until VPC is live.

### Release-readiness / App Store (release-readiness-reviewer)
- **R1 — App version desync.** `project.pbxproj` has `MARKETING_VERSION=1.0`, `CURRENT_PROJECT_VERSION=1`; package.json is `1.0.61`. App Store Connect will reject the build. Fix in `ios/App/App.xcodeproj/project.pbxproj` (lines 318/333/341) to `1.0.61` / `61`.
- **R2 — `IPHONEOS_DEPLOYMENT_TARGET = 26.0`** on the App target (project itself is 15.0). Wrong and will fail. Lower to 15.0 (or 16.0/17.0 if intentional).
- **R3 — `PrivacyInfo.xcprivacy` missing.** Required since May 2024. Will trigger ITMS-91053. Create at `ios/App/App/PrivacyInfo.xcprivacy` declaring UserDefaults / FileTimestamp / SystemBootTime reasons + `NSPrivacyTracking=false`.
- **R4 — `ITSAppUsesNonExemptEncryption` not set.** Every TestFlight upload will block at "Missing Compliance." Add `<key>ITSAppUsesNonExemptEncryption</key><false/>` to Info.plist.
- **R5 — In-app account deletion missing.** Duplicate of L3.
- **R6 — Privacy Policy URL not committed / not linked.** Duplicate of L1.
- **R7 — Relative `/api/...` fetches break inside WKWebView.** `useVoiceIntake.ts:90`, `src/lib/googleSync.ts:18/32/44` use bare `/api/...` which resolves to `capacitor://localhost/api/...` on device. Voice intake and Google sync will silently fail in the iOS build. Fix: prefix with `import.meta.env.VITE_API_BASE` and set `VITE_API_BASE=https://home-plus-lyart.vercel.app` in prod build env.
- **R8 — `NSLocationWhenInUseUsageDescription` missing** despite `useWeather.tsx:188-195` calling `navigator.geolocation`. Weather will silently fail on device. Add the key.
- **R9 — `UIRequiredDeviceCapabilities` declares `armv7`.** Replace with `arm64` or remove.
- **R10 — Release config uses `debug.xcconfig`** (so `CAPACITOR_DEBUG=true` ships in prod Info.plist). Switch Release to a clean `release.xcconfig`.

### Architecture (architecture-scalability-reviewer)
- **A1 — Full-history bulk-load every 20 seconds.** `dbLoadFamily` runs 15 unbounded `select('*')` on every auth event, every 20s, and every tab visibility resume. At 1k always-on iPads = ~180k full-history reads/hr. Fix: date-window the 5 hot tables (chore_completions, habit_check_ins, day_plan_blocks, redemptions, events), add `updated_at` for delta polling, and drop the poll to 60–120s.
- **A2 — `recipes` and `meal_plans` are upserted by the client but the tables don't exist** in `schema.sql` or any of the 12 migrations. Any Kitchen "Add Recipe" silently errors and the row never syncs cross-device. Fix: add `migrate_v13.sql` creating both tables with RLS.
- **A3 — `send-invite` calls `auth.admin.listUsers` and paginates up to 50 × 200 = 10k.** O(N) on total user count; hard cap at 10k means silent duplicate-invite bugs near scale. Fix: `getUserByEmail(email)` (supabase-js ≥2.43) or a direct indexed lookup.

### QA (qa-testing-reviewer)
- **Q1 — Three HTML5-DnD callsites still in the tree** on touch-only surfaces: `MyDayPage.tsx:399-417,492-495`, `PetPage.tsx:487-496`, `pet/PetCanvas.tsx:210-222`. These do not work on iOS touch — MyDay activity-pool drop and Pet treat-drag are silently broken on a real device. Fix: port all three to Pointer Events using the existing `useListDragReorder` / Calendar drag patterns as the template.

### UI/UX quality (ui-ux-design-reviewer — quality gate)
- **U1 — Pet page uses a bright web-app rainbow** (`#ef4444 #3b82f6 #ec4899 #8b5cf6 …`) that clashes with the rest of the brand. Re-skin with `getColorTokens(member.color)` + the warm palette from `lib/colors.ts`.

---

## 🟡 Should-fix (grouped by area)

**Security (should-fix):** `recipes`/`meal_plans` RLS audit if those tables exist out-of-band in prod. Family-creation INSERT policy on `family_members` will fail for brand-new owners. 7-day invite tokens — reduce to 24h and mark single-use on first preview. `google_oauth_states` cleanup. Lock `send-invite` CORS to `SITE_URL`. Patch Capacitor speech recognition to force on-device or change the Info.plist usage string promise. Verify Google webhook `X-Goog-Channel-Token`. Google `refresh_token` is `select`-able by every family member via RLS — restrict to parents.

**Architecture (should-fix):** split `FamilyContext` (2,345 lines, 35 consumers) into Members/Calendar/Tasks/Kitchen/Pet contexts. Memoise `eventsByDay: Map` in CalendarPage. **Pets state never persists to Supabase** — every mutator writes only to localStorage; reset the device and the kid's pet is gone. Add `updated_at` columns for delta polling. `day_plan_blocks` and `activity_pool_items` need `family_id` indexes. Realtime channel has no reconnect handler. Voice/extract/import endpoints need idempotency keys + rate limits. Fold v1–v12 migrations back into `schema.sql`. **`drop.sql` will nuke prod if pasted** — rename + add a `current_database()` guard. `reset.sql` references non-existent table names (`habit_checkins`, `calendar_events`).

**QA (should-fix):** ISO-week math in `rotation.ts:17` (`year * 54 + wk`) breaks at year boundaries. Google OAuth round-trip unverified end-to-end on device. Voice intake silently degrades if `ANTHROPIC_API_KEY` is missing from Vercel prod env. No `navigator.onLine` listener — offline writes invisible. Zero automated tests, no CI.

**Release-readiness (should-fix):** LaunchScreen is iPhone-only (`retina4_7`) — letterboxes ugly on iPad. Add reviewer demo account. Hide the "demo mode / set VITE_SUPABASE_URL in .env" copy in `SettingsPage.tsx:103-112` from reviewers. Add Sentry / crash reporting. Confirm `npx @capacitor/assets generate --ios` and that `AppIcon-512@2x.png` is opaque sRGB (no alpha).

**Legal (should-fix):** Privacy nutrition label categories (Contact Info, User Content, Identifiers, Audio Data, Location, Sensitive/Children). Geolocation, mic, and speech-recognition usage strings need child-comprehensible language. Resend DPA. Demo PINs "1234" in README + seed data — document expectation to change before sharing iPad.

**UI/UX (should-fix):** iPad layout wastes space — drop outer `max-w-6xl` when `dockIsSide` and relax per-page `max-w-3xl/4xl` clamps. Hamburger overlap with TopBar in collapsed-rail mode. Two raw `#c44d2e` hex literals in `HabitsStats.tsx:373` / `HabitsPage.tsx:389`. Sub-44pt touch targets across edit pencils and nav arrows. No `prefers-reduced-motion`. Heatmap colour-only signal (red/green colour-blind unreadable). Dynamic Type doesn't scale (px-based). No global ErrorBoundary. No offline state on SyncIndicator. `ImportModal.tsx:76` red banner has no dark variant. Empty/error states on MyDay and Kitchen.

---

## Per-reviewer summary

**Security 🔴** — Cross-household isolation is solid (every table has RLS scoped to `is_family_member(family_id)` via a SECURITY DEFINER helper; a member of family A cannot read or write family B's data). Within-household is effectively cosmetic: PIN hashes are djb2-style and visible to all members, any child can `UPDATE family_members SET role='parent'`, and any child can approve their own redemptions and edit `reward_balances`. Three Vercel API routes are unauthenticated (voice-intake, extract-events, import-recipe — the last is also an SSRF), and the `send-invite` Edge Function skips its parent check when the Authorization header is missing, enabling unauthenticated Home-Plus-branded phishing via Resend. Verdict: 🔴.

**Legal 🔴** — No privacy policy, no ToS, no in-app account deletion, no parental-consent flow for child profiles, and children's voice transcripts are routed to Anthropic with no disclosed sub-processor relationship. These are three independent auto-rejections (Apple 5.1.1, 5.1.1(v), plus children's-data requirements under COPPA/UK-AADC/GDPR-K). Also called out: `google_oauth_states` refresh tokens are readable by every family member via RLS. Verdict: 🔴 — not ready for any release into US/UK/EU.

**Architecture 🟡** — Structurally sound: lint clean, `tsc --noEmit` clean, RLS consistent, FKs indexed, FamilyContext properly memoised. Three issues will visibly bite under real load: a 20s full-history bulk-poll that re-fetches the entire family history on every iPad every 20s, missing `recipes`/`meal_plans` table creation (queried client-side but absent from schema and all 12 migrations), and an O(N) `auth.admin.listUsers` scan on every invite. Also: pets state never persists to Supabase (localStorage only); `drop.sql` will erase prod if pasted; the 2,345-line `FamilyContext` would benefit from a 3–5-way split before the next major release. Verdict: 🟡 GO-WITH-FIXES for 1k users; 3–5 engineering days of blocker work.

**QA 🟡 (with one realistic 🔴)** — Zero automated tests, no CI, no `test` script. Quality gates today are `npm run lint` and `tsc --noEmit`. Code inspection shows the recent high-churn work (voice, calendar 3-day, habits backfill, rotation healing, side rail) is structurally correct and the main list reorder uses Pointer Events. However three legacy HTML5-DnD callsites remain on touch-only surfaces (MyDay pool, Pet treat tray, Pet drop zone) — silently broken on iOS touch. Year-boundary chore-rotation math is comment-flagged as approximate, Google OAuth from inside WKWebView is unverified end-to-end, and voice intake silently degrades without `ANTHROPIC_API_KEY`. A full real-device test plan was produced (sections A and B mandatory before TestFlight). Verdict: 🔴 — must port the three DnD callsites to Pointer Events before submission.

**Release-readiness 🔴** — Hard blockers: marketing version stuck at `1.0/1` while package.json is `1.0.61` (App Store will reject), deployment target set to `iOS 26.0`, missing `PrivacyInfo.xcprivacy` (ITMS-91053 auto-reject), missing in-app account deletion (5.1.1(v) auto-reject), missing privacy policy URL, missing `ITSAppUsesNonExemptEncryption`, missing `NSLocationWhenInUseUsageDescription` (weather is silently broken), `armv7` in `UIRequiredDeviceCapabilities`, Release config inherits `debug.xcconfig` (ships `CAPACITOR_DEBUG=true`), and relative `/api/...` fetches inside WKWebView mean voice + Google sync silently fail on device. Capacitor speech-recognition usage strings are present and well-worded — that part is fine. Verdict: 🔴 — not ready for TestFlight upload, let alone review.

**UI/UX 🟡** — Real, coherent design language: warm cream + terracotta palette, Inter + Fraunces, well-thought-through tokens, dark mode flows end-to-end, shared components reused. UserSwitcher and Auth flows are quietly excellent. Two visible drag-downs: the Pet page is a bright web-app rainbow that clashes with every other surface, and the iPad-landscape layout is a centred phone column because of global `max-w-6xl` plus per-page `max-w-3xl/4xl` clamps. Secondary debt: no `prefers-reduced-motion`, sub-44pt touch targets, colour-only heatmap signals, no Dynamic Type scaling, no offline state, no global ErrorBoundary. Verdict: 🟡 — fix Pet palette and iPad widths, and v1.0.61 reads as confidently designed.

---

## Recommended order of operations to get to GO

Full-scope fix (no feature flags, global launch). Realistic estimate: **~3 weeks for one engineer**, with the lawyer track running in parallel as the long pole.

### Week 1 — Stop the bleed + iOS submission plumbing
1. **Day 1 — Unauth API routes.** Add `getCallerUser(req)` + JWT verification + per-user rate limit to `/api/voice-intake`, `/api/extract-events`, `/api/import-recipe` (+ SSRF filter on the last). Make `send-invite`'s auth check unconditional, tighten CORS to `SITE_URL`. (S4, S5, S6, S7)
2. **Day 1–2 — WKWebView API paths.** Add `VITE_API_BASE` env var; prefix every `/api/...` fetch (`useVoiceIntake.ts:90`, `src/lib/googleSync.ts:18/32/44`). Without this, voice + Google sync are dead on device. (R7)
3. **Day 2 — iOS submission plumbing (mechanical).** In `ios/App/App.xcodeproj/project.pbxproj`: bump `MARKETING_VERSION=1.0.61`, `CURRENT_PROJECT_VERSION=61`, lower `IPHONEOS_DEPLOYMENT_TARGET=15.0`, fix `armv7`→`arm64`. In `Info.plist`: add `ITSAppUsesNonExemptEncryption=false` and `NSLocationWhenInUseUsageDescription`. Create `ios/App/App/PrivacyInfo.xcprivacy`. Create `ios/release.xcconfig` and point Release config to it. Regenerate icons with `npx @capacitor/assets generate --ios`; verify no-alpha. (R1, R2, R3, R4, R8, R9, R10)
4. **Day 3 — PIN hardening.** Wire `setMemberPin` / `verifyPin` through pgcrypto RPCs; `revoke select(pin_hash)` from `family_members`. (S1)
5. **Day 3–4 — Parent-only DB boundaries.** BEFORE UPDATE trigger blocking `role`/`family_id`/`auth_user_id` self-edits by non-parents; parent-only policy on `chore_completions`/`redemptions` approval transitions; SECURITY DEFINER `redeem_reward` RPC; revoke direct write on `reward_balances`. (S2, S3)
6. **Day 4–5 — Account deletion.** "Delete account" button in Settings → Vercel `/api/account/delete` (or Edge Function) using service-role to cascade `families` + `auth.users`. Typed-confirmation modal. (L3, R5)
7. **Day 5 — Missing migrations.** Ship `migrate_v13.sql` creating `recipes` + `meal_plans` with RLS. Rename `drop.sql` → `dev-only-drop.sql` with `current_database()` guard. Fix table names in `reset.sql`. (A2)

### Week 2 — Children's-data consent UX + QA fixes + arch hot spots
8. **Day 6–7 — DnD touch port.** Port `MyDayPage.tsx`, `PetPage.tsx`, `pet/PetCanvas.tsx` from HTML5 DnD to Pointer Events using `useListDragReorder` and Calendar drag as templates. (Q1)
9. **Day 7–8 — Children's-data consent UX.** Parent-only signup attestation; age gate at child-profile creation; per-child explicit consent capture stored on `family_members`; block voice intake for any child profile until VPC is recorded; age-appropriate defaults flipped from on→off in `BLANK` template. (L4)
10. **Day 9 — Bulk-poll fix.** Date-window the 5 hot tables in `dbLoadFamily`; add `updated_at` columns + triggers; drop poll interval to 60–120s; add realtime reconnect handler. (A1)
11. **Day 10 — Invite scale fix.** Replace `auth.admin.listUsers` loop with `getUserByEmail`. (A3)
12. **Day 10 — Pet page palette + iPad layout.** Re-skin Pet actions with `getColorTokens(member.color)`; replace `max-w-6xl` and per-page width clamps with responsive multi-column grids when `dockIsSide`. (U1)

### Week 3 — Legal docs + polish + TestFlight
13. **Days 11–15 — Legal docs (parallel track, started Day 1).** Lawyer-drafted privacy policy + ToS published at `home-plus-lyart.vercel.app/privacy` and `/terms`. Disclose Supabase / Anthropic / Google / Resend / Open-Meteo as sub-processors with locations + transfer mechanisms. Sign Anthropic DPA with no-training option. Sign Resend DPA. DPIA documented for UK-AADC. Privacy policy + ToS linked from AuthPage (with affirmative checkbox at sign-up) and Settings. (L1, L2, L4)
14. **Day 13–14 — App Privacy nutrition labels.** Populate in App Store Connect: Contact Info, User Content, Identifiers, Audio Data, Location, Sensitive (children). Mark all as not-used-for-tracking.
15. **Day 14 — Pets persistence + remaining should-fixes.** Persist Pet state to `virtual_pets` table. Add `prefers-reduced-motion` rule. Bump small touch targets to 44pt. Add global ErrorBoundary. Wire `navigator.onLine` to SyncIndicator. Hide demo-mode developer copy in Settings.
16. **Day 15 — Reviewer setup.** Permanent `appreview@homeplus.app` demo account in prod Supabase, email-confirmed, populated with a sample family. Put credentials in App Store Connect reviewer notes.
17. **Day 15–16 — Internal TestFlight + smoke test.** Run the QA real-device test plan (sections A + B + C + I mandatory). Fix anything that falls out. Submit to App Review.

---

## Priority Batch 1 — Tier 1 (handoff to release-implementer) · added 2026-05-31

**Scope:** `S7, S6, S4, S5` — the unauthenticated, internet-facing endpoints. These are the only blockers exploitable by a stranger with no account against `home-plus-lyart.vercel.app` today, so they lead the queue. Implement as one batch; do **not** touch source until launched as `release-implementer`.

- **S7 🔴 — `send-invite` Edge Function skips its parent check when `Authorization` is missing.** Make the auth check unconditional (reject when header absent), then enforce caller-is-parent-of-`family_id`. Tighten CORS from `*` to `SITE_URL`. File: `supabase/functions/send-invite/index.ts` (auth branch ~line 160).
- **S6 🔴 — `/api/import-recipe` unauthenticated + SSRF.** Require Bearer JWT via `getCallerUser`; add an SSRF guard before fetch (block loopback, RFC1918, `169.254.169.254`/cloud metadata; prefer a recipe-domain allow-list or `ssrf-req-filter`). Resolve+validate the final URL after redirects.
- **S4 🔴 — `/api/voice-intake` unauthenticated + no rate limit.** Require Bearer JWT; validate the caller belongs to `family_id`; fetch family context server-side instead of trusting the client payload; add a per-user rate limit. Caller: `src/hooks/useVoiceIntake.ts:90`.
- **S5 🔴 — `/api/extract-events` unauthenticated.** Same pattern as S4: require JWT, validate `family_id`, rate-limit.

**Acceptance / re-review gate:** every endpoint returns 401 without a valid JWT and 403 for a valid JWT outside the target family; import-recipe rejects internal/metadata hosts; voice-intake + extract-events are rate-limited per user. When landed, I re-run **security-reviewer** scoped to S4–S7 only to verify before moving any of these off 🔴.

**Not in this batch (next up, separate launches):** `S1,S2,S3` (within-household privilege) → `R7` (WKWebView `/api/` paths) → `L3` (account deletion). `L1/L4` ride the parallel lawyer track and cannot be cleared by the implementer.
