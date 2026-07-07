# Home Plus — Consolidated Pre-Release Review
**Date:** 2026-07-07 · **Reviewed:** `main` @ v1.0.124 (migrations through v24) · **Coordinator:** full 7-reviewer sweep (security, legal, architecture, QA, release-readiness as deploy gates; UI/UX + iOS-experience as quality gates)

---

## VERDICT: **NO-GO for App Store submission** — GO-WITH-FIXES for continued web operation

Apple would reject this build on at least four independent grounds (broken account deletion in the WKWebView build, a reused build number, placeholder legal documents, no reviewer account), and two children's-privacy accuracy gaps must be closed before the App Privacy label can honestly be filled in. None of it is deep: every code-level blocker is small and well-located. The long pole is the lawyer track, which was already known.

**The good news is structural:** security found **zero criticals** — tenant isolation is enforced at the database and verified ("can any family see another family's data? **NO**"), no secrets leak to the client bundle, and architecture rates the codebase **READY-WITH-FIXES for 1000+ users**. The product is sound; the submission plumbing and legal surface are what's unfinished.

---

## Blockers (🔴) — must resolve before submission

| ID | Area | Finding | Fix |
|---|---|---|---|
| **R1** 🔴 | release | **Account deletion is broken in the shipped iOS app.** `src/lib/apiBase.ts` needs `VITE_API_BASE` for native builds (WKWebView serves from `capacitor://localhost`, so relative `/api/...` 404s) and it is set nowhere — `DeleteAccountModal` will always fail on device. Apple's #1 rejection for account-based apps (5.1.1(v)). | Set `VITE_API_BASE=https://home-plus-lyart.vercel.app` for iOS builds (`.env.production` or a `Capacitor.isNativePlatform()` fallback in `apiBase.ts`); verify delete end-to-end on a real device. |
| **R2** 🔴 | release | **Xcode versions stale/reused:** `MARKETING_VERSION = 1.0.107`, `CURRENT_PROJECT_VERSION = 100` — build 100 was already uploaded; ASC rejects reused build numbers. | Bump both in `project.pbxproj` (Debug+Release): marketing = package.json version at submission; build number past the highest ever uploaded (check ASC history, not the repo). |
| **R3** 🔴 | release | **No App Review demo account** — near-certain Guideline 2.1 "Information Needed" rejection for an account-gated app. | Create a confirmed prod account (e.g. `appreview@…`), seed a sample family (chores/habits/events/pet), put credentials in ASC → App Review notes. |
| **L1** 🔴 | legal | **Privacy Policy + ToS are still drafts** with `[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`, `[CONTACT EMAIL]`, `[GOVERNING JURISDICTION]` placeholders (`public/privacy.html`, `public/terms.html`). Not a valid policy; fails App Review. (Also flagged independently by release-readiness.) | Lawyer fills entity/address/contact/governing law; clear every `[LAWYER REVIEW]` note; bump effective dates; redeploy; confirm `/privacy` + `/terms` render clean. |
| **L2** 🔴 | legal | **Children's-data lawful basis is an MVP, not a decided model** — in-app parent attestation only; no COPPA verifiable parental consent (US), no UK Children's Code DPIA, no GDPR-K Art. 8 mechanism. | Lawyer + operator decision: stronger VPC or **restrict launch territories (e.g. AU-first)**; complete the DPIA. Gates which jurisdictions the store listing may target. |
| **L3** 🔴 | legal | **"On-device speech / no raw audio leaves the device" is not established by the code** — `useVoiceCapture.ts` never sets `requiresOnDeviceRecognition: true`, so SFSpeechRecognizer may send (children's) audio to Apple servers, contradicting the policy and the planned App Privacy label (which omits Audio Data). | Either set `requiresOnDeviceRecognition: true` and verify on device, or disclose Apple as a speech processor and declare Audio Data in the label. Must be resolved before the label is submitted. |
| **L4** 🔴 | legal | **Undisclosed processor + inaccurate location wording:** `useWeather.tsx` sends precise GPS coords to `nominatim.openstreetmap.org` (reverse geocoding) — not in the policy's processor table; policy says "coarse" location but full-precision lat/lng is transmitted (to Open-Meteo too). | Add Nominatim/OSM to the processor table (or drop reverse-geocoding), and truncate coordinate precision before sending or fix the "coarse" wording. |
| **A2** 🔴 | architecture | **Silent data loss on wifi flaps:** writes are fire-and-forget with no retry/outbox — a failed upsert's optimistic state is overwritten by the next poll after the 10s pending-write TTL. Worst on the always-on kitchen iPad. | Durable localStorage write-outbox keyed `(table,id,op)`; flush on `online`/channel `SUBSCRIBED`; keep pending-write marker alive while queued. Ship before or immediately after launch. |
| **A3** 🔴 | architecture | **Meal-repeat materialisation:** one "repeat" writes up to ~728 rows (2/occurrence) as individual upserts + realtime broadcasts — the clearest cost non-linearity, and it floods the client render loop (A1). Already on the backlog; now quantified. | Give meals the calendar-style recurrence-rule model (expand client-side; materialise only edited occurrences). Interim: batch into one multi-row upsert. |
| **A1** 🔴 | architecture + iOS | **Monolithic context × keep-alive tabs = render blast radius.** One realtime event/mutation re-renders all ~7-9 mounted page trees (50 `useFamily()` sites / 34 files); `JSON.stringify` equality grows with data. Both opus reviewers independently named this the single biggest source of clunk; it degrades exactly at breakfast-time peak use. | Staged: (1) extract the ~70 stable callbacks into a `FamilyActionsContext` (mechanical, kills a large fraction of fanout); (2) split data contexts by domain; (3) interim `updated_at`-based equality instead of stringify. Can be staged post-submission but start now. |
| **X2** 🔴 | iOS + architecture | **ListsPage chunk is 145.75 kB** — ~299 statically-imported lucide icons for a picker inside the edit modal; parse hitch on every first Lists open, bigger than the React vendor chunk. | Lazy-load the icon grid when the picker opens; resolve chosen icons from a small in-use map. Cheapest high-value perf win in the app. |
| **U1** 🔴 | ui/ux | **Pet page is a phone column on iPad** (`max-w-lg` single column) — now the app's longest page, worst "phone port on a tablet" offender; every other surface uses landscape grids. | `grid grid-cols-1 lg:grid-cols-[380px_1fr] max-w-5xl` — hero (canvas/treats/stats) left; quests/actions/awards/shop/XP right. |
| **U2** 🔴 | ui/ux | **Mini-game treats are ~32px moving targets caught via `onMouseEnter`** — under 44pt, hover-dependent, hard for the kids it's aimed at; no non-visual alternative signposted. | ≥44px hit areas via padding, add `onClick`, drop hover-catch; `aria-label` the game as optional (XP/coins reachable via quests/actions). |
| **U3** 🔴 | ui/ux | **Raw `red-500`/`green-500`/`emerald-500` in ~15 files bypass the token system** — same hex in both themes; `text-red-500` on dark surface ≈ 3.7:1, failing WCAG AA. Same bug class as the fixed `bg-accent` issue. | Add `--danger`/`--success` tokens (lifted dark variants) to `index.css` + Tailwind config; sweep the raw usages. |

## Should-fix (🟡)

**Security**
- **S1** 🟡 — **Child voice-consent enforced client-side only** (found independently by security AND legal): `/api/voice-intake` never checks `voice_consent_at`/`role` server-side; the consent the policy promises is bypassable. Fix in `voice-intake.js` after `getFamilyMember`: load the member, 403 child transcripts without consent (same for `extract-events`). *Security recommends before submission; it also makes L-policy statements true — treat as first in the fix queue.*
- **S2** 🟡 — Clients can mint pet coins (`virtual_pets.coins` is a plain column, unlike guarded `reward_balances`). Family-scoped, cosmetic-only — either mirror the RPC+guard-trigger pattern or explicitly accept as game-integrity non-issue.
- **S3** 🟡 — `CRON_SECRET` passed as a query param on `/api/google/reconcile` (loggable). Move to a header with constant-time compare.

**Legal**
- **L5** 🟡 — Anthropic no-training/zero-retention not configured/confirmed; DPAs/SCCs unsigned across Supabase (Tokyo), Anthropic, Google, Resend, Vercel, Open-Meteo, Nominatim. Operator + lawyer track (APP 8 / GDPR Ch. V).
- **L6** 🟡 — Location is auto-requested on first load (`useWeather` mount effect), contradicting the policy's "off unless you turn them on". Gate behind explicit user action or fix the wording.
- **L7** 🟡 — Effective/updated dates (6 June 2026) must be bumped when the drafts are finalised; confirm `-lyart` URL is the canonical one in ASC metadata.

**Architecture**
- **A4** 🟡 — RLS data-table policies inline membership subqueries; swap to the existing `is_family_member()` STABLE helper + `(select auth.uid())` initplan pattern. Policy-only rewrite.
- **A5** 🟡 — Overlapping full reloads possible (visibility-resume + reconnect catch-up); single-flight `reloadFromCloud`.

**QA**
- **Q1** 🟡 — Unit-test the untested date-boundary logic (same style as `habits.test.ts`): `rollQuestState`/`dailyQuests`, away-status until/revert math, sound-mute persistence.
- **Q2** 🟡 — Evolution overlay uses raw `localStorage` (`pet_stage_seen:*`) instead of the `hp:`-prefixed `storage` wrapper — confirm intentional; manually test two kids' pets on one shared iPad.
- **Q3** 🟡 — **Run the manual device matrix before submission** (QA report has the full plan): drag-reorder on all six surfaces, treat hold-vs-scroll, multi-profile pet scoping, cold-launch first-tap audio, quest midnight rollover, away-status revert, theme-vs-system overscroll, offline mutation sync, invite→join→RLS visibility, iPad rotation mid-drag, meal-planner month rollover.

**Release-readiness**
- **R4** 🟡 — "Running in demo mode… set VITE_SUPABASE_URL in .env" string is reviewer-visible (`SettingsPage.tsx:115`); guard behind DEV or reword.
- **R5** 🟡 — Confirm the 1024 app icon has no alpha channel (`sips -g hasAlpha …`); flatten if needed.
- **R6** 🟡 — `.env` `SITE_URL`/`GOOGLE_OAUTH_REDIRECT_URI` point at `home-plus.vercel.app` (wrong domain — prod is `-lyart`); reconcile with Google Cloud Console and test a real sync.
- **R7** 🟡 — No remote crash/error reporting (local ErrorBoundary only); at minimum commit to Xcode Organizer checks, ideally add a lightweight web reporter.
- **R8** 🟡 — Verify Supabase backups/PITR are enabled on the prod project and do one practice restore.

**UI/UX**
- **U4** 🟡 — `InviteModal` bypasses the shared `Modal` (no phone bottom-sheet, drifted inputs/buttons) — first thing a joining family member sees; rebuild on `Modal` + `.input` + `.btn-primary`.
- **U5** 🟡 — Kitchen sub-nav tabs ~32px tall; bump to `min-h-[44px]`.
- **U6** 🟡 — Audit `getColorTokens` member colours for 4.5:1 with white text in dark mode (parallel palette to the audited `--accent-strong`).
- **U7** 🟡 — Evolution overlay should reuse `modal-backdrop`/`modal-card` entrance animations (currently jump-cuts).

**iOS experience**
- **X3** 🟡 — Side-rail open/close animates `margin` on the whole content column (full-page reflow per frame on iPad); animate `transform: translateX` instead.
- **X4** 🟡 — Progress bars animate `width` (layout) — switch to `transform: scaleX` fills (pet page runs several at once).
- **X5** 🟡 — HomePage runs unmemoized `completions`/`redemptions` filters on every context change and never unmounts; `useMemo` them.
- **X6** 🟡 — No list virtualisation; don't add a library, but cap initial render (~50 rows + "show more") and set a row budget.

## Nice-to-have (🔵)
- **S4-S7** — distributed rate limiting; tighten `Access-Control-Allow-Origin` on `import-recipe`/`account/delete`; throttle `send-invite`; CHECK that `member_id` belongs to `family_id` on direct inserts.
- **L8** — real children's names/birthdays in demo seed (`storage.ts`) — confirm fictional or replace.
- **L9** — enter App Privacy label + age rating in ASC (use the 2026-06-09 table, contingent on L3/L4).
- **Q4/Q5** — CI xcodebuild dry-check; `MANUAL_TESTS.md` checklist.
- **R9** — ASC listing checklist (screenshots iPad 13"/12.9" + iPhone 6.7"/6.1", description, keywords, URLs).
- **U8-U11** — `window.confirm` → branded Modal; shared `.icon-btn` (44pt) for mute/close buttons; border-width consistency on pet grids; gradient token cleanup.
- **X7-X9** — SwipeableRow `pointerdown` outside-close + imperative transform during swipe; bottom-sheet rise from ≥100px for iOS sheet physics.

---

## Per-reviewer summaries

- **Security — PASS (no criticals).** Isolation verdict NO with five lines of evidence; all 21 tables RLS-enabled via `is_family_member`; PINs/balances server-authoritative; invite + OAuth flows hardened; no secrets in `dist/`. Three 🟡: server-side voice consent (S1), mintable pet coins (S2), CRON secret in URL (S3).
- **Legal — NOT READY (drafts + accuracy gaps).** Deletion flow, consent capture, and child voice-gating all verified real; blockers are the placeholder documents (L1), the undecided children's lawful-basis model (L2), the unverified on-device speech claim (L3), and the undisclosed Nominatim flow (L4). Ends with its standard not-legal-advice disclaimer.
- **Architecture — READY-WITH-FIXES for 1000+ users.** "First thing that breaks is not the server — the kitchen iPad's render loop at breakfast." Credits the existing defences (no-op poll bail-out, split sync context, full index coverage). Fix A2 (write outbox) and A3 (meal rows) before/immediately after launch; stage A1.
- **QA — READY-WITH-FIXES.** 34/34 tests pass, build+lint clean, CI wired. Coverage is thin exactly where churn is newest (pet quests/evolution, date math). Drag engine reads sound but has regressed 3× in 10 commits → the manual device matrix (Q3) is a hard pre-submission gate.
- **Release-readiness — NOT-READY.** Four submission blockers (R1-R3 + L1), five 🟡 friction items; verified clean on purpose strings, prod config/secrets, the postinstall patch (fresh `npm ci` tested), and all deliberate Xcode settings.
- **UI/UX — solid foundation, drift at the edges.** Token system and shell praised; gaps cluster in the newest pet-page work (U1, U2, U7) and the never-tokenised red/green palette (U3).
- **iOS experience — fundamentals at the bar, clunk is in render architecture.** No gesture-conflict regressions anywhere; pet page called "a model of discipline." Biggest clunk = A1 (context × keep-alive), cheapest win = X2 (icon chunk).

---

## Recommended order of operations to GO

**Wave 1 — code, hours (implementer can start now):**
1. **R1** `VITE_API_BASE` for iOS + on-device delete verification
2. **S1** server-side voice-consent check in `voice-intake.js` (+ `extract-events`)
3. **L3** `requiresOnDeviceRecognition: true` + device verify (or decide to disclose Audio Data)
4. **L4** Nominatim disclosure or coordinate truncation · **L6** gate the auto location request
5. **R2** Xcode version/build bump · **R4** demo-banner reword · **R5** icon alpha check
6. **U2, U3** mini-game targets + danger/success tokens · **X2** lazy icon picker

**Wave 2 — ops, days:**
7. **R3** reviewer account + seeded family · **R6** OAuth domain reconcile · **R8** backups/PITR check · **L5** Anthropic no-training + DPA collection

**Wave 3 — external, the long pole:**
8. **L1** lawyer finalises policy/ToS → redeploy → **L7** date bump
9. **L2** children's-consent model / launch-territory decision (gates the label + age rating → **L9**)

**Wave 4 — quality + verification before archive:**
10. **U1** pet iPad layout · **U4** InviteModal · **X3-X5** compositor fixes · **Q1** unit tests
11. **Q3** full manual device matrix on real iPhone + iPad
12. **A2** write outbox (before or immediately after launch) · **A3** meal recurrence · **A1** context split (staged)

Then: archive → TestFlight → smoke test → submit (**R9** checklist).

---

*Deploy-gate rule applied: any 🔴 from a deploy-gate reviewer forces NO-GO. Quality-gate 🔴s (U1-U3, X2) don't force the verdict but are listed for the same fix queue. Findings that two reviewers hit independently (S1+legal, L1+release, A1+iOS, X2+architecture) were merged under one ID.*
