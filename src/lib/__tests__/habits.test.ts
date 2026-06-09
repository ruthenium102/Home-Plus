import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeHabitStreak,
  habitCellState,
  habitRangeStats,
  isHabitDue,
  longestHabitStreak,
  nextStreakMilestone,
  targetLabel,
  targetMet,
} from '@/lib/habits';
import { localISO } from '@/lib/dates';
import type { Habit, HabitCheckIn } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER = 'm1';

function makeHabit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    family_id: 'f1',
    member_id: MEMBER,
    title: 'Test habit',
    description: null,
    cadence: 'daily',
    visibility: 'private',
    streak_rewards: false,
    archived: false,
    count_mode: false,
    daily_target: 1,
    target_op: 'gte',
    created_at: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

let checkInSeq = 0;
function checkIn(forDateISO: string, count = 1, habitId = 'h1', memberId = MEMBER): HabitCheckIn {
  checkInSeq += 1;
  return {
    id: `c${checkInSeq}`,
    habit_id: habitId,
    family_id: 'f1',
    member_id: memberId,
    for_date: forDateISO,
    count,
    created_at: '2020-01-01T00:00:00.000Z',
  };
}

/** ISO (YYYY-MM-DD) for n days before the (mocked) "today". */
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}

// ---------------------------------------------------------------------------
// targetMet — comparison operators
// ---------------------------------------------------------------------------

describe('targetMet', () => {
  it('gte: at least N', () => {
    expect(targetMet(3, 3, 'gte')).toBe(true);
    expect(targetMet(4, 3, 'gte')).toBe(true);
    expect(targetMet(2, 3, 'gte')).toBe(false);
  });

  it('lte: at most N', () => {
    expect(targetMet(2, 3, 'lte')).toBe(true);
    expect(targetMet(3, 3, 'lte')).toBe(true);
    expect(targetMet(4, 3, 'lte')).toBe(false);
  });

  it('eq: exactly N', () => {
    expect(targetMet(3, 3, 'eq')).toBe(true);
    expect(targetMet(2, 3, 'eq')).toBe(false);
    expect(targetMet(4, 3, 'eq')).toBe(false);
  });

  it('defaults to gte when op missing', () => {
    expect(targetMet(5, 3)).toBe(true);
    expect(targetMet(1, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// habitCellState — never claims an un-logged day as missed
// ---------------------------------------------------------------------------

describe('habitCellState', () => {
  it('zero count is always neutral (empty), even for lte', () => {
    expect(habitCellState(0, 3, 'gte')).toBe('empty');
    expect(habitCellState(0, 3, 'lte')).toBe('empty');
  });

  it('met when target satisfied with activity', () => {
    expect(habitCellState(3, 3, 'gte')).toBe('met');
    expect(habitCellState(2, 3, 'lte')).toBe('met');
  });

  it('violated when over an lte cap or under a gte goal', () => {
    expect(habitCellState(4, 3, 'lte')).toBe('violated');
    expect(habitCellState(2, 3, 'gte')).toBe('violated');
  });
});

// ---------------------------------------------------------------------------
// isHabitDue — cadence rules
// ---------------------------------------------------------------------------

describe('isHabitDue', () => {
  // 2026-06-08 is a Monday, 2026-06-13 a Saturday, 2026-06-14 a Sunday.
  const monday = new Date('2026-06-08T12:00:00');
  const saturday = new Date('2026-06-13T12:00:00');
  const sunday = new Date('2026-06-14T12:00:00');

  it('daily is always due', () => {
    expect(isHabitDue(makeHabit({ cadence: 'daily' }), saturday)).toBe(true);
  });

  it('weekdays excludes the weekend', () => {
    const h = makeHabit({ cadence: 'weekdays' });
    expect(isHabitDue(h, monday)).toBe(true);
    expect(isHabitDue(h, saturday)).toBe(false);
    expect(isHabitDue(h, sunday)).toBe(false);
  });

  it('weekend is only Sat/Sun', () => {
    const h = makeHabit({ cadence: 'weekend' });
    expect(isHabitDue(h, monday)).toBe(false);
    expect(isHabitDue(h, saturday)).toBe(true);
    expect(isHabitDue(h, sunday)).toBe(true);
  });

  it('pick_days honours the chosen weekdays', () => {
    const h = makeHabit({ cadence: 'pick_days', weekdays: [1] }); // Monday only
    expect(isHabitDue(h, monday)).toBe(true);
    expect(isHabitDue(h, saturday)).toBe(false);
  });

  it('archived habits are never due', () => {
    expect(isHabitDue(makeHabit({ archived: true }), monday)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeHabitStreak — target-aware, forgiving on today
// ---------------------------------------------------------------------------

describe('computeHabitStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00')); // fixed "today"
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts consecutive met days ending today', () => {
    const h = makeHabit();
    const ins = [checkIn(daysAgoISO(0)), checkIn(daysAgoISO(1)), checkIn(daysAgoISO(2))];
    expect(computeHabitStreak(h, ins, MEMBER)).toBe(3);
  });

  it('today not yet done is forgiving — counts back from yesterday', () => {
    const h = makeHabit();
    const ins = [checkIn(daysAgoISO(1)), checkIn(daysAgoISO(2))];
    expect(computeHabitStreak(h, ins, MEMBER)).toBe(2);
  });

  it('a gap breaks the streak', () => {
    const h = makeHabit();
    const ins = [checkIn(daysAgoISO(0)), checkIn(daysAgoISO(2))]; // missed yesterday
    expect(computeHabitStreak(h, ins, MEMBER)).toBe(1);
  });

  it('a day that misses the target does not extend the streak (gte)', () => {
    const h = makeHabit({ daily_target: 3, count_mode: true, target_op: 'gte' });
    const ins = [
      checkIn(daysAgoISO(0), 3),
      checkIn(daysAgoISO(1), 1), // under goal — breaks here
      checkIn(daysAgoISO(2), 3),
    ];
    expect(computeHabitStreak(h, ins, MEMBER)).toBe(1);
  });

  it('over-cap day breaks an lte streak', () => {
    const h = makeHabit({ daily_target: 2, count_mode: true, target_op: 'lte' });
    const ins = [checkIn(daysAgoISO(0), 1), checkIn(daysAgoISO(1), 5)]; // 5 > cap
    expect(computeHabitStreak(h, ins, MEMBER)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// longestHabitStreak
// ---------------------------------------------------------------------------

describe('longestHabitStreak', () => {
  it('finds the longest consecutive run of met days', () => {
    const h = makeHabit();
    const ins = [
      checkIn('2026-06-01'),
      checkIn('2026-06-02'),
      checkIn('2026-06-03'), // run of 3
      // gap on the 4th
      checkIn('2026-06-05'),
      checkIn('2026-06-06'), // run of 2
    ];
    expect(longestHabitStreak(h, ins, MEMBER)).toBe(3);
  });

  it('is zero with no qualifying days', () => {
    expect(longestHabitStreak(makeHabit(), [], MEMBER)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// habitRangeStats — success rate
// ---------------------------------------------------------------------------

describe('habitRangeStats', () => {
  it('computes a success rate over a daily range', () => {
    const h = makeHabit({ created_at: '2026-06-01T00:00:00.000Z' });
    const ins = [checkIn('2026-06-01'), checkIn('2026-06-02')]; // 2 of 3 days met
    const stats = habitRangeStats(h, ins, MEMBER, '2026-06-01', '2026-06-03');
    expect(stats.daysDue).toBe(3);
    expect(stats.daysMet).toBe(2);
    expect(stats.totalCount).toBe(2);
    expect(stats.successRate).toBeCloseTo(2 / 3);
  });

  it('clamps the range to the habit start date', () => {
    const h = makeHabit({ created_at: '2026-06-05T00:00:00.000Z' });
    const stats = habitRangeStats(h, [], MEMBER, '2026-06-01', '2026-06-04');
    expect(stats.daysDue).toBe(0);
    expect(stats.successRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

describe('targetLabel', () => {
  it('renders the operator symbol and period', () => {
    expect(targetLabel(3, 'gte', 'day')).toBe('≥ 3/day');
    expect(targetLabel(2, 'lte', 'week')).toBe('≤ 2/week');
    expect(targetLabel(1, 'eq', 'day')).toBe('= 1/day');
  });
});

describe('nextStreakMilestone', () => {
  it('returns the next milestone above the current streak', () => {
    expect(nextStreakMilestone(0)).toBe(7);
    expect(nextStreakMilestone(7)).toBe(30);
    expect(nextStreakMilestone(40)).toBe(100);
  });
});
