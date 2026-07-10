import { memo, useMemo, useState } from 'react';
import { localISO } from '@/lib/dates';
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Sparkles,
  PiggyBank,
  Trophy,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { startOfWeek } from 'date-fns';
import { useMembersData, useChoresData, useFamilyActions } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { useToday } from '@/hooks/useToday';
import { Avatar } from '@/components/Avatar';
import { DragHandle } from '@/components/DragHandle';
import { DropIndicator } from '@/components/DropIndicator';
import { ChoreEditor } from '@/components/ChoreEditor';
import { useListDragReorder } from '@/hooks/useListDragReorder';
import { RedemptionModal } from '@/components/RedemptionModal';
import { SwipeableRow } from '@/components/SwipeableRow';
import { getColorTokens } from '@/lib/colors';
import {
  formatBalance,
  formatPayout,
  formatFrequency,
  getChoresForMemberOnDate,
  isParent,
  weeklyEarnings,
  type ChoreItem,
} from '@/lib/chores';
import { currentRotationAssignee } from '@/lib/rotation';
import type { Chore, ChoreCompletion, FamilyMember, Redemption, RewardCategoryKey } from '@/types';
import { formatDistanceToNow } from 'date-fns';

export function ChoresPage() {
  const { activeMember } = useMembersData();
  if (!activeMember) return null;
  return isParent(activeMember) ? <ParentView /> : <KidView member={activeMember} />;
}

// ============================================================================
// KID VIEW
// ============================================================================

function KidView({ member }: { member: FamilyMember }) {
  const { chores, completions, goals, rewardCategories } = useChoresData();
  const { completeChore, deleteCompletion } = useFamilyActions();
  const { resolved } = useTheme();
  const { show } = useToast();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const tokens = getColorTokens(member.color, resolved === 'dark');

  // Live "today" — a frozen useMemo(new Date) kept showing yesterday's chores
  // on a kitchen device left open past midnight.
  const today = useToday();
  const choreItems = useMemo(() => {
    const raw = getChoresForMemberOnDate(chores, completions, member.id, today);
    // For rotated/roster_role chores, filter out entries where it's not this member's week
    return raw.filter((item) => {
      const chore = chores.find((c) => c.id === item.chore.id);
      if (!chore || chore.mode === 'standard') return true;
      const assignee = currentRotationAssignee(chore, today);
      return assignee === member.id;
    });
  }, [chores, completions, member.id, today]);

  const memberGoal = goals.find((g) => g.member_id === member.id && !g.achieved_at);
  const goalProgress = memberGoal
    ? Math.min(
        100,
        ((member.reward_balances[memberGoal.category] || 0) / memberGoal.target_amount) * 100,
      )
    : 0;

  const stats = {
    todo: choreItems.filter((c) => c.state === 'todo').length,
    pending: choreItems.filter((c) => c.state === 'pending').length,
    done: choreItems.filter((c) => c.state === 'done').length,
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Personal header */}
      <div
        className="card p-5 sm:p-6 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${tokens.soft}, rgb(var(--surface)))`,
        }}
      >
        <div className="flex items-center gap-4 mb-5">
          <Avatar member={member} size={64} />
          <div className="flex-1 min-w-0">
            <div className="text-xs tracking-widest text-text-faint mb-0.5">Hi</div>
            <h1 className="font-display text-3xl text-text">{member.name}</h1>
          </div>
          <button
            onClick={() => setRedeemOpen(true)}
            className="px-4 py-2.5 bg-accent-strong text-white text-sm font-medium rounded-md hover:opacity-90 whitespace-nowrap"
          >
            Spend points
          </button>
        </div>

        {/* Balances */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {rewardCategories.map((c) => {
            const Icon =
              c.key === 'stars' ? Sparkles : c.key === 'screen_minutes' ? Clock : PiggyBank;
            const bal = member.reward_balances[c.key] || 0;
            return (
              <div key={c.key} className="bg-surface rounded-md p-3 border border-border">
                <div className="flex items-center gap-1.5 text-text-faint text-[10px] uppercase tracking-wider mb-1">
                  <Icon size={11} />
                  {c.label}
                </div>
                <div
                  className="text-2xl font-display font-medium tabular-nums"
                  style={{ color: tokens.base }}
                >
                  {formatBalance(c.key, bal)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Goal progress */}
        {memberGoal && (
          <div className="bg-surface rounded-md p-3 border border-border">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-text-muted">
                Saving for <span className="text-text font-medium">{memberGoal.title}</span>
              </span>
              <span className="text-text font-medium tabular-nums">
                {formatBalance(
                  memberGoal.category,
                  member.reward_balances[memberGoal.category] || 0,
                )}
                <span className="text-text-faint">
                  {' '}
                  / {formatBalance(memberGoal.category, memberGoal.target_amount)}
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              {/* translateX (compositor) instead of width (layout) */}
              <div
                className="h-full w-full rounded-full transition-transform"
                style={{ transform: `translateX(${goalProgress - 100}%)`, background: tokens.base }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Today's chores */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-xl text-text">Today's chores</h2>
          <div className="text-xs text-text-faint">
            {stats.done} done · {stats.todo} to go
            {stats.pending > 0 && ` · ${stats.pending} waiting`}
          </div>
        </div>
        {choreItems.length === 0 ? (
          <div className="py-8 text-center text-text-faint text-sm">
            <Trophy size={32} className="mx-auto mb-2 opacity-50" />
            No chores today. Enjoy! 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {choreItems.map((item) => (
              <KidChoreRow
                key={item.chore.id}
                item={item}
                memberId={member.id}
                onComplete={() => {
                  const completion = completeChore(item.chore.id, member.id, localISO(today));
                  show({
                    message: `"${item.chore.title}" done!`,
                    onUndo: () => deleteCompletion(completion.id),
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <RedemptionModal open={redeemOpen} member={member} onClose={() => setRedeemOpen(false)} />
    </div>
  );
}

type KidChoreRowProps = {
  item: ChoreItem;
  memberId: string;
  onComplete: () => void;
};

// Memo: the kid view recomputes choreItems on any chores/completions change;
// compare the fields this row renders so an unrelated chore's update doesn't
// re-render every row. onComplete is a per-render closure but stable in
// behaviour for this chore.id, so it's intentionally excluded.
function areKidRowsEqual(a: KidChoreRowProps, b: KidChoreRowProps): boolean {
  return (
    a.item.state === b.item.state &&
    a.item.chore.id === b.item.chore.id &&
    a.item.chore.title === b.item.chore.title &&
    a.item.chore.description === b.item.chore.description &&
    a.item.chore.payout === b.item.chore.payout
  );
}

const KidChoreRow = memo(function KidChoreRow({
  item,
  onComplete,
}: KidChoreRowProps) {
  const isDone = item.state === 'done';
  const isPending = item.state === 'pending';
  const isRejected = item.state === 'rejected';

  const Icon = isDone ? CheckCircle2 : isPending ? Clock : Circle;
  const iconColor = isDone
    ? 'text-accent'
    : isPending
      ? 'text-text-muted'
      : isRejected
        ? 'text-accent/50'
        : 'text-text-faint';

  return (
    <button
      onClick={item.state === 'todo' ? onComplete : undefined}
      disabled={item.state !== 'todo'}
      className={
        'w-full flex items-center gap-3 p-3 rounded-md border text-left transition-[transform,border-color,background-color] ' +
        (item.state === 'todo'
          ? 'border-border hover:border-accent hover:bg-accent-soft active:scale-[0.99] cursor-pointer'
          : 'border-border bg-surface-2/50 cursor-default')
      }
    >
      <Icon size={22} className={iconColor + ' shrink-0'} strokeWidth={isDone ? 2 : 1.5} />
      <div className="flex-1 min-w-0">
        <div
          className={
            'text-sm font-medium ' + (isDone ? 'text-text-muted line-through' : 'text-text')
          }
        >
          {item.chore.title}
        </div>
        {item.chore.description && (
          <div className="text-xs text-text-faint truncate">{item.chore.description}</div>
        )}
        {isPending && (
          <div className="text-xs text-text-muted mt-0.5">⏳ Waiting for parent approval</div>
        )}
        {isRejected && <div className="text-xs text-accent mt-0.5">✗ Try again</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-medium text-text-muted whitespace-nowrap">
          {formatPayout(item.chore.payout)}
        </span>
      </div>
    </button>
  );
}, areKidRowsEqual);

// ============================================================================
// PARENT VIEW
// ============================================================================

type ParentTab = 'overview' | 'manage' | 'approvals';

function ParentView() {
  const [tab, setTab] = useState<ParentTab>('overview');
  const { completions, redemptions } = useChoresData();

  const pendingCount =
    completions.filter((c) => c.status === 'pending_approval').length +
    redemptions.filter((r) => r.status === 'pending_approval').length;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Sub-nav */}
      <div className="flex bg-surface-2 rounded-md p-0.5 self-start">
        {[
          { v: 'overview' as ParentTab, label: 'Overview' },
          { v: 'manage' as ParentTab, label: 'Manage chores' },
          {
            v: 'approvals' as ParentTab,
            label: pendingCount > 0 ? `Approvals (${pendingCount})` : 'Approvals',
          },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={
              'px-4 py-2 rounded-sm text-sm transition-colors ' +
              (tab === t.v ? 'bg-surface text-text shadow-sm font-medium' : 'text-text-muted')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <ParentOverview />}
      {tab === 'manage' && <ParentManage />}
      {tab === 'approvals' && <ParentApprovals />}
    </div>
  );
}

function ParentOverview() {
  const { completions, chores, goals, rewardCategories } = useChoresData();
  const { members } = useMembersData();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const kids = members.filter((m) => m.role === 'child');
  const today = useToday();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kids.map((kid) => {
          const tokens = getColorTokens(kid.color, isDark);
          const rawItems = getChoresForMemberOnDate(chores, completions, kid.id, today);
          const items = rawItems.filter((item) => {
            const chore = chores.find((c) => c.id === item.chore.id);
            if (!chore || chore.mode === 'standard') return true;
            const assignee = currentRotationAssignee(chore, today);
            return assignee === kid.id;
          });
          const todayDone = items.filter((i) => i.state === 'done').length;
          const earnings = weeklyEarnings(completions, kid.id, weekStart);
          const goal = goals.find((g) => g.member_id === kid.id && !g.achieved_at);
          const goalProgress = goal
            ? Math.min(100, ((kid.reward_balances[goal.category] || 0) / goal.target_amount) * 100)
            : 0;

          return (
            <div key={kid.id} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar member={kid} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-text">{kid.name}</div>
                  <div className="text-xs text-text-faint">
                    {todayDone}/{items.length} chores today
                  </div>
                </div>
              </div>

              {/* Balances */}
              <div className="grid grid-cols-3 gap-1.5 mb-3 text-center">
                {rewardCategories.map((c) => (
                  <div key={c.key} className="bg-surface-2 rounded-md p-2">
                    <div className="text-[10px] uppercase tracking-wider text-text-faint mb-0.5">
                      {c.label}
                    </div>
                    <div
                      className="text-sm font-medium tabular-nums"
                      style={{ color: tokens.base }}
                    >
                      {formatBalance(c.key, kid.reward_balances[c.key] || 0)}
                    </div>
                  </div>
                ))}
              </div>

              {/* This week */}
              <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">
                Earned this week
              </div>
              <div className="text-xs text-text mb-3">
                {Object.entries(earnings).length === 0 ? (
                  <span className="text-text-faint">Nothing yet</span>
                ) : (
                  Object.entries(earnings)
                    .map(([k, v]) => formatBalance(k as RewardCategoryKey, v as number))
                    .join(' · ')
                )}
              </div>

              {/* Goal */}
              {goal && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">
                    Saving for
                  </div>
                  <div className="text-xs text-text mb-1.5 truncate">{goal.title}</div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full"
                      style={{ width: `${goalProgress}%`, background: tokens.base }}
                    />
                  </div>
                  <div className="text-[10px] text-text-faint mt-1 text-right tabular-nums">
                    {formatBalance(goal.category, kid.reward_balances[goal.category] || 0)}
                    {' / '}
                    {formatBalance(goal.category, goal.target_amount)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParentManage() {
  const { chores } = useChoresData();
  const { members } = useMembersData();
  const { deleteChore, restoreChore, reorderChores } = useFamilyActions();
  const { show } = useToast();
  const swipeMode = useSwipeMode();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Chore | null>(null);
  const activeChores = chores.filter((c) => !c.archived);
  const choreDnd = useListDragReorder(activeChores, reorderChores);

  const handleNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleEdit = (c: Chore) => {
    setEditing(c);
    setEditorOpen(true);
  };

  const handleDeleteChore = (c: Chore) => {
    const snapshot = c;
    deleteChore(c.id);
    show({
      message: `"${snapshot.title}" deleted`,
      // Restore the exact row (same id) — recreating via addChore minted a new
      // id, orphaning every completion in the history/stats views.
      onUndo: () => restoreChore(snapshot),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-lg text-text">All chores</h2>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent-strong text-white text-sm font-medium rounded-md hover:opacity-90"
        >
          <Plus size={16} /> New chore
        </button>
      </div>

      <div className="card divide-y divide-border">
        {activeChores.map((c) => (
          <ManageChoreRow
            key={c.id}
            chore={c}
            members={members}
            swipeMode={swipeMode}
            dragProps={choreDnd.getRowProps(c.id)}
            onEdit={handleEdit}
            onDelete={handleDeleteChore}
          />
        ))}
        {activeChores.length === 0 && (
          <div className="p-6 text-center text-text-faint text-sm">
            No chores yet. Tap "New chore" above.
          </div>
        )}
      </div>

      <ChoreEditor open={editorOpen} onClose={() => setEditorOpen(false)} editing={editing} />
    </div>
  );
}

type ManageChoreRowProps = {
  chore: Chore;
  members: FamilyMember[];
  swipeMode: 'partial' | 'full';
  dragProps: ReturnType<ReturnType<typeof useListDragReorder<Chore>>['getRowProps']>;
  onEdit: (c: Chore) => void;
  onDelete: (c: Chore) => void;
};

// Memo: ParentManage re-renders on any chores/members/completions change (and
// the 90s cloud poll). Compare what the row renders — chore identity, the
// title/frequency/payout/assignees it shows, members ref, swipeMode, and drag
// primitives — so editing or completing one chore doesn't re-render every row.
// onEdit/onDelete are stable in behaviour for this chore and excluded.
function areManageRowsEqual(a: ManageChoreRowProps, b: ManageChoreRowProps): boolean {
  return (
    a.chore === b.chore &&
    a.members === b.members &&
    a.swipeMode === b.swipeMode &&
    a.dragProps.isDragging === b.dragProps.isDragging &&
    a.dragProps.dropEdge === b.dragProps.dropEdge
  );
}

const ManageChoreRow = memo(function ManageChoreRow({
  chore: c,
  members,
  swipeMode,
  dragProps,
  onEdit,
  onDelete,
}: ManageChoreRowProps) {
  const { dropEdge, handleProps, ...rowHandlers } = dragProps;
  return (
    <div className="relative">
      {dropEdge && <DropIndicator edge={dropEdge} />}
      <SwipeableRow mode={swipeMode} onDelete={() => onDelete(c)}>
        <div
          {...rowHandlers}
          onClick={() => onEdit(c)}
          className="relative w-full flex items-center gap-3 p-3 bg-surface-2/40 hover:bg-surface-2/70 transition-colors cursor-pointer select-none first:rounded-t-lg last:rounded-b-lg"
        >
          <DragHandle handleProps={handleProps} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text">{c.title}</div>
            <div className="text-xs text-text-faint">
              {formatFrequency(c)} · {formatPayout(c.payout)}
            </div>
          </div>
          <div className="flex -space-x-1.5">
            {c.assigned_to.map((id) => {
              const m = members.find((x) => x.id === id);
              if (!m) return null;
              return <Avatar key={id} member={m} size={26} />;
            })}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(c);
            }}
            className="w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text shrink-0"
          >
            <Pencil size={12} />
          </button>
        </div>
      </SwipeableRow>
    </div>
  );
}, areManageRowsEqual);

function ParentApprovals() {
  const { completions, redemptions, chores } = useChoresData();
  const { members, activeMember, isFamilyMode } = useMembersData();
  const { approveCompletion, rejectCompletion, approveRedemption, rejectRedemption } =
    useFamilyActions();

  const [view, setView] = useState<'pending' | 'history'>('pending');

  const pendingCompletions = completions.filter((c) => c.status === 'pending_approval');
  const pendingRedemptions = redemptions.filter((r) => r.status === 'pending_approval');

  const historyCompletions = completions
    .filter((c) => c.status === 'approved' || c.status === 'rejected')
    .sort((a, b) => (b.approved_at ?? b.created_at).localeCompare(a.approved_at ?? a.created_at))
    .slice(0, 50);
  const historyRedemptions = redemptions
    .filter((r) => r.status === 'approved' || r.status === 'rejected')
    .sort((a, b) => (b.approved_at ?? b.created_at).localeCompare(a.approved_at ?? a.created_at))
    .slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="flex bg-surface-2 rounded-md p-0.5 self-start">
        {[
          {
            v: 'pending' as const,
            label:
              pendingCompletions.length + pendingRedemptions.length > 0
                ? `Pending (${pendingCompletions.length + pendingRedemptions.length})`
                : 'Pending',
          },
          { v: 'history' as const, label: 'History' },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setView(t.v)}
            className={
              'px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ' +
              (view === t.v ? 'bg-surface text-text shadow-sm' : 'text-text-muted')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'history' ? (
        <HistoryView
          completions={historyCompletions}
          redemptions={historyRedemptions}
          chores={chores}
          members={members}
        />
      ) : pendingCompletions.length === 0 && pendingRedemptions.length === 0 ? (
        <div className="card p-12 text-center">
          <Check size={36} className="mx-auto mb-3 text-text-faint opacity-50" />
          <div className="font-display text-lg text-text mb-1">All caught up</div>
          <div className="text-sm text-text-faint">No approvals waiting.</div>
        </div>
      ) : isFamilyMode ? (
        // Approving/rejecting must be done by a real parent (the approver id is
        // recorded), so the shared Family profile sees the queue read-only.
        <div className="card p-12 text-center">
          <div className="font-display text-lg text-text mb-1">
            {pendingCompletions.length + pendingRedemptions.length} waiting for a parent
          </div>
          <div className="text-sm text-text-faint">
            Switch from the shared Family profile to a parent to approve or reject.
          </div>
        </div>
      ) : (
        <PendingView
          pendingCompletions={pendingCompletions}
          pendingRedemptions={pendingRedemptions}
          chores={chores}
          members={members}
          activeMemberId={activeMember?.id || ''}
          approveCompletion={approveCompletion}
          rejectCompletion={rejectCompletion}
          approveRedemption={approveRedemption}
          rejectRedemption={rejectRedemption}
        />
      )}
    </div>
  );
}

function PendingView({
  pendingCompletions,
  pendingRedemptions,
  chores,
  members,
  activeMemberId,
  approveCompletion,
  rejectCompletion,
  approveRedemption,
  rejectRedemption,
}: {
  pendingCompletions: ChoreCompletion[];
  pendingRedemptions: Redemption[];
  chores: Chore[];
  members: FamilyMember[];
  activeMemberId: string;
  approveCompletion: (id: string, approverId: string) => void;
  rejectCompletion: (id: string, approverId: string) => void;
  approveRedemption: (id: string, approverId: string) => void;
  rejectRedemption: (id: string, approverId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {pendingCompletions.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
            Chore completions
          </div>
          <div className="card divide-y divide-border">
            {pendingCompletions.map((c) => {
              const chore = chores.find((x) => x.id === c.chore_id);
              const m = members.find((x) => x.id === c.member_id);
              if (!chore || !m) return null;
              return (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <Avatar member={m} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text">{chore.title}</div>
                    <div className="text-xs text-text-faint">
                      {m.name} · {formatPayout(c.payout)}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => rejectCompletion(c.id, activeMemberId)}
                      className="w-9 h-9 rounded-md border border-border hover:bg-surface-2 flex items-center justify-center text-text-muted hover:text-accent"
                      title="Reject"
                    >
                      <X size={16} />
                    </button>
                    <button
                      onClick={() => approveCompletion(c.id, activeMemberId)}
                      className="w-9 h-9 rounded-md bg-accent-strong text-white hover:opacity-90 flex items-center justify-center"
                      title="Approve"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {pendingRedemptions.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
            Spending requests
          </div>
          <div className="card divide-y divide-border">
            {pendingRedemptions.map((r) => {
              const m = members.find((x) => x.id === r.member_id);
              if (!m) return null;
              return (
                <div key={r.id} className="flex items-center gap-3 p-3">
                  <Avatar member={m} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text">
                      {m.name}: {r.reason}
                    </div>
                    <div className="text-xs text-text-faint">
                      Spending {formatBalance(r.category, r.amount)}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => rejectRedemption(r.id, activeMemberId)}
                      className="w-9 h-9 rounded-md border border-border hover:bg-surface-2 flex items-center justify-center text-text-muted hover:text-accent"
                      title="Reject"
                    >
                      <X size={16} />
                    </button>
                    <button
                      onClick={() => approveRedemption(r.id, activeMemberId)}
                      className="w-9 h-9 rounded-md bg-accent-strong text-white hover:opacity-90 flex items-center justify-center"
                      title="Approve"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function HistoryView({
  completions,
  redemptions,
  chores,
  members,
}: {
  completions: ChoreCompletion[];
  redemptions: Redemption[];
  chores: Chore[];
  members: FamilyMember[];
}) {
  if (completions.length === 0 && redemptions.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="font-display text-lg text-text mb-1">No history yet</div>
        <div className="text-sm text-text-faint">
          Approvals and rejections from chores and spending requests will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {completions.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
            Chore completions
          </div>
          <div className="card divide-y divide-border">
            {completions.map((c) => {
              const chore = chores.find((x) => x.id === c.chore_id);
              const m = members.find((x) => x.id === c.member_id);
              const approver = c.approved_by ? members.find((x) => x.id === c.approved_by) : null;
              if (!chore || !m) return null;
              const isApproved = c.status === 'approved';
              const when = c.approved_at ?? c.created_at;
              const approverLabel = approver ? approver.name : 'Auto';
              return (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <Avatar member={m} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text truncate">{chore.title}</div>
                    <div className="text-xs text-text-faint">
                      {m.name} · {formatPayout(c.payout)} ·{' '}
                      {formatDistanceToNow(new Date(when), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={
                        'flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ' +
                        (isApproved
                          ? 'text-success bg-success/10'
                          : 'text-text-muted bg-surface-2')
                      }
                    >
                      {isApproved ? <Check size={11} /> : <X size={11} />}
                      {isApproved ? 'Approved' : 'Rejected'}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-text-muted">
                      {approver && <Avatar member={approver} size={16} />}
                      <span>{approverLabel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {redemptions.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
            Spending requests
          </div>
          <div className="card divide-y divide-border">
            {redemptions.map((r) => {
              const m = members.find((x) => x.id === r.member_id);
              const approver = r.approved_by ? members.find((x) => x.id === r.approved_by) : null;
              if (!m) return null;
              const isApproved = r.status === 'approved';
              const when = r.approved_at ?? r.created_at;
              const approverLabel = approver ? approver.name : 'Auto';
              return (
                <div key={r.id} className="flex items-center gap-3 p-3">
                  <Avatar member={m} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text truncate">
                      {m.name}: {r.reason}
                    </div>
                    <div className="text-xs text-text-faint">
                      {formatBalance(r.category, r.amount)} ·{' '}
                      {formatDistanceToNow(new Date(when), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={
                        'flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ' +
                        (isApproved
                          ? 'text-success bg-success/10'
                          : 'text-text-muted bg-surface-2')
                      }
                    >
                      {isApproved ? <Check size={11} /> : <X size={11} />}
                      {isApproved ? 'Approved' : 'Rejected'}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-text-muted">
                      {approver && <Avatar member={approver} size={16} />}
                      <span>{approverLabel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
