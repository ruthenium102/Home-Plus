import { describe, it, expect } from 'vitest';
import {
  expandMealPlans,
  mealRepeatRule,
  nextMatchingDate,
  eventExdateFor,
  INDEFINITE_WEEKS,
} from '../mealRecurrence';
import type { MealPlan } from '@/types';

// A3 pins the same bug class the recurrence/habit suites pin: date-boundary
// logic. The expansion routes through the calendar's own walker, so these
// tests also guard planner ↔ calendar occurrence parity.

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
  return {
    id: 'mp-1',
    family_id: 'fam-1',
    recipe_id: 'r-1',
    date: '2026-07-06', // a Monday
    meal_type: 'dinner',
    servings: 4,
    calendar_event_id: 'e-1',
    notes: null,
    created_by: null,
    created_at: '2026-07-01T00:00:00.000Z',
    recurrence: null,
    exdates: [],
    ...overrides,
  };
}

describe('expandMealPlans', () => {
  it('passes non-recurring plans through when in window', () => {
    const out = expandMealPlans([makePlan()], '2026-07-06', '2026-07-12');
    expect(out).toHaveLength(1);
    expect(out[0].occurrence_key).toBe('mp-1__2026-07-06');
  });

  it('excludes non-recurring plans outside the window', () => {
    expect(expandMealPlans([makePlan()], '2026-07-07', '2026-07-12')).toHaveLength(0);
  });

  it('projects weekly byweekday occurrences (anchor included when it matches)', () => {
    const plan = makePlan({
      recurrence: { freq: 'weekly', interval: 1, byweekday: [1, 4], until: null }, // Mon+Thu
    });
    const out = expandMealPlans([plan], '2026-07-06', '2026-07-19');
    expect(out.map((o) => o.date)).toEqual([
      '2026-07-06', // Mon (anchor)
      '2026-07-09', // Thu
      '2026-07-13', // Mon
      '2026-07-16', // Thu
    ]);
    // Every occurrence carries the base id — actions pass (id, date).
    expect(new Set(out.map((o) => o.id))).toEqual(new Set(['mp-1']));
    expect(new Set(out.map((o) => o.occurrence_key)).size).toBe(4);
  });

  it('respects until (inclusive window end, exclusive-after)', () => {
    const plan = makePlan({
      recurrence: { freq: 'weekly', interval: 1, byweekday: [1], until: '2026-07-13' },
    });
    const dates = expandMealPlans([plan], '2026-07-01', '2026-08-31').map((o) => o.date);
    expect(dates[0]).toBe('2026-07-06');
    expect(dates[dates.length - 1] <= '2026-07-13').toBe(true);
    expect(dates.length).toBeLessThanOrEqual(2);
  });

  it('skips exdated occurrence dates', () => {
    const plan = makePlan({
      recurrence: { freq: 'weekly', interval: 1, byweekday: [1], until: null },
      exdates: ['2026-07-13'],
    });
    const dates = expandMealPlans([plan], '2026-07-06', '2026-07-20').map((o) => o.date);
    expect(dates).toEqual(['2026-07-06', '2026-07-20']);
  });
});

describe('mealRepeatRule', () => {
  it('caps with an until date for finite repeats', () => {
    const rule = mealRepeatRule('2026-07-06', [1], 4);
    expect(rule.until).toBe('2026-08-03');
  });

  it('is open-ended at the forever sentinel', () => {
    expect(mealRepeatRule('2026-07-06', [1], INDEFINITE_WEEKS).until).toBeNull();
  });
});

describe('nextMatchingDate', () => {
  it('finds the next chosen weekday strictly after the anchor', () => {
    expect(nextMatchingDate('2026-07-06', [2, 4])).toBe('2026-07-07'); // Mon → Tue
    expect(nextMatchingDate('2026-07-07', [2])).toBe('2026-07-14'); // Tue → next Tue
  });
});

describe('eventExdateFor', () => {
  it('produces the exact occurrence-start ISO for a naive event time', () => {
    const iso = eventExdateFor({ start_at: '2026-07-06T18:30:00' }, '2026-07-13');
    expect(iso).toBe(new Date('2026-07-13T18:30:00').toISOString());
  });
});
