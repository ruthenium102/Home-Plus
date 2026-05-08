import type { TodoItem, TodoList, ListItemRepeat, FamilyMember } from '@/types';

/**
 * Filter visible lists for the active member.
 * - Shared lists (owner_id null) are visible to everyone.
 * - Private lists are visible only to their owner.
 */
export function visibleLists(lists: TodoList[], activeMemberId: string): TodoList[] {
  return lists.filter(
    (l) => !l.archived && (l.owner_id === null || l.owner_id === activeMemberId)
  );
}

/**
 * Sort items: not-done above done; within each, by position then alpha.
 */
export function sortedItems(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.position !== b.position) return a.position - b.position;
    return a.title.localeCompare(b.title);
  });
}

const REPEAT_LABELS: Record<ListItemRepeat, string> = {
  never: 'Never',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  biannually: 'Every 6 months',
  yearly: 'Every year'
};

export function formatRepeat(repeat: ListItemRepeat): string {
  return REPEAT_LABELS[repeat];
}

/**
 * Is an item's due date within the next N days?
 */
export function isDueSoon(item: TodoItem, withinDays: number = 7): boolean {
  const target = item.next_due || item.due_date;
  if (!target) return false;
  if (item.done && item.repeat === 'never') return false;
  const diff =
    (new Date(target).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000;
  return diff >= 0 && diff <= withinDays;
}

export function isOverdue(item: TodoItem): boolean {
  const target = item.next_due || item.due_date;
  if (!target) return false;
  if (item.done && item.repeat === 'never') return false;
  return new Date(target) < new Date(new Date().setHours(0, 0, 0, 0));
}

/**
 * Pretty-format a due date relative to today.
 */
export function formatDue(iso: string | null): string {
  if (!iso) return '';
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${-days} days ago`;
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} weeks`;
  return target.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * For shared lists, who's been assigned an item?
 */
export function findAssignee(
  members: FamilyMember[],
  item: TodoItem
): FamilyMember | null {
  if (!item.assigned_to) return null;
  return members.find((m) => m.id === item.assigned_to) ?? null;
}

export const REPEAT_OPTIONS: { v: ListItemRepeat; label: string }[] = [
  { v: 'never', label: 'No repeat' },
  { v: 'daily', label: 'Daily' },
  { v: 'weekly', label: 'Weekly' },
  { v: 'monthly', label: 'Monthly' },
  { v: 'quarterly', label: 'Every 3 months' },
  { v: 'biannually', label: 'Every 6 months' },
  { v: 'yearly', label: 'Yearly' }
];
