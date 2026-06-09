import { describe, expect, it } from 'vitest';
import { expandEvents } from '@/lib/recurrence';
import type { CalendarEvent, Recurrence } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures. Times are UTC ISO so occurrence keys round-trip deterministically.
// June 2026 has no DST transitions in common zones, so calendar-day stepping
// stays a clean 24h.
// ---------------------------------------------------------------------------

function makeEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    family_id: 'f1',
    title: 'Test event',
    description: null,
    start_at: '2026-06-01T09:00:00.000Z',
    end_at: '2026-06-01T10:00:00.000Z',
    all_day: false,
    location: null,
    category: 'general',
    member_ids: [],
    recurrence: null,
    reminder_offsets: [],
    created_by: null,
    created_at: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

function rec(over: Partial<Recurrence> = {}): Recurrence {
  return { freq: 'daily', interval: 1, ...over };
}

const RANGE_START = new Date('2026-05-01T00:00:00.000Z');
const RANGE_END = new Date('2026-06-30T00:00:00.000Z');

describe('expandEvents — non-recurring', () => {
  it('passes a one-off event through when it overlaps the range', () => {
    const out = expandEvents([makeEvent()], RANGE_START, RANGE_END);
    expect(out).toHaveLength(1);
    expect(out[0].occurrence_start).toBe('2026-06-01T09:00:00.000Z');
    expect(out[0].occurrence_key).toBe('e1__2026-06-01T09:00:00.000Z');
  });

  it('drops a one-off event entirely outside the range', () => {
    const out = expandEvents([makeEvent()], RANGE_START, new Date('2026-05-15T00:00:00.000Z'));
    expect(out).toHaveLength(0);
  });
});

describe('expandEvents — recurring', () => {
  it('expands a daily series across the range', () => {
    const ev = makeEvent({ recurrence: rec({ freq: 'daily', interval: 1 }) });
    const out = expandEvents([ev], new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-04T00:00:00.000Z'));
    // 06-01, 06-02, 06-03 (the 06-04 09:00 occurrence falls past rangeEnd).
    expect(out.map((o) => o.occurrence_start)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-02T09:00:00.000Z',
      '2026-06-03T09:00:00.000Z',
    ]);
  });

  it('honours an occurrence count limit', () => {
    const ev = makeEvent({ recurrence: rec({ freq: 'daily', interval: 1, count: 2 }) });
    const out = expandEvents([ev], RANGE_START, RANGE_END);
    expect(out).toHaveLength(2);
  });

  it('honours an `until` end date', () => {
    const ev = makeEvent({
      recurrence: rec({ freq: 'daily', interval: 1, until: '2026-06-03T23:59:59.000Z' }),
    });
    const out = expandEvents([ev], new Date('2026-06-01T00:00:00.000Z'), RANGE_END);
    expect(out.map((o) => o.occurrence_start)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-02T09:00:00.000Z',
      '2026-06-03T09:00:00.000Z',
    ]);
  });

  it('filters weekly occurrences by weekday', () => {
    // Start Monday 2026-06-01; recur on Wednesdays only.
    const ev = makeEvent({ recurrence: rec({ freq: 'weekly', interval: 1, byweekday: [3] }) });
    const out = expandEvents([ev], new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-15T00:00:00.000Z'));
    expect(out.map((o) => o.occurrence_start)).toEqual([
      '2026-06-03T09:00:00.000Z',
      '2026-06-10T09:00:00.000Z',
    ]);
  });
});

describe('expandEvents — exdates (moved/deleted single occurrence, migration v21)', () => {
  it('suppresses an excluded occurrence start', () => {
    const ev = makeEvent({
      recurrence: rec({ freq: 'daily', interval: 1 }),
      exdates: ['2026-06-02T09:00:00.000Z'],
    });
    const out = expandEvents([ev], new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-04T00:00:00.000Z'));
    const starts = out.map((o) => o.occurrence_start);
    expect(starts).not.toContain('2026-06-02T09:00:00.000Z');
    expect(starts).toEqual(['2026-06-01T09:00:00.000Z', '2026-06-03T09:00:00.000Z']);
  });

  it('does not advance a count-limited series past an exdate (occCount still counts)', () => {
    // count:2 with the first occurrence excluded should yield only the 2nd —
    // the exclusion must not silently extend the series to a 3rd day.
    const ev = makeEvent({
      recurrence: rec({ freq: 'daily', interval: 1, count: 2 }),
      exdates: ['2026-06-01T09:00:00.000Z'],
    });
    const out = expandEvents([ev], RANGE_START, RANGE_END);
    expect(out.map((o) => o.occurrence_start)).toEqual(['2026-06-02T09:00:00.000Z']);
  });
});
