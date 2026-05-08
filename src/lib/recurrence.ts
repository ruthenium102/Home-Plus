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
  rangeEnd: Date
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
          occurrence_key: `${e.id}__${e.start_at}`
        });
      }
      continue;
    }
    out.push(...expandRecurring(e, e.recurrence, rangeStart, rangeEnd));
  }
  return out.sort(
    (a, b) =>
      new Date(a.occurrence_start).getTime() - new Date(b.occurrence_start).getTime()
  );
}

function expandRecurring(
  e: CalendarEvent,
  rec: Recurrence,
  rangeStart: Date,
  rangeEnd: Date
): ExpandedEvent[] {
  const out: ExpandedEvent[] = [];
  const origStart = new Date(e.start_at);
  const origEnd = new Date(e.end_at);
  const durationMs = origEnd.getTime() - origStart.getTime();
  const until = rec.until ? new Date(rec.until) : null;
  const limit = until && isBefore(until, rangeEnd) ? until : rangeEnd;
  const maxIterations = 500; // safety
  let count = 0;

  // Walk forward from origStart until we pass `limit`, collecting hits.
  let cursor = new Date(origStart);
  let occCount = 0;

  while (count < maxIterations && !isAfter(cursor, limit)) {
    count += 1;
    const matches = matchesRecurrence(cursor, origStart, rec);
    if (matches) {
      occCount += 1;
      const occStart = new Date(cursor);
      const occEnd = new Date(occStart.getTime() + durationMs);
      if (isAfter(occEnd, rangeStart)) {
        out.push({
          ...e,
          occurrence_start: occStart.toISOString(),
          occurrence_end: occEnd.toISOString(),
          occurrence_key: `${e.id}__${occStart.toISOString()}`
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
