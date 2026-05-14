import { useState } from 'react';
import { X, Sparkles, Clock, PiggyBank } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { formatBalance } from '@/lib/chores';
import type { FamilyMember, RewardCategoryKey } from '@/types';

interface Props {
  open: boolean;
  member: FamilyMember | null;
  onClose: () => void;
}

const PRESETS: Record<
  RewardCategoryKey,
  { amount: number; reason: string }[]
> = {
  stars: [
    { amount: 10, reason: 'Treat from the cupboard' },
    { amount: 25, reason: 'Pick the movie tonight' },
    { amount: 50, reason: 'Friend over for the day' }
  ],
  screen_minutes: [
    { amount: 15, reason: 'Quick gaming break' },
    { amount: 30, reason: 'After-school screen time' },
    { amount: 60, reason: 'Movie / longer session' }
  ],
  savings_cents: [
    { amount: 500, reason: 'Save toward goal' },
    { amount: 1000, reason: 'Save toward goal' },
    { amount: 2500, reason: 'Save toward goal' }
  ]
};

const ICON: Record<RewardCategoryKey, typeof Sparkles> = {
  stars: Sparkles,
  screen_minutes: Clock,
  savings_cents: PiggyBank
};

export function RedemptionModal({ open, member, onClose }: Props) {
  const { rewardCategories, requestRedemption } = useFamily();
  const [category, setCategory] = useState<RewardCategoryKey>('stars');
  const [amount, setAmount] = useState<number>(15);
  const [reason, setReason] = useState('');

  if (!open || !member) return null;

  const balance = member.reward_balances[category] || 0;
  const cat = rewardCategories.find((c) => c.key === category)!;
  const insufficient = amount > balance;

  // Auto-approval feedback for the kid
  const willAutoApprove =
    cat.auto_approve_under !== null &&
    cat.auto_approve_under > 0 &&
    amount <= cat.auto_approve_under &&
    !insufficient;

  const handleSubmit = () => {
    if (insufficient || amount <= 0 || !reason.trim()) return;
    requestRedemption(member.id, category, amount, reason.trim());
    onClose();
    // Reset
    setAmount(15);
    setReason('');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display text-xl text-text">Spend points</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Category picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {rewardCategories.map((c) => {
              const Icon = ICON[c.key];
              const memberBal = member.reward_balances[c.key] || 0;
              const isActive = category === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => {
                    setCategory(c.key);
                    setAmount(PRESETS[c.key][0].amount);
                    setReason('');
                  }}
                  className={
                    'flex flex-col items-center gap-1.5 p-3 rounded-md border-2 transition-colors ' +
                    (isActive
                      ? 'border-accent bg-accent-soft'
                      : 'border-border hover:border-border-strong')
                  }
                >
                  <Icon size={18} className={isActive ? 'text-accent' : 'text-text-muted'} />
                  <div
                    className={
                      'text-xs font-medium ' + (isActive ? 'text-text' : 'text-text-muted')
                    }
                  >
                    {c.label}
                  </div>
                  <div className="text-[10px] text-text-faint">
                    {formatBalance(c.key, memberBal)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Preset amounts */}
          <div>
            <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
              Quick picks
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS[category].map((p) => (
                <button
                  key={p.amount}
                  onClick={() => {
                    setAmount(p.amount);
                    setReason(p.reason);
                  }}
                  className={
                    'p-2.5 rounded-md border text-center transition-colors ' +
                    (amount === p.amount
                      ? 'border-accent bg-accent-soft'
                      : 'border-border hover:border-border-strong')
                  }
                >
                  <div className="text-sm font-medium text-text">
                    {formatBalance(category, p.amount)}
                  </div>
                  <div className="text-[10px] text-text-faint truncate">{p.reason}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <label className="text-sm text-text-muted block mb-2">Amount</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
                className="flex-1 px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-base font-medium tabular-nums focus:outline-none focus:border-accent"
              />
              <span className="text-sm text-text-muted">{cat.unit}</span>
            </div>
            <div className="text-xs text-text-faint mt-1.5">
              Balance: {formatBalance(category, balance)}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="text-sm text-text-muted block mb-2">What for?</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Switch time after dinner"
              className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
            />
          </div>

          {/* Approval status hint */}
          <div
            className={
              'text-xs p-3 rounded-md ' +
              (insufficient
                ? 'bg-accent-soft text-accent'
                : willAutoApprove
                  ? 'bg-surface-2 text-text-muted'
                  : 'bg-surface-2 text-text-muted')
            }
          >
            {insufficient
              ? `Not enough — you have ${formatBalance(category, balance)}.`
              : willAutoApprove
                ? '✓ Small spend — approved straight away.'
                : '⏳ Bigger spend — Mum or Dad will need to approve.'}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={insufficient || amount <= 0 || !reason.trim()}
            className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {willAutoApprove ? 'Spend' : 'Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
