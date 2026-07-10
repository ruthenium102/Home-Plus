// A3 — recurring meal plans. One meal_plans row + a Recurrence rule expands
// client-side into occurrences, replacing the old model that materialised a
// row (plus a calendar event) per occurrence — up to ~728 rows and realtime
// broadcasts for one "repeat forever" tap.
//
// Expansion is deliberately routed through the SAME walker the calendar uses
// (expandEvents, via a synthetic event) so the planner and the meal's linked
// recurring calendar event can never disagree about which dates an occurrence
// lands on.

import { expandEvents } from './recurrence';
import { localISO } from './dates';
import type { CalendarEvent, MealPlan } from '@/types';

/** Sentinel week-count meaning "repeat forever" (no `until` on the rule). */
export const INDEFINITE_WEEKS = 104;

export interface ExpandedMealPlan extends MealPlan {
  /** `${base id}__${occurrence date}` — stable per occurrence. */
  occurrence_key: string;
}

// The anchor time-of-day for the synthetic expansion event. Midday keeps the
// local date stable when the occurrence timestamp round-trips through UTC.
const ANCHOR = 'T12:00:00';

/**
 * Expand meal plans over an inclusive local-date window (YYYY-MM-DD).
 * Non-recurring plans pass through; recurring plans project one entry per
 * occurrence date (minus exdates), each carrying the base row's id — actions
 * on an occurrence pass the occurrence `date` alongside the id.
 */
export function expandMealPlans(
  plans: MealPlan[],
  fromISO: string,
  toISO: string,
): ExpandedMealPlan[] {
  const out: ExpandedMealPlan[] = [];
  const rangeStart = new Date(`${fromISO}T00:00:00`);
  const rangeEnd = new Date(`${toISO}T23:59:59`);

  for (const mp of plans) {
    if (!mp.recurrence) {
      if (mp.date >= fromISO && mp.date <= toISO) {
        out.push({ ...mp, occurrence_key: `${mp.id}__${mp.date}` });
      }
      continue;
    }

    const synthetic: CalendarEvent = {
      id: mp.id,
      family_id: mp.family_id,
      title: '',
      description: null,
      start_at: `${mp.date}${ANCHOR}`,
      end_at: `${mp.date}T12:30:00`,
      all_day: false,
      location: null,
      category: 'meal',
      member_ids: [],
      recurrence: mp.recurrence,
      exdates: (mp.exdates ?? []).map((d) => new Date(`${d}${ANCHOR}`).toISOString()),
      reminder_offsets: [],
      created_by: null,
      created_at: mp.created_at,
    };
    for (const occ of expandEvents([synthetic], rangeStart, rangeEnd)) {
      // occurrence_start may be a UTC ISO — resolve back to the LOCAL date.
      const date = localISO(new Date(occ.occurrence_start));
      out.push({ ...mp, date, occurrence_key: `${mp.id}__${date}` });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The weekly rule for "repeat this meal on these weekdays for N weeks". */
export function mealRepeatRule(
  anchorDate: string,
  weekdays: number[],
  weeks: number,
): NonNullable<MealPlan['recurrence']> {
  let until: string | null = null;
  if (weeks < INDEFINITE_WEEKS) {
    const d = new Date(`${anchorDate}T00:00:00`);
    d.setDate(d.getDate() + weeks * 7);
    until = localISO(d);
  }
  return { freq: 'weekly', interval: 1, byweekday: weekdays, until };
}

/** The exdate entry for the linked calendar event matching a meal occurrence
 *  date — must equal the exact occurrence-start ISO expandEvents produces. */
export function eventExdateFor(evt: Pick<CalendarEvent, 'start_at'>, date: string): string {
  return new Date(date + evt.start_at.slice(10)).toISOString();
}

/** First date strictly after `afterISO` whose weekday is in `weekdays`. */
export function nextMatchingDate(afterISO: string, weekdays: number[]): string {
  const d = new Date(`${afterISO}T00:00:00`);
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() + 1);
    if (weekdays.includes(d.getDay())) return localISO(d);
  }
  return afterISO; // unreachable for non-empty weekdays
}
