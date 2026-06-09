# Release actions — follow-up to the 2026-06-09 go/no-go review

Covers the blockers actioned in the v1.0.99 working tree and the operator/device
items that **cannot be done in code**. IDs match the consolidated review.

## Done in code (this pass)
- **R1 — iOS build version.** `ios/App/App.xcodeproj/project.pbxproj` bumped from
  `MARKETING_VERSION 1.0.63 / build 63` → `1.0.99 / build 100` (Debug + Release).
- **A1 / Q1 — events.exdates migration drift.** Verified against the production
  Supabase project (`wydbnnlloelrahqsaddu`): `events.exdates` **exists**
  (`text[] NOT NULL default '{}'`). Migration v21 is applied — no drift, the
  recurring-event move/delete feature is safe. (Memory updated: migrations through
  v21 applied.)
- **Q2 — automated tests.** Added `vitest` + `vitest.config.ts`, `npm test` script,
  and 31 unit tests locking in the highest-risk pure logic:
  `src/lib/__tests__/habits.test.ts` (target operators, forgiving cell state,
  cadence due-dates, target-aware streaks, range success rate) and
  `src/lib/__tests__/recurrence.test.ts` (daily/weekly/until/count expansion **and
  the exdates exclusion** behind A1). `npm run build` and `npm run lint` stay green.
- **U1 (partial) — accessibility.** Audited tap targets and labels: PinPad keys are
  80×80px, TabBar items `min-h-[48px]` (both > 44pt); delete key is `aria-label`led;
  PIN dots are `aria-live`. Fixed one real bug: the empty cancel slot rendered a
  focusable, unlabeled `<button>` — now a non-interactive spacer. Residual visual
  checks below.

---

## L3 — Children's-privacy / operator track (lawyer + ops, NOT code)
Blocks a compliant US/UK/EU launch. See also `reports/legal-handoff-2026-06-06.md`.

- [ ] **DPAs signed** with every sub-processor + transfer safeguards (SCCs):
      Supabase (DB/auth/storage, AWS ap-northeast-1 Tokyo), Anthropic (voice intake),
      Google (Calendar sync), Resend (email), Vercel (hosting), Open-Meteo (weather).
- [ ] **Anthropic no-training / zero-retention** option enabled on the account used
      by `/api/voice-intake`.
- [ ] **COPPA (US) decision:** implement verifiable parental consent (card/ID) **or**
      restrict child use / markets. Note the voice gate is already wired and keyed on
      `family_members.voice_consent_at` (child voice off by default).
- [ ] **UK Children's Code:** complete a **DPIA**; confirm age-appropriate defaults.
- [ ] **GDPR-K (EU):** confirm Art. 8 parental-consent mechanism + lawful basis per market.
- [ ] (Separate blocker, L1/L2) fill all `[BRACKETED]` placeholders + clear
      `LAWYER REVIEW` notes in `public/privacy.html` and `public/terms.html`.

---

## R2 — App Store Connect App Privacy labels (ASC web UI, NOT code)
Declare in App Store Connect → App Privacy. Grounded in actual data flows; **mark
everything "Not used for tracking"** (no ad/cross-app tracking SDKs present).

| Data type | Collected? | Linked to user | Purpose | Source in code |
|-----------|-----------|----------------|---------|----------------|
| Contact Info — Email | Yes | Yes | App Functionality (account/auth) | Supabase email auth |
| User Content — Other (calendar, lists, chores, **voice transcripts**) | Yes | Yes | App Functionality | voice transcribed **on-device**; only text sent to `/api/voice-intake` → Anthropic |
| Coarse Location | Yes (opt-in) | Yes | App Functionality (weather/location picker) | `NSLocationWhenInUseUsageDescription`, LocationPicker |
| Identifiers — User ID | Yes | Yes | App Functionality | Supabase `auth.uid()` |
| Sensitive Info / children's data | Yes | Yes | App Functionality | child profiles, per-child consent |

Notes:
- **Audio Data:** speech-to-text runs on-device (Web Speech / Apple Speech). If you
  conclude no raw audio leaves the device, you do **not** declare Audio Data — declare
  the resulting transcript under **User Content**. Confirm before submitting.
- No Health, Financial, Browsing History, Purchases, or Diagnostics-for-tracking.
- [ ] Set **Privacy Policy URL** in ASC metadata → `https://home-plus-lyart.vercel.app/privacy`.
- [ ] After deploy, confirm `/privacy` and `/terms` load in prod (Vercel rewrites — R3).

---

## X1 — On-device UIScene verification (Xcode + real device, NOT code)
The SceneDelegate/AppDelegate code is correct but never run in Xcode. Before archiving:

- [ ] Cold launch on a real iPhone — no black/white stuck launch screen.
- [ ] Background → foreground restores state.
- [ ] Light **and** dark mode: overscroll/rubber-band background color matches the app
      (no white flash) at top and bottom of a scroll view.
- [ ] Rotate iPad (TARGETED_DEVICE_FAMILY = 1,2) — split/full layout holds.
- [ ] Deep-link / universal-link still opens (URL + userActivity forwarding).
- [ ] Voice button: mic + speech permission prompts appear and function on device.

---

## U1 — contrast RESOLVED in code (2026-06-09); one subjective check remains
Computed WCAG ratios from the theme variables (script reproducible) and fixed every
AA text failure:
- Light `--accent` 196,77,46 (4.31:1) → **188,73,43** (4.64:1 as text).
- Dark `--text-muted` 138,131,119 (4.00:1 on cards) → **152,145,133** (4.81:1).
- Dark filled-button white text was 3.10:1. Added a dedicated **`--accent-strong`**
  (light = accent; dark = 188,86,52) used by all filled buttons → white text now
  **5.09:1 light / 4.65:1 dark**. Accent stays "lifted" for text/icons.
- Faint habit-heatmap tints fail the 3:1 *non-text* rule but are decorative and carry
  a border boundary by design — left as-is intentionally.

Remaining (subjective, device): confirm Lora (`font-display`) legibility at the
smallest sizes (`text-xs`/`text-sm`) on a real screen.
