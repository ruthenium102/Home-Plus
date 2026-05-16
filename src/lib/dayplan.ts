import type { DayPlanBlock, DayPlanSection } from '@/types';

export function sectionForHour(hour: number): DayPlanSection {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export const SECTION_LABELS: Record<DayPlanSection, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening'
};

export const SECTION_TIME_RANGE: Record<DayPlanSection, string> = {
  morning: '6 – 12',
  afternoon: '12 – 5',
  evening: '5 – 9'
};

export function blocksForMemberDate(
  blocks: DayPlanBlock[],
  memberId: string,
  date: string
): DayPlanBlock[] {
  return blocks.filter((b) => b.member_id === memberId && b.date === date);
}

export function sortedSectionBlocks(
  blocks: DayPlanBlock[],
  section: DayPlanSection
): DayPlanBlock[] {
  return blocks.filter((b) => b.section === section).sort((a, b) => a.position - b.position);
}

export function nextPosition(blocks: DayPlanBlock[], section: DayPlanSection): number {
  const sb = blocks.filter((b) => b.section === section);
  return sb.length > 0 ? Math.max(...sb.map((b) => b.position)) + 1 : 0;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ---- Timeline helpers ------------------------------------------------------

export const TIMELINE_START_MIN = 6 * 60;  // 06:00
export const TIMELINE_END_MIN = 23 * 60;   // 23:00
export const PX_PER_MIN = 1;               // 60px per hour
export const SNAP_MIN = 15;                // 15-minute snap

/** Default start time for a section — used to migrate section-only blocks. */
export function defaultStartMinForSection(section: DayPlanSection): number {
  if (section === 'morning') return 8 * 60;
  if (section === 'afternoon') return 13 * 60;
  return 18 * 60;
}

/** Effective start minute of a block — uses start_min when set, otherwise
 *  falls back to a section-derived position so legacy data still renders. */
export function effectiveStartMin(block: DayPlanBlock): number {
  if (typeof block.start_min === 'number') return block.start_min;
  return defaultStartMinForSection(block.section) + block.position * 30;
}

export function formatTimeOfDay(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function snapMin(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

export function clampStartMin(start: number, duration: number): number {
  const max = TIMELINE_END_MIN - duration;
  return Math.max(TIMELINE_START_MIN, Math.min(max, start));
}

export function sectionForMin(min: number): DayPlanSection {
  return sectionForHour(Math.floor(min / 60));
}
