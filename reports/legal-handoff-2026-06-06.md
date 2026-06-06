# Legal blockers L1 / L2 / L4 — handoff (2026-06-06)

This documents what was implemented in code for the legal/privacy release blockers,
and the items that **cannot be done in code** and require a human / lawyer before
public launch or App Store submission.

Related: `reports/release-review-2026-05-30.md` (original blocker list),
`project_release_blockers_status` memory.

---

## What shipped in code (this pass)

**L1 — Privacy Policy**
- Drafted, app-specific policy at `public/privacy.html`, served at `/privacy`
  (Vercel rewrite added in `vercel.json`).
- Linked from the auth screen footer and from Settings → Legal.

**L2 — Terms of Service + acceptance**
- Drafted ToS at `public/terms.html`, served at `/terms`.
- Affirmative **acceptance checkbox** added to the sign-up form (`AuthPage`).
  Sign-up is blocked until it is ticked.
- Acceptance is recorded as timestamps in Supabase auth `user_metadata` and copied
  onto the `families` row: `tos_accepted_at`, `privacy_accepted_at`,
  `owner_attested_adult_at` (migration `migrate_v20.sql`, applied).

**L4 — Children's-data consent (MVP)**
- Sign-up now carries an 18+ parent/guardian attestation for new families
  (`owner_attested_adult_at`).
- Adding a child profile requires an explicit **parental consent** checkbox, with an
  optional, separate **voice** consent toggle (`AddMemberModal`). Stored per child on
  `family_members.parental_consent_at` / `voice_consent_at` (migration v20).
- **Voice is off by default for children.** `useVoiceIntake` blocks any voice command
  from a child profile unless `voice_consent_at` is set — so no child transcript is
  sent to the AI sub-processor (Anthropic) without recorded parental consent.
- Parents can grant/revoke a child's voice consent later in Edit member → Privacy &
  consent.

> Note on "age-appropriate defaults" (UK-AADC): the genuinely third-party / data-sharing
> default — sending a child's voice to Anthropic — is now **off by default** and
> per-child opt-in. The existing per-member page toggles (chores/habits/pet/etc.) are
> in-app visibility switches, not external data sharing, so they were left as-is. Revisit
> with the DPIA if the lawyer wants stricter defaults.

---

## Still required — NOT code (lawyer / operator track)

These block a compliant US/UK/EU launch and App Store submission. None can be done by
editing the app.

1. **Legal review of the drafted copy.** `privacy.html` and `terms.html` are drafts and
   contain `[BRACKETED]` placeholders that MUST be completed before launch:
   - `[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`, `[PRIVACY CONTACT EMAIL]` /
     `[CONTACT EMAIL]`, `[GOVERNING JURISDICTION]`.
   - All `[LAWYER REVIEW: …]` notes resolved/removed.

2. **Sign Data Processing Agreements (DPAs)** with every sub-processor and confirm
   international-transfer safeguards (e.g. SCCs):
   - **Supabase** (DB/auth/storage — data hosted AWS ap-northeast-1, Tokyo)
   - **Anthropic** (voice intake) — and enable the **no-training** option
   - **Google** (Calendar sync)
   - **Resend** (transactional email)
   - **Vercel** (hosting), **Open-Meteo** (weather)

3. **COPPA verifiable parental consent (US).** The in-app attestation + per-child consent
   is an MVP, not full COPPA VPC. Decide whether to (a) implement a VPC method
   (credit-card/ID/etc.) or (b) restrict the product's child use / markets. Block voice
   for child profiles until VPC is in place if targeting the US — note the voice gate is
   already wired and keyed on `voice_consent_at`.

4. **UK Age-Appropriate Design Code (Children's Code).** Complete a **DPIA** and confirm
   age-appropriate defaults are sufficient.

5. **GDPR-K (EU).** Confirm Art. 8 parental-consent mechanism and lawful basis per market.

6. **App Store Connect — App Privacy "nutrition" labels.** Populate: Contact Info, User
   Content, Identifiers, Audio Data, Location, Sensitive/Children; mark all
   not-used-for-tracking. (Tracked separately as the iOS submission step.)

7. **Link the Privacy Policy URL in App Store Connect metadata** →
   `https://home-plus-lyart.vercel.app/privacy` (also satisfies R6).

---

## Verify before submission
- `/privacy` and `/terms` resolve in production after deploy (Vercel rewrites).
- A fresh sign-up writes `tos_accepted_at` / `owner_attested_adult_at` on the `families`
  row.
- Adding a child without ticking consent is blocked; voice on a child profile is blocked
  until a parent enables it.
