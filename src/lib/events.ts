import type { CalendarEvent, EventCategory } from '@/types';

/**
 * Suggest an event duration in minutes based on past events with the same
 * title or category. Title match takes priority. Falls back to 30 min.
 */
export function suggestDuration(
  events: CalendarEvent[],
  title: string,
  category: EventCategory
): number {
  const normalizedTitle = title.trim().toLowerCase();

  const timed = events.filter((e) => {
    if (e.all_day) return false;
    const mins = (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000;
    return mins >= 1 && mins <= 1440;
  });

  if (normalizedTitle.length >= 3) {
    const titleMatches = timed.filter(
      (e) =>
        e.title.toLowerCase().includes(normalizedTitle) ||
        normalizedTitle.includes(e.title.toLowerCase())
    );
    if (titleMatches.length > 0) {
      const avg =
        titleMatches.reduce(
          (sum, e) =>
            sum + (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000,
          0
        ) / titleMatches.length;
      return clamp(Math.round(avg), 15, 240);
    }
  }

  const catMatches = timed.filter((e) => e.category === category);
  if (catMatches.length > 0) {
    const avg =
      catMatches.reduce(
        (sum, e) =>
          sum + (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000,
        0
      ) / catMatches.length;
    return clamp(Math.round(avg), 15, 240);
  }

  return 30;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
