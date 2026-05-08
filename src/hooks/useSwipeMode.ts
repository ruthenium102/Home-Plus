import { useFamily } from '@/context/FamilyContext';
import { isParent } from '@/lib/chores';

/**
 * Parents get full-swipe (fast). Kids get partial-swipe (safer).
 * When no member is active, default to partial.
 */
export function useSwipeMode(): 'partial' | 'full' {
  const { activeMember } = useFamily();
  return isParent(activeMember) ? 'full' : 'partial';
}
