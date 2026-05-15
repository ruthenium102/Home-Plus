-- Home Plus — Migration v1
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (all statements use IF NOT EXISTS / OR REPLACE).

-- ============================================================================
-- 1. New columns on family_members
-- ============================================================================
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS pet_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 2. Habit count mode
-- ============================================================================
ALTER TABLE habits ADD COLUMN IF NOT EXISTS count_mode BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS daily_target INTEGER NOT NULL DEFAULT 1;

-- Allow multiple check-ins per day to be stored as count on a single row.
-- The unique constraint (habit_id, member_id, for_date) is kept; we increment count.
ALTER TABLE habit_check_ins ADD COLUMN IF NOT EXISTS count INTEGER NOT NULL DEFAULT 1;

-- ============================================================================
-- 3. Virtual pets table
-- ============================================================================
CREATE TABLE IF NOT EXISTS virtual_pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  animal TEXT NOT NULL,
  name TEXT NOT NULL,
  hunger INTEGER NOT NULL DEFAULT 100,
  hydration INTEGER NOT NULL DEFAULT 100,
  happiness INTEGER NOT NULL DEFAULT 100,
  xp INTEGER NOT NULL DEFAULT 0,
  last_fed_at TIMESTAMPTZ,
  last_watered_at TIMESTAMPTZ,
  last_played_at TIMESTAMPTZ,
  rewards_unlocked TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, member_id)
);
ALTER TABLE virtual_pets ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. Fix accept_invitation to also save the invitee's email
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_invitation(p_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv invitations%rowtype;
  user_email TEXT;
  linked INT;
BEGIN
  SELECT * INTO inv
  FROM invitations
  WHERE token = p_token AND accepted_at IS NULL AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or expired';
  END IF;

  -- Retrieve the authenticated user's email
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  -- Link to existing placeholder member if name matches
  UPDATE family_members
  SET auth_user_id = auth.uid(),
      email = COALESCE(user_email, email)
  WHERE family_id = inv.family_id
    AND lower(name) = lower(COALESCE(inv.name, ''))
    AND auth_user_id IS NULL;

  GET DIAGNOSTICS linked = ROW_COUNT;

  -- Otherwise insert a new member row
  IF linked = 0 THEN
    INSERT INTO family_members (family_id, name, role, color, auth_user_id, email)
    VALUES (
      inv.family_id,
      COALESCE(inv.name, split_part(COALESCE(user_email, 'Member'), '@', 1)),
      'child', 'sage', auth.uid(), user_email
    );
  END IF;

  UPDATE invitations SET accepted_at = NOW() WHERE token = p_token;
END;
$$;

-- ============================================================================
-- 5. RLS: allow invited family members to access family data
--
-- Root cause of "shared lists not visible on iPhone":
-- The original RLS required owner_user_id = auth.uid() for all access.
-- Invited members have their own auth account (different uid) and were blocked.
--
-- Fix: add additional SELECT policy on family_members so invited members can
-- identify themselves, then update all other table policies to allow any member.
-- ============================================================================

-- 5a. family_members: let members read their own row (needed for RLS chain)
DROP POLICY IF EXISTS "Member can read own row" ON family_members;
CREATE POLICY "Member can read own row" ON family_members
  FOR SELECT USING (auth_user_id = auth.uid());

-- 5b. family_members: let members update their own row (pet interactions, etc.)
DROP POLICY IF EXISTS "Member can update own row" ON family_members;
CREATE POLICY "Member can update own row" ON family_members
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 5c. families: let members read the family record
DROP POLICY IF EXISTS "Member can read family" ON families;
CREATE POLICY "Member can read family" ON families
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = id AND fm.auth_user_id = auth.uid()
    )
  );

-- 5d. All data tables: allow any authenticated family member to manage data.
-- The subquery on family_members is now allowed because of policy 5a above.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'events', 'todo_lists', 'todo_items',
    'habits', 'habit_check_ins',
    'chores', 'chore_completions',
    'redemptions', 'reward_goals', 'reward_categories',
    'day_plan_blocks', 'activity_pool_items',
    'virtual_pets'
  ])
  LOOP
    -- Drop old owner-only policies
    EXECUTE format('DROP POLICY IF EXISTS "Owner manages %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "family members can manage %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "family members can manage day plan blocks" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "family members can manage activity pool" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Family members manage %1$s" ON %1$s', tbl);

    -- Create new policy: owner OR any authenticated family member
    EXECUTE format($policy$
      CREATE POLICY "Family members manage %1$s" ON %1$s
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM families f
            WHERE f.id = %1$s.family_id AND f.owner_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM family_members fm
            WHERE fm.family_id = %1$s.family_id AND fm.auth_user_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM families f
            WHERE f.id = %1$s.family_id AND f.owner_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM family_members fm
            WHERE fm.family_id = %1$s.family_id AND fm.auth_user_id = auth.uid()
          )
        );
    $policy$, tbl);
  END LOOP;
END$$;
