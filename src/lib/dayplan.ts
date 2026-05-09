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
