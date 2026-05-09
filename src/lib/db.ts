/**
 * Supabase CRUD helpers for Home Plus.
 *
 * All writes are fire-and-forget (optimistic local state wins; Supabase is the
 * sync backend). All reads are used at auth time to hydrate state from the DB.
 *
 * Table name mapping (Supabase → TypeScript):
 *   events           → CalendarEvent
 *   habit_check_ins  → HabitCheckIn   (note underscore)
 *   families.owner_user_id is never stored on the Family TS type — passed separately on insert
 */

import { supabase } from './supabase';
import type {
  Family,
  FamilyMember,
  CalendarEvent,
  Chore,
  ChoreCompletion,
  TodoList,
  TodoItem,
  Habit,
  HabitCheckIn,
  RewardGoal,
  Redemption,
  DayPlanBlock,
  ActivityPoolItem,
} from '@/types';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export function dbUpsert(table: string, data: Record<string, unknown>): void {
  if (!supabase) return;
  supabase.from(table).upsert(data).then(({ error }) => {
    if (error) console.warn(`[db] upsert ${table}:`, error.message);
  });
}

export function dbDelete(table: string, id: string): void {
  if (!supabase) return;
  supabase.from(table).delete().eq('id', id).then(({ error }) => {
    if (error) console.warn(`[db] delete ${table}:`, error.message);
  });
}

// ---------------------------------------------------------------------------
// Bulk load
// ---------------------------------------------------------------------------

export interface FamilyData {
  family: Family;
  members: FamilyMember[];
  events: CalendarEvent[];
  chores: Chore[];
  completions: ChoreCompletion[];
  lists: TodoList[];
  listItems: TodoItem[];
  habits: Habit[];
  checkIns: HabitCheckIn[];
  goals: RewardGoal[];
  redemptions: Redemption[];
  dayPlanBlocks: DayPlanBlock[];
  activityPool: ActivityPoolItem[];
}

export async function dbLoadFamily(familyId: string): Promise<FamilyData | null> {
  if (!supabase) return null;
  try {
    const [
      { data: family, error: fe },
      { data: members },
      { data: events },
      { data: chores },
      { data: completions },
      { data: lists },
      { data: listItems },
      { data: habits },
      { data: checkIns },
      { data: goals },
      { data: redemptions },
      { data: dayPlanBlocks },
      { data: activityPool },
    ] = await Promise.all([
      supabase.from('families').select('id,name,timezone,created_at').eq('id', familyId).single(),
      supabase.from('family_members').select('*').eq('family_id', familyId),
      supabase.from('events').select('*').eq('family_id', familyId),
      supabase.from('chores').select('*').eq('family_id', familyId),
      supabase.from('chore_completions').select('*').eq('family_id', familyId),
      supabase.from('todo_lists').select('*').eq('family_id', familyId),
      supabase.from('todo_items').select('*').eq('family_id', familyId),
      supabase.from('habits').select('*').eq('family_id', familyId),
      supabase.from('habit_check_ins').select('*').eq('family_id', familyId),
      supabase.from('reward_goals').select('*').eq('family_id', familyId),
      supabase.from('redemptions').select('*').eq('family_id', familyId),
      supabase.from('day_plan_blocks').select('*').eq('family_id', familyId),
      supabase.from('activity_pool_items').select('*').eq('family_id', familyId),
    ]);

    if (fe || !family) return null;

    return {
      family: family as unknown as Family,
      members: (members ?? []) as unknown as FamilyMember[],
      events: (events ?? []) as unknown as CalendarEvent[],
      chores: (chores ?? []) as unknown as Chore[],
      completions: (completions ?? []) as unknown as ChoreCompletion[],
      lists: (lists ?? []) as unknown as TodoList[],
      listItems: (listItems ?? []) as unknown as TodoItem[],
      habits: (habits ?? []) as unknown as Habit[],
      checkIns: (checkIns ?? []) as unknown as HabitCheckIn[],
      goals: (goals ?? []) as unknown as RewardGoal[],
      redemptions: (redemptions ?? []) as unknown as Redemption[],
      dayPlanBlocks: (dayPlanBlocks ?? []) as unknown as DayPlanBlock[],
      activityPool: (activityPool ?? []) as unknown as ActivityPoolItem[],
    };
  } catch (e) {
    console.warn('[db] loadFamily error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Family bootstrap — called once when user signs up or logs in fresh
// ---------------------------------------------------------------------------

export async function dbCreateFamily(
  family: Family,
  member: FamilyMember,
  ownerUserId: string,
): Promise<void> {
  if (!supabase) return;
  const { error: fe } = await supabase.from('families').insert({
    id: family.id,
    name: family.name,
    timezone: family.timezone,
    owner_user_id: ownerUserId,
    created_at: family.created_at,
  });
  if (fe) { console.warn('[db] createFamily:', fe.message); return; }

  const { error: me } = await supabase.from('family_members').insert({
    ...member,
    auth_user_id: ownerUserId,
  });
  if (me) console.warn('[db] createMember:', me.message);
}
