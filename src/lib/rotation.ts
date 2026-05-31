import { getISOWeek, getISOWeekYear } from 'date-fns';
import type { Chore, FamilyMember } from '@/types';

/** Returns ISO week string YYYY-Www (Monday-based ISO 8601). */
export function isoWeekStr(date: Date = new Date()): string {
  // Use the ISO-week-bearing YEAR, not the calendar year. Late-December days
  // can belong to week 1 of the *next* ISO year (and early-January days to the
  // last week of the *previous* one), so getISOWeekYear keeps the prefix and
  // the week number from disagreeing across the New Year boundary.
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Convert an ISO-week string (YYYY-Www) to a strictly-monotonic ordinal so we
 * can subtract two weeks and get the true number of weeks between them.
 *
 * The previous implementation used `year * 54 + wk`, which silently broke at
 * year boundaries: ISO years have either 52 or 53 weeks, so a fixed multiplier
 * of 54 leaves a 1–2 week gap every New Year and makes consecutive weeks like
 * `2024-W52` → `2025-W01` look ~2 weeks apart instead of 1. That desynced the
 * rotation pointer every January.
 *
 * Instead we anchor on a fixed Monday epoch and count whole ISO weeks (7-day
 * spans) elapsed. This is exact for any pair of ISO weeks regardless of how
 * many weeks each intervening year had.
 */
const ISO_EPOCH_MONDAY = Date.UTC(2000, 0, 3); // Mon 3 Jan 2000 = start of 2000-W01

function parseIsoWeek(week: string): number {
  const [yearStr, weekStr] = week.split('-W');
  const year = parseInt(yearStr, 10);
  const wk = parseInt(weekStr, 10);
  // Monday of ISO week 1 for `year`: the Monday of the week containing Jan 4th.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Mon=1 … Sun=7
  const week1Monday = jan4.getTime() - (jan4Day - 1) * 86400000;
  const weekMonday = week1Monday + (wk - 1) * 7 * 86400000;
  return Math.round((weekMonday - ISO_EPOCH_MONDAY) / (7 * 86400000));
}

function weeksBetween(anchor: string, current: string): number {
  return parseIsoWeek(current) - parseIsoWeek(anchor);
}

function isMemberAway(member: FamilyMember): boolean {
  if (!member.location_until) return false;
  return new Date(member.location_until) > new Date();
}

/**
 * Returns the member id whose turn it is for a rotated/roster_role chore.
 * Skips members marked as away (location_until is in the future).
 * Falls back to non-skip behaviour if all are away.
 */
export function currentRotationAssignee(
  chore: Chore,
  members: FamilyMember[],
  date: Date = new Date(),
): string | null {
  const { rotation_roster, rotation_pointer, rotation_anchor_iso_week } = chore;
  if (!rotation_roster || rotation_roster.length === 0) return null;

  const currentWeek = isoWeekStr(date);
  const anchor = rotation_anchor_iso_week || currentWeek;
  const offset = Math.max(0, weeksBetween(anchor, currentWeek));

  // Try each slot in order; skip members who are away
  for (let attempt = 0; attempt < rotation_roster.length; attempt++) {
    const idx = (rotation_pointer + offset + attempt) % rotation_roster.length;
    const memberId = rotation_roster[idx];
    const member = members.find((m) => m.id === memberId);
    if (member && !isMemberAway(member)) return memberId;
  }

  // All away — ignore skip logic
  const fallbackIdx = (rotation_pointer + offset) % rotation_roster.length;
  return rotation_roster[fallbackIdx] ?? null;
}

/**
 * Returns a map of member_id → role label for roster_role chores.
 * Used by MemberStrip to show "Bins person" badges.
 */
export function rosterRoleAssignments(
  chores: Chore[],
  members: FamilyMember[],
  date: Date = new Date(),
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const chore of chores) {
    if (chore.mode !== 'roster_role' || chore.archived) continue;
    const assigneeId = currentRotationAssignee(chore, members, date);
    if (!assigneeId) continue;
    const label = chore.roster_role_name || chore.title;
    const existing = result.get(assigneeId) || [];
    result.set(assigneeId, [...existing, label]);
  }

  return result;
}
