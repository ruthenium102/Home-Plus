import { localISO } from '@/lib/dates';
import type { Habit, HabitCheckIn } from '@/types';

/**
 * Is this habit "due" today based on its cadence?
 * Used to know whether to show a tickable check-in box on the habit grid.
 */
export function isHabitDue(habit: Habit, date: Date): boolean {
  if (habit.archived) return false;
  const dow = date.getDay(); // 0=Sun..6=Sat
  switch (habit.cadence) {
    case 'daily':
      return true;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekend':
      return dow === 0 || dow === 6;
    case 'weekly':
      // Weekly habits are "due" any day in the week — UI can decide where to show
      return true;
    case 'pick_days':
      // Empty weekdays = treat like daily (defensive fallback).
      return !habit.weekdays || habit.weekdays.length === 0 ? true : habit.weekdays.includes(dow);
    default:
      return false;
  }
}

/**
 * Number of consecutive days the habit has been checked in, ending today.
 * If today isn't checked yet, the streak counts back from yesterday.
 */
export function computeHabitStreak(
  checkIns: HabitCheckIn[],
  habitId: string,
  memberId: string,
): number {
  const dates = new Set(
    checkIns
      .filter((c) => c.habit_id === habitId && c.member_id === memberId)
      .map((c) => c.for_date),
  );
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const iso = localISO(cursor);
    if (dates.has(iso)) {
      streak++;
    } else if (i === 0) {
      // Today not yet checked — that's fine, look at yesterday onwards
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Was this habit checked in on this date?
 */
export function isCheckedIn(
  checkIns: HabitCheckIn[],
  habitId: string,
  memberId: string,
  date: Date,
): boolean {
  const iso = localISO(date);
  return checkIns.some(
    (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === iso,
  );
}

/**
 * Last 7 days of check-in status — used for the heatmap visualisation.
 * Returns an array of { date, checked } from oldest to newest.
 */
export function lastNDays(
  checkIns: HabitCheckIn[],
  habitId: string,
  memberId: string,
  n: number,
): { date: string; checked: boolean }[] {
  const out: { date: string; checked: boolean }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const iso = localISO(cursor);
    out.push({
      date: iso,
      checked: checkIns.some(
        (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === iso,
      ),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Filter visible habits for the active member. Their own habits + any
 * shared habits from other family members.
 */
export function visibleHabits(habits: Habit[], activeMemberId: string): Habit[] {
  return habits.filter(
    (h) => !h.archived && (h.member_id === activeMemberId || h.visibility === 'shared'),
  );
}

/**
 * Does `count` satisfy the habit's target given its comparison operator?
 * Defaults to 'gte' (at least) to match historical behaviour when target_op
 * is missing on older rows.
 */
export function targetMet(count: number, target: number, op?: Habit['target_op']): boolean {
  switch (op ?? 'gte') {
    case 'lte':
      return count <= target;
    case 'eq':
      return count === target;
    case 'gte':
    default:
      return count >= target;
  }
}

/** "≥ 3/day" style label. */
export function targetLabel(target: number, op?: Habit['target_op']): string {
  const sym = op === 'lte' ? '≤' : op === 'eq' ? '=' : '≥';
  return `${sym} ${target}/day`;
}

export function nextStreakMilestone(streak: number): number {
  const milestones = [7, 30, 100, 365];
  return milestones.find((m) => m > streak) ?? streak + 100;
}

/**
 * What to show for a single habit-day cell — independent of the comparison
 * operator. 'met' = within bounds with activity (green). 'violated' = out of
 * bounds (orange). 'empty' = no activity AND zero would still satisfy the
 * target (e.g. ≤ N habits before any data lands).
 */
export type HabitCellState = 'met' | 'violated' | 'empty';

export function habitCellState(
  count: number,
  target: number,
  op?: Habit['target_op'],
): HabitCellState {
  // For "at most N" habits, zero is the success state — the user didn't do
  // the thing they were trying to limit. So lte ignores the no-entries
  // neutral branch and lets targetMet decide.
  if (op === 'lte') return targetMet(count, target, op) ? 'met' : 'violated';
  // gte / eq: no entries = neutral. We don't claim a day as "missed" until
  // something has been logged — the existing streak/totals already signal
  // under-tracking elsewhere in the UI.
  if (count === 0) return 'empty';
  return targetMet(count, target, op) ? 'met' : 'violated';
}

// ----------------------------------------------------------------------------
// History / analytics
// ----------------------------------------------------------------------------

/** Habit's first-day ISO in local time (derived from created_at). */
export function habitStartISO(habit: Habit): string {
  return localISO(new Date(habit.created_at));
}

/** Enumerate ISO dates from `fromISO` to `toISO` inclusive, chronologically. */
function eachISO(fromISO: string, toISO: string): string[] {
  if (fromISO > toISO) return [];
  const out: string[] = [];
  const cursor = new Date(fromISO + 'T00:00:00');
  const end = new Date(toISO + 'T00:00:00');
  while (cursor <= end) {
    out.push(localISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Build a date→sum-of-counts map for one habit+member. */
function countsByDate(
  checkIns: HabitCheckIn[],
  habitId: string,
  memberId: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of checkIns) {
    if (c.habit_id !== habitId || c.member_id !== memberId) continue;
    out.set(c.for_date, (out.get(c.for_date) ?? 0) + (c.count ?? 1));
  }
  return out;
}

export interface HabitRangeStats {
  daysDue: number;
  daysMet: number;
  totalCount: number;
  successRate: number;
}

/**
 * Aggregated stats over `[fromISO, toISO]`. Range is automatically clamped so
 * it never starts before the habit was created. Days where the habit wasn't
 * due but the target was still met count as bonus due+met so the success
 * percentage stays bounded by 100%.
 */
export function habitRangeStats(
  habit: Habit,
  checkIns: HabitCheckIn[],
  memberId: string,
  fromISO: string,
  toISO: string,
): HabitRangeStats {
  const start = fromISO > habitStartISO(habit) ? fromISO : habitStartISO(habit);
  if (start > toISO) {
    return { daysDue: 0, daysMet: 0, totalCount: 0, successRate: 0 };
  }
  const target = habit.daily_target ?? 1;
  const counts = countsByDate(checkIns, habit.id, memberId);
  let daysDue = 0;
  let daysMet = 0;
  let totalCount = 0;
  for (const iso of eachISO(start, toISO)) {
    const dt = new Date(iso + 'T00:00:00');
    const count = counts.get(iso) ?? 0;
    totalCount += count;
    const due = isHabitDue(habit, dt);
    // For "at most N" habits, zero counts as a met day — the user successfully
    // didn't do the thing. gte/eq still need a real entry to count as met.
    const met =
      habit.target_op === 'lte'
        ? targetMet(count, target, habit.target_op)
        : count > 0 && targetMet(count, target, habit.target_op);
    if (due) {
      daysDue++;
      if (met) daysMet++;
    } else if (met) {
      daysDue++;
      daysMet++;
    }
  }
  return {
    daysDue,
    daysMet,
    totalCount,
    successRate: daysDue === 0 ? 0 : daysMet / daysDue,
  };
}

/**
 * Longest run of consecutive days with any check-in. Mirrors the existence-
 * based semantics of `computeHabitStreak` so "current" and "best" line up.
 */
export function longestHabitStreak(
  checkIns: HabitCheckIn[],
  habitId: string,
  memberId: string,
): number {
  const dates = Array.from(
    new Set(
      checkIns
        .filter((c) => c.habit_id === habitId && c.member_id === memberId)
        .map((c) => c.for_date),
    ),
  ).sort();
  if (dates.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    prev.setDate(prev.getDate() + 1);
    if (localISO(prev) === dates[i]) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}

export interface HabitDayCell {
  date: string;
  count: number;
  state: HabitCellState;
  inRange: boolean; // false for cells before the habit's start date
}

/** One cell per day from `fromISO` → `toISO`. Used by the calendar heatmap. */
export function dailyCells(
  habit: Habit,
  checkIns: HabitCheckIn[],
  memberId: string,
  fromISO: string,
  toISO: string,
): HabitDayCell[] {
  const target = habit.daily_target ?? 1;
  const startISO = habitStartISO(habit);
  const counts = countsByDate(checkIns, habit.id, memberId);
  return eachISO(fromISO, toISO).map((date) => {
    const count = counts.get(date) ?? 0;
    return {
      date,
      count,
      state: habitCellState(count, target, habit.target_op),
      inRange: date >= startISO,
    };
  });
}

export interface HabitBucket {
  key: string;
  label: string;
  daysMet: number;
  daysDue: number;
  totalCount: number;
}

/**
 * Aggregate by week (Mon-anchored) or month. Bucket `key` is the bucket's
 * start ISO; `label` is a short human-readable string for axis ticks.
 */
export function aggregateBuckets(
  habit: Habit,
  checkIns: HabitCheckIn[],
  memberId: string,
  fromISO: string,
  toISO: string,
  by: 'week' | 'month',
): HabitBucket[] {
  const target = habit.daily_target ?? 1;
  const startISO = habitStartISO(habit);
  const counts = countsByDate(checkIns, habit.id, memberId);
  const out = new Map<string, { daysMet: number; daysDue: number; totalCount: number }>();
  const order: string[] = [];

  for (const iso of eachISO(fromISO, toISO)) {
    if (iso < startISO) continue;
    const dt = new Date(iso + 'T00:00:00');
    let key: string;
    if (by === 'week') {
      const dow = dt.getDay();
      const mondayOffset = dow === 0 ? 6 : dow - 1;
      const monday = new Date(dt);
      monday.setDate(monday.getDate() - mondayOffset);
      key = localISO(monday);
    } else {
      key = iso.slice(0, 7);
    }
    if (!out.has(key)) {
      out.set(key, { daysMet: 0, daysDue: 0, totalCount: 0 });
      order.push(key);
    }
    const bucket = out.get(key)!;
    const count = counts.get(iso) ?? 0;
    bucket.totalCount += count;
    const due = isHabitDue(habit, dt);
    const met =
      habit.target_op === 'lte'
        ? targetMet(count, target, habit.target_op)
        : count > 0 && targetMet(count, target, habit.target_op);
    if (due) {
      bucket.daysDue++;
      if (met) bucket.daysMet++;
    } else if (met) {
      bucket.daysDue++;
      bucket.daysMet++;
    }
  }

  return order.map((key) => {
    const b = out.get(key)!;
    let label: string;
    if (by === 'week') {
      const d = new Date(key + 'T00:00:00');
      label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
      const [y, m] = key.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      label = d.toLocaleDateString(undefined, { month: 'short' });
    }
    return { key, label, ...b };
  });
}
