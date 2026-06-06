-- Home Plus — Migration v20
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- Legal / privacy consent capture (release blockers L1, L2, L4):
--
--  1. families.tos_accepted_at / privacy_accepted_at — the account holder's
--     affirmative acceptance of the Terms of Service and Privacy Policy,
--     captured at sign-up (L1, L2). An audit timestamp, not a flag, so we can
--     evidence *when* acceptance happened.
--
--  2. families.owner_attested_adult_at — the sign-up attestation that the
--     account holder is 18+ and the parent/guardian setting up the household
--     (the COPPA/UK-AADC/GDPR-K "verified adult" gate at the family level).
--
--  3. family_members.parental_consent_at — per-child: the parent's explicit
--     consent to process THIS child's data, captured when the child profile is
--     created. NULL = no consent recorded.
--
--  4. family_members.voice_consent_at — per-child: explicit, separate consent
--     to use voice commands for this child, which sends short voice transcripts
--     to our AI sub-processor (Anthropic). NULL = voice intake is blocked for
--     this child profile. Off by default (age-appropriate default, UK-AADC).

do $$ begin
  alter table families
    add column if not exists tos_accepted_at         timestamptz,
    add column if not exists privacy_accepted_at      timestamptz,
    add column if not exists owner_attested_adult_at  timestamptz;

  alter table family_members
    add column if not exists parental_consent_at      timestamptz,
    add column if not exists voice_consent_at         timestamptz;
end $$;

notify pgrst, 'reload schema';
