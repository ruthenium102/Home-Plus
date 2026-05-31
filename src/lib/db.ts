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

  // family_members carries some server-authoritative / non-existent columns on
  // the TS type that must NOT be written by a generic client upsert:
  //   • pin_hash   — demo-mode-only local field; the column was dropped server
  //                  side (S1). PINs are set via the set_member_pin RPC.
  //   • has_pin    — maintained server-side by the PIN RPCs.
  //   • reward_balances — server-authoritative (S3); writes blocked by
  //                  trg_guard_reward_balances and only change via reward RPCs.
  let payload: unknown = data;
  if (table === 'family_members') {
    const { pin_hash: _ph, has_pin: _hp, reward_balances: _rb, ...rest } =
      data as unknown as Record<string, unknown>;
    void _ph; void _hp; void _rb;
    payload = rest;
  }

  supabase
    .from(table)
    .upsert(payload as Tables[T]['Insert'])
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
// PIN RPCs (S1) — the bcrypt hash lives only in the SECURITY-DEFINER-only
// member_pins table, so set/verify must go through these RPCs in cloud mode.
// Demo mode (no supabase) is handled by the callers via hashPinSync.
// ---------------------------------------------------------------------------

/** True when a real Supabase backend is wired up (cloud mode). */
export function isCloud(): boolean {
  return !!supabase;
}

/** Cloud-mode: set or clear a member's PIN via the server RPC. */
export async function rpcSetMemberPin(memberId: string, pin: string | null): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('set_member_pin', { member: memberId, pin });
  if (error) {
    onWriteError?.({ table: 'member_pins', op: 'upsert', message: error.message });
    throw new Error(error.message);
  }
}

/** Cloud-mode: verify a PIN server-side. Returns true on match / no-PIN. */
export async function rpcVerifyMemberPin(memberId: string, pin: string): Promise<boolean> {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('verify_member_pin', { member: memberId, pin });
  if (error) {
    console.warn('[db] verify_member_pin:', error.message);
    return false;
  }
  return data === true;
}

// ---------------------------------------------------------------------------
// Reward RPCs (S3) — reward_balances is server-authoritative; spends and
// approval transitions must go through these SECURITY DEFINER RPCs in cloud
// mode. Demo mode mutates local state directly in the callers.
// ---------------------------------------------------------------------------

/** Cloud-mode: create a redemption (and debit balance if pre-approved). */
export async function rpcRedeemReward(
  memberId: string,
  category: string,
  amount: number,
  reason: string,
  status: 'pending_approval' | 'approved',
): Promise<Redemption | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('redeem_reward', {
    p_member: memberId,
    p_category: category,
    p_amount: amount,
    p_reason: reason,
    p_status: status,
  });
  if (error) {
    onWriteError?.({ table: 'redemptions', op: 'upsert', message: error.message });
    throw new Error(error.message);
  }
  return (data as Redemption) ?? null;
}

/** Cloud-mode: parent approve/reject of a pending redemption (debits on approve). */
export async function rpcSetRedemptionStatus(
  id: string,
  status: 'approved' | 'rejected',
): Promise<Redemption | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('set_redemption_status', { p_id: id, p_status: status });
  if (error) {
    onWriteError?.({ table: 'redemptions', op: 'upsert', message: error.message });
    throw new Error(error.message);
  }
  return (data as Redemption) ?? null;
}

/** Cloud-mode: credit (1) or reverse (-1) a chore payout to a member's balance. */
export async function rpcApplyChorePayout(
  memberId: string,
  payout: Record<string, number>,
  direction: 1 | -1,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('apply_chore_payout', {
    p_member: memberId,
    p_payout: payout,
    p_direction: direction,
  });
  if (error) {
    onWriteError?.({ table: 'family_members', op: 'upsert', message: error.message });
    throw new Error(error.message);
  }
}

/** Cloud-mode: parent approve/reject of a pending chore completion (credits on approve). */
export async function rpcSetCompletionStatus(
  id: string,
  status: 'approved' | 'rejected',
): Promise<ChoreCompletion | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('set_completion_status', { p_id: id, p_status: status });
  if (error) {
    onWriteError?.({ table: 'chore_completions', op: 'upsert', message: error.message });
    throw new Error(error.message);
  }
  return (data as ChoreCompletion) ?? null;
}

// ---------------------------------------------------------------------------
// Bulk load
// ---------------------------------------------------------------------------

// A1 — date-window the five hot, ever-growing tables so a bulk load (which
// runs on every auth event, tab-resume, and on the periodic poll) doesn't
// re-fetch the family's entire history each time. 90 days is chosen because
// it is the largest window any UI surface reads: the Habits and Chores stats
// pages show a rolling 3-month heatmap, and My Day / rewards are today- or
// recent-focused. Anything older is historical and not rendered.
//
// Correctness guards:
//   • events       — we keep ALL future events (no upper bound) plus the last
//     90 days, AND every recurring event (recurrence not null) regardless of
//     its anchor start_at, because an old recurring series still fires today.
//   • completions / check-ins / day-plan blocks — filtered on their date
//     column (for_date / date), which is exactly what the heatmaps read.
//   • redemptions  — filtered on created_at. Balances are server-authoritative
//     (S3), so the client never recomputes them from full redemption history;
//     the window only affects the visible reward-history list.
export const LOAD_WINDOW_DAYS = 90;

/** ISO timestamp for (now - LOAD_WINDOW_DAYS), used as the lower bound. */
export function loadWindowSince(): string {
  return new Date(Date.now() - LOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** YYYY-MM-DD for (now - LOAD_WINDOW_DAYS), for date-typed columns. */
export function loadWindowSinceDate(): string {
  return loadWindowSince().slice(0, 10);
}

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
  const since = loadWindowSince();
  const sinceDate = loadWindowSinceDate();
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
      // events: last 90d of starts + ALL future + every recurring series (A1).
      supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .or(`start_at.gte.${since},recurrence.not.is.null`),
      supabase.from('chores').select('*').eq('family_id', familyId),
      supabase
        .from('chore_completions')
        .select('*')
        .eq('family_id', familyId)
        .gte('for_date', sinceDate),
      supabase.from('todo_lists').select('*').eq('family_id', familyId),
      supabase.from('todo_items').select('*').eq('family_id', familyId),
      supabase.from('habits').select('*').eq('family_id', familyId),
      supabase
        .from('habit_check_ins')
        .select('*')
        .eq('family_id', familyId)
        .gte('for_date', sinceDate),
      supabase.from('reward_goals').select('*').eq('family_id', familyId),
      supabase
        .from('redemptions')
        .select('*')
        .eq('family_id', familyId)
        .gte('created_at', since),
      supabase
        .from('day_plan_blocks')
        .select('*')
        .eq('family_id', familyId)
        .gte('date', sinceDate),
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

  // Strip demo-only / server-managed columns (see dbUpsert): pin_hash was
  // dropped server side, has_pin is RPC-maintained.
  const { pin_hash: _ph, has_pin: _hp, ...memberRow } =
    member as FamilyMember & { pin_hash?: string | null };
  void _ph; void _hp;
  const { error: me } = await supabase.from('family_members').insert({
    ...memberRow,
    auth_user_id: ownerUserId,
  });
  if (me) console.warn('[db] createMember:', me.message);
}
