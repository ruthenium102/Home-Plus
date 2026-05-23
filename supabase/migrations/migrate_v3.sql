-- Home Plus — Migration v3
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.

-- Root cause this fixes:
-- The original schema.sql RLS used owner_user_id = auth.uid() everywhere,
-- which blocked any non-owner family member from reading family data.
-- migrate_v1.sql section 5 attempted to relax this with EXISTS subqueries
-- that referenced family_members from families and vice versa — but the
-- old "Owner manages members" policy on family_members still referenced
-- families, creating a "infinite recursion detected in policy" error
-- from Postgres at read time.
-- This migration replaces both sides with a SECURITY DEFINER helper that
-- bypasses RLS for the membership lookup, so there's no cross-table loop.

CREATE OR REPLACE FUNCTION public.user_family_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM family_members WHERE auth_user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.user_family_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_family_ids() TO authenticated;

-- families: drop the old recursive / owner-only policies and reapply.
DROP POLICY IF EXISTS "Member can read family" ON families;
DROP POLICY IF EXISTS "Owner manages family" ON families;
DROP POLICY IF EXISTS "Owner updates own family" ON families;
DROP POLICY IF EXISTS "Owner inserts own family" ON families;
DROP POLICY IF EXISTS "Owner deletes own family" ON families;

CREATE POLICY "Member can read family" ON families
  FOR SELECT USING (id IN (SELECT public.user_family_ids()));

CREATE POLICY "Owner updates own family" ON families
  FOR UPDATE USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owner inserts own family" ON families
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owner deletes own family" ON families
  FOR DELETE USING (owner_user_id = auth.uid());

-- family_members: drop the recursive policies and re-add non-recursive ones.
DROP POLICY IF EXISTS "Owner manages members" ON family_members;
DROP POLICY IF EXISTS "Member can read own row" ON family_members;
DROP POLICY IF EXISTS "Member can update own row" ON family_members;
DROP POLICY IF EXISTS "Member can read family members" ON family_members;
DROP POLICY IF EXISTS "Member can update family rows" ON family_members;
DROP POLICY IF EXISTS "Member can insert family rows" ON family_members;
DROP POLICY IF EXISTS "Member can delete family rows" ON family_members;

CREATE POLICY "Member can read family members" ON family_members
  FOR SELECT USING (family_id IN (SELECT public.user_family_ids()));

CREATE POLICY "Member can update own row" ON family_members
  FOR UPDATE USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Member can update family rows" ON family_members
  FOR UPDATE USING (family_id IN (SELECT public.user_family_ids()))
  WITH CHECK (family_id IN (SELECT public.user_family_ids()));

CREATE POLICY "Member can insert family rows" ON family_members
  FOR INSERT WITH CHECK (family_id IN (SELECT public.user_family_ids()));

CREATE POLICY "Member can delete family rows" ON family_members
  FOR DELETE USING (family_id IN (SELECT public.user_family_ids()));
