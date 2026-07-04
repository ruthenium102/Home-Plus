import { addDays, addMonths, addYears, isAfter, isBefore, startOfDay } from 'date-fns';
import type { CalendarEvent, Recurrence } from '@/types';

/**
 * Expand a recurring event into concrete occurrences within [rangeStart, rangeEnd].
 * Each occurrence keeps the same id but gets a synthetic `occurrence_key` (start ISO)
 * for React keys. Non-recurring events are passed through.
 *
 * Implementation note: This is a deliberately tiny RRULE-like expander rather
 * than a full ICAL implementation. We can swap in `rrule` library later if we
 * need EXDATEs / BYSETPOS / etc.
 */
export interface ExpandedEvent extends CalendarEvent {
  occurrence_start: string;
  occurrence_end: string;
  occurrence_key: string;
}

export function expandEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const out: ExpandedEvent[] = [];
  for (const e of events) {
    if (!e.recurrence) {
      const start = new Date(e.start_at);
      const end = new Date(e.end_at);
      if (isBefore(start, rangeEnd) && isAfter(end, rangeStart)) {
        out.push({
          ...e,
          occurrence_start: e.start_at,
          occurrence_end: e.end_at,
          occurrence_key: `${e.id}__${e.start_at}`,
        });
      }
      continue;
    }
    out.push(...expandRecurring(e, e.recurrence, rangeStart, rangeEnd));
  }
  return out.sort(
    (a, b) => new Date(a.occurrence_start).getTime() - new Date(b.occurrence_start).getTime(),
  );
}

const DAY_MS = 86_400_000;

/**
 * Jump the walk cursor from the series origin to the last occurrence start at
 * or before the earliest instant that could still overlap the range, instead
 * of stepping one period at a time from the beginning. Without this the
 * expansion cost grows with the age of the series, and an old daily series
 * (or weekly-with-byweekday, which steps 1 day) exhausts the iteration cap
 * before ever reaching the visible range — occurrences silently vanish
 * ~500 steps after the series was created.
 *
 * Only used for series without a `count` limit — count-limited series must
 * walk from the origin so occurrences are numbered correctly.
 *
 * The day-based jumps deliberately land one step early (n - 1): ms arithmetic
 * can drift an hour across DST, and the normal walk cheaply covers the last
 * step. Month/year jumps go a whole period short for the same reason.
 */
function fastForwardCursor(
  origStart: Date,
  rec: Recurrence,
  rangeStart: Date,
  durationMs: number,
): Date {
  const earliest = rangeStart.getTime() - durationMs;
  if (origStart.getTime() >= earliest) return new Date(origStart);
  const interval = Math.max(1, rec.interval || 1);
  const jumpDays = (stepDays: number) => {
    const n = Math.floor((earliest - origStart.getTime()) / (stepDays * DAY_MS)) - 1;
    return n > 0 ? addDays(origStart, n * stepDays) : new Date(origStart);
  };
  switch (rec.freq) {
    case 'daily':
      return jumpDays(interval);
    case 'weekly':
      // With byweekday the walk steps 1 day; without, whole weeks.
      return jumpDays(rec.byweekday && rec.byweekday.length > 0 ? 1 : interval * 7);
    case 'monthly': {
      const months =
        (rangeStart.getFullYear() - origStart.getFullYear()) * 12 +
        (rangeStart.getMonth() - origStart.getMonth()) -
        1;
      const n = Math.floor(months / interval);
      return n > 0 ? addMonths(origStart, n * interval) : new Date(origStart);
    }
    case 'yearly': {
      const years = rangeStart.getFullYear() - origStart.getFullYear() - 1;
      const n = Math.floor(years / interval);
      return n > 0 ? addYears(origStart, n * interval) : new Date(origStart);
    }
    default:
      return new Date(origStart);
  }
}

function expandRecurring(
  e: CalendarEvent,
  rec: Recurrence,
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const out: ExpandedEvent[] = [];
  const origStart = new Date(e.start_at);
  const origEnd = new Date(e.end_at);
  const durationMs = origEnd.getTime() - origStart.getTime();
  const until = rec.until ? new Date(rec.until) : null;
  const limit = until && isBefore(until, rangeEnd) ? until : rangeEnd;
  const maxIterations = 2000; // safety (count-limited series still walk from origin)
  let count = 0;

  // Walk forward until we pass `limit`, collecting hits. Unbounded series
  // start the walk near rangeStart instead of at the series origin.
  let cursor = rec.count
    ? new Date(origStart)
    : fastForwardCursor(origStart, rec, rangeStart, durationMs);
  let occCount = 0;

  while (count < maxIterations && !isAfter(cursor, limit)) {
    count += 1;
    const matches = matchesRecurrence(cursor, origStart, rec);
    if (matches) {
      occCount += 1;
      const occStart = new Date(cursor);
      const occEnd = new Date(occStart.getTime() + durationMs);
      // Skip occurrences the user has "moved" out of the series (exdates holds
      // their original occurrence start ISO). occCount still advances so a
      // count-limited series isn't silently extended.
      const excluded = e.exdates ? e.exdates.includes(occStart.toISOString()) : false;
      if (isAfter(occEnd, rangeStart) && !excluded) {
        out.push({
          ...e,
          occurrence_start: occStart.toISOString(),
          occurrence_end: occEnd.toISOString(),
          occurrence_key: `${e.id}__${occStart.toISOString()}`,
        });
      }
      if (rec.count && occCount >= rec.count) break;
    }
    // Advance cursor by smallest increment for the freq
    cursor = stepCursor(cursor, rec);
  }
  return out;
}

function matchesRecurrence(date: Date, origStart: Date, rec: Recurrence): boolean {
  // For weekly with byweekday filter, ensure day of week matches.
  if (rec.freq === 'weekly' && rec.byweekday && rec.byweekday.length > 0) {
    if (!rec.byweekday.includes(date.getDay())) return false;
  }
  // First occurrence is always origStart itself.
  if (startOfDay(date).getTime() < startOfDay(origStart).getTime()) return false;
  return true;
}

function stepCursor(cursor: Date, rec: Recurrence): Date {
  switch (rec.freq) {
    case 'daily':
      return addDays(cursor, rec.interval);
    case 'weekly':
      // For weekly with byweekday, step by 1 day so we can hit each weekday.
      if (rec.byweekday && rec.byweekday.length > 0) return addDays(cursor, 1);
      return addDays(cursor, rec.interval * 7);
    case 'monthly':
      return addMonths(cursor, rec.interval);
    case 'yearly':
      return addYears(cursor, rec.interval);
    default:
      return addDays(cursor, 1);
  }
}
