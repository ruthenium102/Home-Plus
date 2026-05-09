import type { Chore, FamilyMember } from '@/types';

/** Returns ISO week string YYYY-Www (Monday-based ISO 8601). */
export function isoWeekStr(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function parseIsoWeek(week: string): number {
  const [yearStr, weekStr] = week.split('-W');
  const year = parseInt(yearStr, 10);
  const wk = parseInt(weekStr, 10);
  return year * 54 + wk; // approximate ordinal; good enough for relative offsets
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
  date: Date = new Date()
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
  date: Date = new Date()
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
