-- v25 — fix broken first-family bootstrap (RLS chicken-and-egg, take 2)
--
-- The family_members INSERT owner-exception (v14) lets a brand-new family
-- owner insert their own first parent row by checking
--   EXISTS (SELECT 1 FROM families f WHERE f.id = family_id
--             AND f.owner_user_id = auth.uid())
-- but that subquery runs as the CALLER, so the families SELECT policy applies
-- inside it — and "Member can read family" (is_family_member only) hides the
-- just-created family from its not-yet-member owner. Net effect: a fresh
-- signup could INSERT the families row but never their first member row, so
-- new-user onboarding dead-ends. (Existing families predate this policy
-- combination, which is why it went unnoticed.)
--
-- Fix: an owner can always SELECT their own family. Idempotent.

drop policy if exists "Member can read family" on families;
create policy "Member can read family" on families
  for select using (public.is_family_member(id) or owner_user_id = auth.uid());
