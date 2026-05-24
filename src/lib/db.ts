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
import type { Database } from '@/types/supabase';
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
  Recipe,
  MealPlan,
} from '@/types';

type Tables = Database['public']['Tables'];
type TableName = keyof Tables;

// ---------------------------------------------------------------------------
// Pending-write tracking
// ---------------------------------------------------------------------------
// Writes are fire-and-forget, but reads (poll, visibility refresh, realtime
// echoes) can race ahead of the network round-trip and overwrite optimistic
// local state with stale rows. We mark every write as "pending" for a short
// window, and merge logic upstream skips overwriting these rows.
//
// We hold the marker for a brief tail after the server ACK so the next poll
// (which may have snapshotted just before the commit landed) still treats the
// row as pending.

const PENDING_TTL_MS = 10_000;
const PENDING_TAIL_MS = 2_500;
const pending: Map<string, Map<string, number>> = new Map();

function markPending(table: string, id: string) {
  let m = pending.get(table);
  if (!m) {
    m = new Map();
    pending.set(table, m);
  }
  m.set(id, Date.now());
}

function tailPending(table: string, id: string) {
  // Reset the timestamp so the row stays pending for PENDING_TAIL_MS after ACK.
  const m = pending.get(table);
  if (!m || !m.has(id)) return;
  m.set(id, Date.now() - (PENDING_TTL_MS - PENDING_TAIL_MS));
}

export function isPendingWrite(table: string, id: string): boolean {
  const m = pending.get(table);
  if (!m) return false;
  const t = m.get(id);
  if (t === undefined) return false;
  if (Date.now() - t > PENDING_TTL_MS) {
    m.delete(id);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

// Module-level error handler — wired up by FamilyContext to surface failed
// writes via the toast system, so silent Supabase rejections (RLS, schema
// mismatch, enum violation) become visible to the user instead of just
// disappearing local state.
let onWriteError: ((info: { table: string; op: 'upsert' | 'delete'; message: string }) => void) | null = null;

export function setDbErrorHandler(
  fn: ((info: { table: string; op: 'upsert' | 'delete'; message: string }) => void) | null,
): void {
  onWriteError = fn;
}

export function dbUpsert<T extends TableName>(table: T, data: Tables[T]['Insert']): void {
  const id = typeof (data as { id?: unknown }).id === 'string' ? (data as { id: string }).id : null;
  if (id) markPending(table, id);
  if (!supabase) return;
  supabase
    .from(table)
    .upsert(data)
    .then(({ error }) => {
      if (error) {
        console.warn(`[db] upsert ${table}:`, error.message);
        onWriteError?.({ table, op: 'upsert', message: error.message });
      }
      if (id) tailPending(table, id);
    });
}

export function dbDelete(table: TableName, id: string): void {
  markPending(table, id);
  if (!supabase) return;
  supabase
    .from(table)
    .delete()
    .eq('id', id)
    .then(({ error }) => {
      if (error) {
        console.warn(`[db] delete ${table}:`, error.message);
        onWriteError?.({ table, op: 'delete', message: error.message });
      }
      tailPending(table, id);
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
  recipes: Recipe[];
  mealPlans: MealPlan[];
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
      { data: recipes },
      { data: mealPlans },
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
      supabase.from('recipes').select('*').eq('family_id', familyId),
      supabase.from('meal_plans').select('*').eq('family_id', familyId),
    ]);

    if (fe || !family) return null;

    return {
      family,
      members: members ?? [],
      events: events ?? [],
      chores: chores ?? [],
      completions: completions ?? [],
      lists: lists ?? [],
      listItems: listItems ?? [],
      habits: habits ?? [],
      checkIns: checkIns ?? [],
      goals: goals ?? [],
      redemptions: redemptions ?? [],
      dayPlanBlocks: dayPlanBlocks ?? [],
      activityPool: activityPool ?? [],
      recipes: recipes ?? [],
      mealPlans: mealPlans ?? [],
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
  if (fe) {
    console.warn('[db] createFamily:', fe.message);
    return;
  }

  const { error: me } = await supabase.from('family_members').insert({
    ...member,
    auth_user_id: ownerUserId,
  });
  if (me) console.warn('[db] createMember:', me.message);
}
