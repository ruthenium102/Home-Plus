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
  memberId: string
): number {
  const dates = new Set(
    checkIns
      .filter((c) => c.habit_id === habitId && c.member_id === memberId)
      .map((c) => c.for_date)
  );
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const iso = cursor.toISOString().slice(0, 10);
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
  date: Date
): boolean {
  const iso = date.toISOString().slice(0, 10);
  return checkIns.some(
    (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === iso
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
  n: number
): { date: string; checked: boolean }[] {
  const out: { date: string; checked: boolean }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    out.push({
      date: iso,
      checked: checkIns.some(
        (c) => c.habit_id === habitId && c.member_id === memberId && c.for_date === iso
      )
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
    (h) => !h.archived && (h.member_id === activeMemberId || h.visibility === 'shared')
  );
}

export function nextStreakMilestone(streak: number): number {
  const milestones = [7, 30, 100, 365];
  return milestones.find((m) => m > streak) ?? streak + 100;
}
