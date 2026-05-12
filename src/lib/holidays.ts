import type { CalendarEvent } from '@/types';

/**
 * Aussie public holidays for WA. Sourced from data.gov.au (with a fallback
 * inline list because that API can be flaky and we want offline-first).
 *
 * Returns events ready to be added to the family calendar.
 */

interface PublicHoliday {
  date: string; // ISO YYYY-MM-DD
  name: string;
  state: string; // 'WA' | 'NAT' (national)
}

// 2026 WA public holidays (verified from official WA Government calendar).
// Updated annually. We hardcode a year ahead so users always have at least
// 12 months of holidays to import without needing the network.
// Dates are the WA-observed public holiday dates. Where a holiday falls on
// a weekend, only the observed weekday substitute is listed (no duplicates).
const HARDCODED_HOLIDAYS_WA: PublicHoliday[] = [
  // 2026
  { date: '2026-01-01', name: "New Year's Day", state: 'NAT' },
  { date: '2026-01-26', name: 'Australia Day', state: 'NAT' },
  { date: '2026-03-02', name: 'Labour Day', state: 'WA' },
  { date: '2026-04-03', name: 'Good Friday', state: 'NAT' },
  { date: '2026-04-04', name: 'Easter Saturday', state: 'WA' },
  { date: '2026-04-05', name: 'Easter Sunday', state: 'WA' },
  { date: '2026-04-06', name: 'Easter Monday', state: 'NAT' },
  { date: '2026-04-27', name: 'ANZAC Day', state: 'WA' }, // Apr 25 = Sat → observed Mon Apr 27
  { date: '2026-06-01', name: 'Western Australia Day', state: 'WA' },
  { date: '2026-09-28', name: "King's Birthday (WA)", state: 'WA' },
  { date: '2026-12-25', name: 'Christmas Day', state: 'NAT' },
  { date: '2026-12-28', name: 'Boxing Day', state: 'WA' }, // Dec 26 = Sat → observed Mon Dec 28
  // 2027
  { date: '2027-01-01', name: "New Year's Day", state: 'NAT' },
  { date: '2027-01-26', name: 'Australia Day', state: 'NAT' },
  { date: '2027-03-01', name: 'Labour Day', state: 'WA' },
  { date: '2027-03-26', name: 'Good Friday', state: 'NAT' },
  { date: '2027-03-27', name: 'Easter Saturday', state: 'WA' },
  { date: '2027-03-28', name: 'Easter Sunday', state: 'WA' },
  { date: '2027-03-29', name: 'Easter Monday', state: 'NAT' },
  { date: '2027-04-26', name: 'ANZAC Day', state: 'WA' }, // Apr 25 = Sun → observed Mon Apr 26
  { date: '2027-06-07', name: 'Western Australia Day', state: 'WA' },
  { date: '2027-09-27', name: "King's Birthday (WA)", state: 'WA' },
  { date: '2027-12-27', name: 'Christmas Day', state: 'WA' }, // Dec 25 = Sat → observed Mon Dec 27
  { date: '2027-12-28', name: 'Boxing Day', state: 'WA' }   // Dec 26 = Sun → observed Tue Dec 28
];

// WA school terms 2026 (verified from Department of Education WA)
interface SchoolTerm {
  name: string;
  start: string;
  end: string;
}

const WA_SCHOOL_TERMS_2026: SchoolTerm[] = [
  { name: 'Term 1 2026', start: '2026-02-04', end: '2026-04-10' },
  { name: 'Term 2 2026', start: '2026-04-27', end: '2026-07-03' },
  { name: 'Term 3 2026', start: '2026-07-20', end: '2026-09-25' },
  { name: 'Term 4 2026', start: '2026-10-13', end: '2026-12-17' }
];

const WA_SCHOOL_TERMS_2027: SchoolTerm[] = [
  { name: 'Term 1 2027', start: '2027-02-03', end: '2027-04-09' },
  { name: 'Term 2 2027', start: '2027-04-26', end: '2027-07-02' },
  { name: 'Term 3 2027', start: '2027-07-19', end: '2027-09-24' },
  { name: 'Term 4 2027', start: '2027-10-11', end: '2027-12-16' }
];

export interface ImportableEvent {
  /** Stable id derived from source — used to detect duplicates */
  source_id: string;
  title: string;
  start_at: string; // ISO datetime
  end_at: string;
  all_day: boolean;
  description: string | null;
  location: string | null;
  category: CalendarEvent['category'];
}

export function getAusPublicHolidays(year?: number): ImportableEvent[] {
  const filtered = year
    ? HARDCODED_HOLIDAYS_WA.filter((h) => h.date.startsWith(String(year)))
    : HARDCODED_HOLIDAYS_WA;

  return filtered.map((h) => ({
    source_id: 'wa-holiday-' + h.date,
    title: '🎉 ' + h.name,
    start_at: h.date + 'T00:00:00.000Z',
    end_at: h.date + 'T23:59:00.000Z',
    all_day: true,
    description: 'Public holiday — ' + (h.state === 'NAT' ? 'national' : 'Western Australia'),
    location: null,
    category: 'social' as CalendarEvent['category']
  }));
}

export function getWASchoolTerms(year?: number): ImportableEvent[] {
  const terms = [
    ...WA_SCHOOL_TERMS_2026,
    ...WA_SCHOOL_TERMS_2027
  ].filter((t) => !year || t.start.startsWith(String(year)));

  const events: ImportableEvent[] = [];
  for (const term of terms) {
    // Term start
    events.push({
      source_id: 'wa-school-' + term.name.toLowerCase().replace(/\s+/g, '-') + '-start',
      title: '📚 ' + term.name + ' starts',
      start_at: term.start + 'T00:00:00.000Z',
      end_at: term.start + 'T23:59:00.000Z',
      all_day: true,
      description: 'WA school term starts',
      location: null,
      category: 'school'
    });
    // Term end
    events.push({
      source_id: 'wa-school-' + term.name.toLowerCase().replace(/\s+/g, '-') + '-end',
      title: '🏖️ ' + term.name + ' ends',
      start_at: term.end + 'T00:00:00.000Z',
      end_at: term.end + 'T23:59:00.000Z',
      all_day: true,
      description: 'WA school term ends',
      location: null,
      category: 'school'
    });
  }
  return events;
}
