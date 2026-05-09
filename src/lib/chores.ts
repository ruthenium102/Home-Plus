import { localISO } from '@/lib/dates';
import type { Chore, ChoreCompletion, FamilyMember, RewardCategoryKey } from '@/types';

/**
 * Is this chore "due" for this member on this date?
 * Considers: assignment list, frequency, weekday, active_from.
 */
export function isChoreDue(
  chore: Chore,
  memberId: string,
  date: Date
): boolean {
  if (chore.archived) return false;
  if (!chore.assigned_to.includes(memberId)) return false;

  const dateISO = localISO(date);
  if (dateISO < chore.active_from) return false;

  const dow = date.getDay(); // 0=Sun..6=Sat

  switch (chore.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekend':
      return dow === 0 || dow === 6;
    case 'weekly':
      return chore.weekdays.includes(dow);
    case 'monthly':
      // Due on the same day-of-month as active_from
      return date.getDate() === parseInt(chore.active_from.slice(8, 10), 10);
    case 'one_off':
      return dateISO === chore.active_from;
    default:
      return false;
  }
}

/**
 * Find the completion for a (chore, member, date), if any.
 * Used to know whether to show the chore as "todo" / "done" / "pending".
 */
export function findCompletion(
  completions: ChoreCompletion[],
  choreId: string,
  memberId: string,
  date: Date
): ChoreCompletion | null {
  const dateISO = localISO(date);
  return (
    completions.find(
      (c) =>
        c.chore_id === choreId && c.member_id === memberId && c.for_date === dateISO
    ) ?? null
  );
}

/**
 * For a given member and day, return all chores due plus their completion state.
 */
export interface ChoreItem {
  chore: Chore;
  completion: ChoreCompletion | null;
  state: 'todo' | 'pending' | 'done' | 'rejected';
}

export function getChoresForMemberOnDate(
  chores: Chore[],
  completions: ChoreCompletion[],
  memberId: string,
  date: Date
): ChoreItem[] {
  return chores
    .filter((c) => isChoreDue(c, memberId, date))
    .map((chore) => {
      const completion = findCompletion(completions, chore.id, memberId, date);
      let state: ChoreItem['state'] = 'todo';
      if (completion) {
        if (completion.status === 'approved') state = 'done';
        else if (completion.status === 'pending_approval') state = 'pending';
        else if (completion.status === 'rejected') state = 'rejected';
      }
      return { chore, completion, state };
    });
}

/**
 * Pretty-format a payout map into "5★ + 15min".
 */
export function formatPayout(
  payout: Partial<Record<RewardCategoryKey, number>>
): string {
  const parts: string[] = [];
  if (payout.stars) parts.push(`${payout.stars}★`);
  if (payout.screen_minutes) parts.push(`${payout.screen_minutes}min`);
  if (payout.savings_cents)
    parts.push(`$${(payout.savings_cents / 100).toFixed(2)}`);
  return parts.join(' + ') || '—';
}

export function formatBalance(
  category: RewardCategoryKey,
  amount: number
): string {
  if (category === 'stars') return `${amount}★`;
  if (category === 'screen_minutes') return `${amount} min`;
  if (category === 'savings_cents') return `$${(amount / 100).toFixed(2)}`;
  return String(amount);
}

/**
 * Pretty-print a chore frequency for display.
 */
export function formatFrequency(chore: Chore): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (chore.frequency) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekend':
      return 'Weekends';
    case 'weekly':
      if (chore.weekdays.length === 0) return 'Weekly';
      return chore.weekdays.map((d) => days[d]).join(', ');
    case 'monthly':
      return 'Monthly';
    case 'one_off':
      return 'One-off';
    default:
      return '—';
  }
}

/**
 * Summarise: how much did this member earn this week?
 */
export function weeklyEarnings(
  completions: ChoreCompletion[],
  memberId: string,
  weekStart: Date
): Partial<Record<RewardCategoryKey, number>> {
  const weekStartISO = localISO(weekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndISO = localISO(weekEnd);

  const totals: Partial<Record<RewardCategoryKey, number>> = {};
  for (const c of completions) {
    if (c.member_id !== memberId) continue;
    if (c.status !== 'approved') continue;
    if (c.for_date < weekStartISO || c.for_date > weekEndISO) continue;
    for (const [k, v] of Object.entries(c.payout)) {
      if (typeof v !== 'number') continue;
      totals[k as RewardCategoryKey] = (totals[k as RewardCategoryKey] || 0) + v;
    }
  }
  return totals;
}

/**
 * Filter chores assigned to a member (any frequency, not date-based).
 */
export function getChoresForMember(chores: Chore[], memberId: string): Chore[] {
  return chores.filter(
    (c) => !c.archived && c.assigned_to.includes(memberId)
  );
}

export function isParent(member: FamilyMember | null | undefined): boolean {
  return member?.role === 'parent';
}
