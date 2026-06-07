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
 * Number of consecutive days the habit's daily target was actually MET, ending
 * today. A day only extends the streak when its total count satisfies the
 * target for the habit's operator — so a day that goes over an ≤ N/day cap (or
 * falls short of a ≥ N/day goal) breaks the streak, matching how the stats and
 * heatmap score days. If today isn't satisfied yet, the streak counts back from
 * yesterday (today's tally may still be in progress).
 */
export function computeHabitStreak(
  habit: Habit,
  checkIns: HabitCheckIn[],
  memberId: string,
): number {
  const counts = countsByDate(checkIns, habit.id, memberId);
  const target = habit.daily_target ?? 1;
  const satisfied = (iso: string) => {
    const count = counts.get(iso) ?? 0;
    return count > 0 && targetMet(count, target, habit.target_op);
  };
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const iso = localISO(cursor);
    if (satisfied(iso)) {
      streak++;
    } else if (i === 0) {
      // Today not yet satisfied — that's fine, look at yesterday onwards.
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

/** "≥ 3/day" / "≥ 3/week" style label. */
export function targetLabel(
  target: number,
  op?: Habit['target_op'],
  period: 'day' | 'week' = 'day',
): string {
  const sym = op === 'lte' ? '≤' : op === 'eq' ? '=' : '≥';
  return `${sym} ${target}/${period === 'week' ? 'week' : 'day'}`;
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
  // No entries = neutral. We don't claim a day as "missed" until something
  // has been logged on or after it — for lte habits, zero is ambiguous
  // (could be success or could be no-log), so honest neutrality wins.
  if (count === 0) return 'empty';
  return targetMet(count, target, op) ? 'met' : 'violated';
}

/**
 * Background classes for one heatmap cell, shared by the Habits list and Stats.
 * `state` is the day's state (daily) or the week's state (weekly), `hasActivity`
 * is whether that day had any entry. Days with an entry get a solid fill; days
 * in a met/missed week with NO entry get a faint green/red tint (so the week
 * outcome reads without falsely "ticking" empty days); in-progress logged days
 * are a slightly darker grey than un-logged ones.
 */
export function habitCellClass(state: HabitCellState, hasActivity: boolean): string {
  if (state === 'met') {
    return hasActivity ? 'bg-emerald-400' : 'bg-emerald-400/20 border border-emerald-400/30';
  }
  if (state === 'violated') {
    return hasActivity ? 'bg-red-500' : 'bg-red-500/15 border border-red-500/25';
  }
  return hasActivity ? 'bg-text-faint/30' : 'bg-surface-3 border border-border/60';
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
  // Weekly habits are scored per-week, not per-day. daysDue/daysMet then hold
  // weeks (the Stats UI relabels the tile accordingly).
  if (habit.cadence === 'weekly') {
    return weeklyRangeStats(habit, checkIns, memberId, fromISO, toISO);
  }
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
    const met = count > 0 && targetMet(count, target, habit.target_op);
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
 * Longest run of consecutive days whose daily target was MET. Mirrors the
 * target-aware semantics of `computeHabitStreak` so "current" and "best" line up.
 */
export function longestHabitStreak(
  habit: Habit,
  checkIns: HabitCheckIn[],
  memberId: string,
): number {
  const counts = countsByDate(checkIns, habit.id, memberId);
  const target = habit.daily_target ?? 1;
  const dates = Array.from(counts.keys())
    .filter((iso) => {
      const count = counts.get(iso) ?? 0;
      return count > 0 && targetMet(count, target, habit.target_op);
    })
    .sort();
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
  // Weekly habits colour each day by its WEEK's compliance so the heatmap
  // reads as week-coloured columns (aligned to week_start).
  if (habit.cadence === 'weekly') {
    return weeklyCells(habit, checkIns, memberId, fromISO, toISO);
  }
  const target = habit.daily_target ?? 1;
  const startISO = habitStartISO(habit);
  const counts = countsByDate(checkIns, habit.id, memberId);
  return eachISO(fromISO, toISO).map((date) => {
    const count = counts.get(date) ?? 0;
    // Any day with a logged count is in range, even if it predates the
    // habit's created_at — the user backfilled it via the recent-counts
    // row, so it should render the same as any other tracked day.
    return {
      date,
      count,
      state: habitCellState(count, target, habit.target_op),
      inRange: date >= startISO || count > 0,
    };
  });
}

// ----------------------------------------------------------------------------
// Weekly targets
//
// A weekly habit's target (stored in daily_target) applies to the TOTAL count
// across its week window. The window is 7 days aligned to `week_start`
// (0=Sun..6=Sat, default Monday). Compliance is judged per week:
//   • gte/eq: a week can't be "missed" until it has fully ended (forgiving) —
//     in-progress weeks stay neutral until the target is reached.
//   • lte: the cap can be blown mid-week, so an over-cap week shows violated
//     immediately.
//   • The partial first week (habit created mid-week) only ever counts toward
//     success if it was met — it's never penalised.
//   • A completed week with zero logging stays neutral on the heatmap
//     (forgiving) but still counts as a miss in the success %.
// ----------------------------------------------------------------------------

/** First-day-of-week (0=Sun..6=Sat) for a weekly habit. Default Monday. */
export function habitWeekStart(habit: Habit): number {
  const v = habit.week_start;
  return v === null || v === undefined ? 1 : v;
}

/** Local midnight Date of the week-start day for the week containing `date`. */
export function startOfHabitWeek(date: Date, weekStart: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

/** Sum of counts across the 7 days starting at `weekStart`. */
function sumWeek(counts: Map<string, number>, weekStart: Date): number {
  let total = 0;
  const c = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    total += counts.get(localISO(c)) ?? 0;
    c.setDate(c.getDate() + 1);
  }
  return total;
}

/**
 * Compliance state for a single week given its total count. `isComplete` is
 * true once the whole week is in the past; `isPartialFirst` true when the
 * habit was created after the week began.
 */
function weekCellState(
  count: number,
  target: number,
  op: Habit['target_op'],
  isComplete: boolean,
  isPartialFirst: boolean,
): HabitCellState {
  if (count > 0 && targetMet(count, target, op)) return 'met';
  // An lte cap that's already exceeded is a hard miss, even mid-week.
  if (op === 'lte' && count > target) return 'violated';
  if (count === 0) return 'empty'; // un-logged → neutral (forgiving)
  // Some activity but a gte/eq target not reached: a miss only once the week
  // has fully ended (and isn't the forgiving partial first week).
  if (isComplete && !isPartialFirst) return 'violated';
  return 'empty';
}

export interface WeeklyProgress {
  weekStartISO: string;
  count: number;
  target: number;
  state: HabitCellState;
  days: { date: string; count: number; isToday: boolean }[];
}

/** Current-week progress for the daily-list row. */
export function weeklyProgress(
  checkIns: HabitCheckIn[],
  habit: Habit,
  memberId: string,
  today: Date = new Date(),
): WeeklyProgress {
  const ws = habitWeekStart(habit);
  const target = habit.daily_target ?? 1;
  const counts = countsByDate(checkIns, habit.id, memberId);
  const weekStart = startOfHabitWeek(today, ws);
  const todayISO = localISO(today);
  const habitStartDate = new Date(habitStartISO(habit) + 'T00:00:00');
  const days: WeeklyProgress['days'] = [];
  const c = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const iso = localISO(c);
    days.push({ date: iso, count: counts.get(iso) ?? 0, isToday: iso === todayISO });
    c.setDate(c.getDate() + 1);
  }
  const count = days.reduce((s, d) => s + d.count, 0);
  const isPartialFirst = weekStart < habitStartDate;
  const state = weekCellState(count, target, habit.target_op, false, isPartialFirst);
  return { weekStartISO: localISO(weekStart), count, target, state, days };
}

function weeklyRangeStats(
  habit: Habit,
  checkIns: HabitCheckIn[],
  memberId: string,
  fromISO: string,
  toISO: string,
): HabitRangeStats {
  const ws = habitWeekStart(habit);
  const target = habit.daily_target ?? 1;
  const counts = countsByDate(checkIns, habit.id, memberId);
  const startISO = fromISO > habitStartISO(habit) ? fromISO : habitStartISO(habit);
  if (startISO > toISO) {
    return { daysDue: 0, daysMet: 0, totalCount: 0, successRate: 0 };
  }
  const habitStartDate = new Date(habitStartISO(habit) + 'T00:00:00');
  const todayISO = localISO();
  const lastWeekStart = startOfHabitWeek(new Date(toISO + 'T00:00:00'), ws);
  const cursor = startOfHabitWeek(new Date(startISO + 'T00:00:00'), ws);
  let weeksDue = 0;
  let weeksMet = 0;
  let totalCount = 0;
  while (cursor <= lastWeekStart) {
    const count = sumWeek(counts, cursor);
    totalCount += count;
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const isComplete = localISO(weekEnd) < todayISO;
    const isPartialFirst = cursor < habitStartDate;
    const met = count > 0 && targetMet(count, target, habit.target_op);
    if (met) {
      weeksDue++;
      weeksMet++;
    } else if (isComplete && !isPartialFirst) {
      weeksDue++;
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return {
    daysDue: weeksDue,
    daysMet: weeksMet,
    totalCount,
    successRate: weeksDue === 0 ? 0 : weeksMet / weeksDue,
  };
}

/** Consecutive met weeks ending at the current week (forgiving on the live week). */
export function computeWeeklyStreak(
  checkIns: HabitCheckIn[],
  habit: Habit,
  memberId: string,
): number {
  const ws = habitWeekStart(habit);
  const target = habit.daily_target ?? 1;
  const counts = countsByDate(checkIns, habit.id, memberId);
  let streak = 0;
  const cursor = startOfHabitWeek(new Date(), ws);
  for (let i = 0; i < 520; i++) {
    const count = sumWeek(counts, cursor);
    const met = count > 0 && targetMet(count, target, habit.target_op);
    if (met) {
      streak++;
    } else if (i === 0) {
      // Current week not met yet — that's fine, look back from last week.
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/** Longest run of consecutive met weeks since the habit began. */
export function longestWeeklyStreak(
  checkIns: HabitCheckIn[],
  habit: Habit,
  memberId: string,
): number {
  const ws = habitWeekStart(habit);
  const target = habit.daily_target ?? 1;
  const counts = countsByDate(checkIns, habit.id, memberId);
  const cursor = startOfHabitWeek(new Date(habitStartISO(habit) + 'T00:00:00'), ws);
  const end = startOfHabitWeek(new Date(), ws);
  let best = 0;
  let cur = 0;
  while (cursor <= end) {
    const count = sumWeek(counts, cursor);
    const met = count > 0 && targetMet(count, target, habit.target_op);
    if (met) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return best;
}

/** Heatmap cells for a weekly habit — each day carries its WEEK's state. */
function weeklyCells(
  habit: Habit,
  checkIns: HabitCheckIn[],
  memberId: string,
  fromISO: string,
  toISO: string,
): HabitDayCell[] {
  const ws = habitWeekStart(habit);
  const target = habit.daily_target ?? 1;
  const counts = countsByDate(checkIns, habit.id, memberId);
  const startISO = habitStartISO(habit);
  const habitStartDate = new Date(startISO + 'T00:00:00');
  const todayISO = localISO();
  const weekStateCache = new Map<string, HabitCellState>();
  const stateForDate = (dateISO: string): HabitCellState => {
    const wkStart = startOfHabitWeek(new Date(dateISO + 'T00:00:00'), ws);
    const key = localISO(wkStart);
    let st = weekStateCache.get(key);
    if (st === undefined) {
      const count = sumWeek(counts, wkStart);
      const weekEnd = new Date(wkStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const isComplete = localISO(weekEnd) < todayISO;
      const isPartialFirst = wkStart < habitStartDate;
      st = weekCellState(count, target, habit.target_op, isComplete, isPartialFirst);
      weekStateCache.set(key, st);
    }
    return st;
  };
  return eachISO(fromISO, toISO).map((date) => {
    const count = counts.get(date) ?? 0;
    return {
      date,
      count,
      state: stateForDate(date),
      inRange: date >= startISO || count > 0,
    };
  });
}

