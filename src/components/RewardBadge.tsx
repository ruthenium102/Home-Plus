import type { RewardCategoryKey } from '@/types';
import { formatBalance } from '@/lib/chores';

interface Props {
  category: RewardCategoryKey;
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  color?: string; // optional accent override
}

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5'
};

export function RewardBadge({ category, amount, size = 'md', color }: Props) {
  return (
    <span
      className={
        'inline-flex items-center font-medium rounded-full bg-surface-2 text-text ' +
        SIZE_CLASSES[size]
      }
      style={color ? { color } : undefined}
    >
      {formatBalance(category, amount)}
    </span>
  );
}
