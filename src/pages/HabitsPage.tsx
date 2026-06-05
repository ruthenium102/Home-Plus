import { memo, useMemo, useState } from 'react';
import { localISO } from '@/lib/dates';
import { Plus, Pencil, Lock, Users, Flame, Sparkles, Check } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { Avatar } from '@/components/Avatar';
import { DragHandle } from '@/components/DragHandle';
import { HabitEditor } from '@/components/HabitEditor';
import { HabitsStats } from '@/components/HabitsStats';
import { SwipeableRow } from '@/components/SwipeableRow';
import { useListDragReorder } from '@/hooks/useListDragReorder';
import { getColorTokens } from '@/lib/colors';
import {
  computeHabitStreak,
  computeWeeklyStreak,
  weeklyProgress,
  isCheckedIn,
  lastNDays,
  visibleHabits,
  nextStreakMilestone,
  targetMet,
  targetLabel,
  habitCellState,
  type HabitCellState,
} from '@/lib/habits';
import type { Habit } from '@/types';

export function HabitsPage() {
  const {
    habits,
    checkIns,
    members,
    activeMember,
    toggleCheckIn,
    incrementCheckIn,
    decrementCheckIn,
    deleteHabit,
    addHabit,
    reorderHabits,
  } = useFamily();
  // Drag-to-reorder applies only to the active member's own habits — other
  // sections are read-only. The hook walks the full habit array so the new
  // global order preserves cross-member positions naturally.
  const habitDnd = useListDragReorder(habits, reorderHabits);
  const { resolved } = useTheme();
  const { show } = useToast();
  const swipeMode = useSwipeMode();
  const isDark = resolved === 'dark';

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [view, setView] = useState<'list' | 'stats'>('list');

  const handleDeleteHabit = (h: Habit) => {
    const snapshot = h;
    deleteHabit(h.id);
    show({
      message: `"${snapshot.title}" deleted`,
      onUndo: () => {
        addHabit({
          title: snapshot.title,
          description: snapshot.description,
          member_id: snapshot.member_id,
          cadence: snapshot.cadence,
          weekdays: snapshot.weekdays ?? [],
          visibility: snapshot.visibility,
          streak_rewards: snapshot.streak_rewards,
          archived: snapshot.archived,
          count_mode: snapshot.count_mode ?? false,
          daily_target: snapshot.daily_target ?? 1,
          target_op: snapshot.target_op,
          week_start: snapshot.week_start ?? null,
        });
      },
    });
  };

  const habitsToShow = useMemo(
    () => (activeMember ? visibleHabits(habits, activeMember.id) : []),
    [habits, activeMember],
  );

  // Group by member for cleaner display
  const byMember = useMemo(() => {
    const map = new Map<string, Habit[]>();
    for (const h of habitsToShow) {
      const arr = map.get(h.member_id) || [];
      arr.push(h);
      map.set(h.member_id, arr);
    }
    // Active member first, others after
    const ordered: { member: (typeof members)[number]; list: Habit[] }[] = [];
    if (activeMember && map.has(activeMember.id)) {
      ordered.push({ member: activeMember, list: map.get(activeMember.id)! });
    }
    for (const m of members) {
      if (m.id === activeMember?.id) continue;
      if (map.has(m.id)) ordered.push({ member: m, list: map.get(m.id)! });
    }
    return ordered;
  }, [habitsToShow, members, activeMember]);

  const today = new Date();
  const todayISO = localISO(today);

  const handleNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-5 max-w-4xl xl:max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-text">Habits</h1>
        {view === 'list' && (
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90"
          >
            <Plus size={16} /> New habit
          </button>
        )}
      </div>

      <div className="flex bg-surface-2 rounded-md p-0.5 self-start">
        {[
          { v: 'list' as const, label: 'Habits' },
          { v: 'stats' as const, label: 'Stats' },
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

      {view === 'stats' ? (
        <HabitsStats />
      ) : byMember.length === 0 ? (
        <div className="card p-12 text-center">
          <Sparkles size={32} className="mx-auto mb-3 text-text-faint opacity-50" />
          <div className="font-display text-lg text-text mb-1">No habits yet</div>
          <div className="text-sm text-text-faint mb-4">
            Build a daily routine — read, walk, practise — and watch the streaks add up.
          </div>
          <button onClick={handleNew} className="text-sm text-accent hover:underline">
            Create your first habit →
          </button>
        </div>
      ) : (
        byMember.map(({ member, list }) => {
          const tokens = getColorTokens(member.color, isDark);
          const isActive = member.id === activeMember?.id;
          return (
            <section key={member.id} className="card p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-4">
                <Avatar member={member} size={36} />
                <div className="flex-1">
                  <div className="font-display text-lg text-text">
                    {member.name}
                    {isActive && <span className="text-text-faint text-sm font-sans"> · you</span>}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {list.length} habit{list.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {list.map((habit) => {
                  const todayCheckIn = checkIns.find(
                    (c) =>
                      c.habit_id === habit.id &&
                      c.member_id === member.id &&
                      c.for_date === todayISO,
                  );
                  const todayCount = todayCheckIn ? (todayCheckIn.count ?? 1) : 0;
                  const target = habit.daily_target ?? 1;
                  const isWeekly = habit.cadence === 'weekly';

                  // Weekly habits show the current configured week and judge
                  // compliance on the week total; everything else shows a
                  // rolling 7-day strip judged per day.
                  const wp = isWeekly
                    ? weeklyProgress(checkIns, habit, member.id, today)
                    : null;
                  const last7Data = wp
                    ? wp.days.map((d) => ({
                        date: d.date,
                        checked: wp.state === 'met',
                        count: d.count,
                      }))
                    : lastNDays(checkIns, habit.id, member.id, 7).map((d) => {
                        const ci = checkIns.find(
                          (c) =>
                            c.habit_id === habit.id &&
                            c.member_id === member.id &&
                            c.for_date === d.date,
                        );
                        const dayCount = ci ? (ci.count ?? 1) : 0;
                        return {
                          date: d.date,
                          checked: targetMet(dayCount, target, habit.target_op),
                          count: dayCount,
                        };
                      });

                  const dragProps = isActive ? habitDnd.getRowProps(habit.id) : null;
                  const row = (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      color={tokens}
                      canEdit={isActive}
                      canCheck={isActive}
                      todayISO={todayISO}
                      isCheckedToday={isCheckedIn(checkIns, habit.id, member.id, today)}
                      streak={
                        isWeekly
                          ? computeWeeklyStreak(checkIns, habit, member.id)
                          : computeHabitStreak(checkIns, habit.id, member.id)
                      }
                      weekly={wp ? { state: wp.state, count: wp.count, target: wp.target } : null}
                      last7={last7Data}
                      todayCount={todayCount}
                      dragProps={dragProps}
                      onToggle={() => toggleCheckIn(habit.id, member.id, todayISO)}
                      onToggleDate={(iso) => toggleCheckIn(habit.id, member.id, iso)}
                      onIncrement={() => incrementCheckIn(habit.id, member.id, todayISO)}
                      onDecrement={() => decrementCheckIn(habit.id, member.id, todayISO)}
                      onIncrementDate={(iso) => incrementCheckIn(habit.id, member.id, iso)}
                      onDecrementDate={(iso) => decrementCheckIn(habit.id, member.id, iso)}
                      onEdit={() => {
                        setEditing(habit);
                        setEditorOpen(true);
                      }}
                    />
                  );
                  // Only allow swipe-to-delete on your own habits
                  return isActive ? (
                    <SwipeableRow
                      key={habit.id}
                      mode={swipeMode}
                      onDelete={() => handleDeleteHabit(habit)}
                    >
                      {row}
                    </SwipeableRow>
                  ) : (
                    row
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      <HabitEditor
        open={editorOpen}
        editing={editing}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

interface HabitRowProps {
  habit: Habit;
  color: { base: string; soft: string; text: string };
  canEdit: boolean;
  canCheck: boolean;
  todayISO: string;
  isCheckedToday: boolean;
  streak: number;
  // Present for weekly-cadence habits: current-week total, target, and the
  // week's compliance state. null for day-based cadences.
  weekly: { state: HabitCellState; count: number; target: number } | null;
  last7: { date: string; checked: boolean; count: number }[];
  todayCount: number;
  dragProps: ReturnType<ReturnType<typeof useListDragReorder<Habit>>['getRowProps']> | null;
  onToggle: () => void;
  onToggleDate: (iso: string) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onIncrementDate: (iso: string) => void;
  onDecrementDate: (iso: string) => void;
  onEdit: () => void;
}

/**
 * Skip a habit row's re-render unless its own display data changed. The parent
 * recomputes last7/streak/counts for EVERY habit whenever ANY check-in changes,
 * so without this, ticking one habit re-renders every sibling row. We compare
 * the render-affecting data (habit identity, streak, today's count/checked,
 * flags, drag primitives, and the heatmap cells element-wise) and ignore the
 * per-render closure props — each closure captures stable habit.id/member.id
 * for its keyed row, so retaining a prior one on a skipped render is correct.
 */
function areHabitRowsEqual(a: HabitRowProps, b: HabitRowProps): boolean {
  if (
    a.habit !== b.habit ||
    a.canEdit !== b.canEdit ||
    a.canCheck !== b.canCheck ||
    a.todayISO !== b.todayISO ||
    a.isCheckedToday !== b.isCheckedToday ||
    a.streak !== b.streak ||
    a.todayCount !== b.todayCount ||
    (a.weekly?.state ?? null) !== (b.weekly?.state ?? null) ||
    (a.weekly?.count ?? null) !== (b.weekly?.count ?? null) ||
    (a.weekly?.target ?? null) !== (b.weekly?.target ?? null) ||
    a.color.base !== b.color.base ||
    a.color.soft !== b.color.soft ||
    (a.dragProps?.isDragging ?? null) !== (b.dragProps?.isDragging ?? null) ||
    (a.dragProps?.dropEdge ?? null) !== (b.dragProps?.dropEdge ?? null)
  ) {
    return false;
  }
  if (a.last7.length !== b.last7.length) return false;
  for (let i = 0; i < a.last7.length; i++) {
    const x = a.last7[i];
    const y = b.last7[i];
    if (x.date !== y.date || x.checked !== y.checked || x.count !== y.count) return false;
  }
  return true;
}

const HabitRow = memo(function HabitRow({
  habit,
  color,
  canEdit,
  canCheck,
  todayISO,
  isCheckedToday,
  streak,
  weekly,
  last7,
  todayCount,
  dragProps,
  onToggle,
  onToggleDate,
  onIncrement,
  onDecrement,
  onIncrementDate,
  onDecrementDate,
  onEdit,
}: HabitRowProps) {
  void onDecrement;
  void onDecrementDate;
  void onToggle;
  void onIncrement;
  void isCheckedToday;
  void todayCount;
  const isWeekly = habit.cadence === 'weekly';
  const milestone = nextStreakMilestone(streak);
  const milestoneTo = milestone - streak;
  const target = habit.daily_target ?? 1;

  const {
    isOver: _ignoredIsOver,
    dropEdge,
    ...rowHandlers
  } = dragProps ?? { isDragging: false, isOver: false, dropEdge: null as 'top' | 'bottom' | null };
  return (
    <div
      {...(dragProps ? rowHandlers : {})}
      className={
        'flex items-center gap-3 p-3 rounded-md bg-surface-2/40 hover:bg-surface-2/70 transition-colors ' +
        (dropEdge === 'top' ? 'shadow-[0_-3px_0_0_rgb(var(--accent))] ' : '') +
        (dropEdge === 'bottom' ? 'shadow-[0_3px_0_0_rgb(var(--accent))] ' : '')
      }
    >
      {dragProps && <DragHandle />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-text truncate">{habit.title}</div>
          {habit.visibility === 'shared' ? (
            <Users size={11} className="text-text-faint shrink-0" />
          ) : (
            <Lock size={11} className="text-text-faint shrink-0" />
          )}
          {habit.streak_rewards && <Sparkles size={11} className="text-accent shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs">
          <span className="text-text-faint tabular-nums">
            {targetLabel(target, habit.target_op, isWeekly ? 'week' : 'day')}
          </span>
          {isWeekly && weekly && (
            <>
              <span className="text-text-faint">·</span>
              <span
                className={
                  'tabular-nums font-medium ' +
                  (weekly.state === 'met'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : weekly.state === 'violated'
                      ? 'text-red-500'
                      : 'text-text')
                }
              >
                {weekly.count}/{weekly.target} this week
              </span>
            </>
          )}
          <span className="text-text-faint">·</span>
          <div className="flex items-center gap-1">
            <Flame
              size={11}
              className={streak > 0 ? 'text-red-500' : 'text-text-faint'}
              fill={streak > 0 ? 'currentColor' : 'none'}
            />
            <span className={'tabular-nums ' + (streak > 0 ? 'text-text' : 'text-text-faint')}>
              {isWeekly
                ? `${streak} wk${streak === 1 ? '' : 's'}`
                : `${streak} day${streak === 1 ? '' : 's'}`}
            </span>
          </div>
          {!isWeekly && habit.streak_rewards && streak > 0 && (
            <span className="text-[10px] text-text-faint">· {milestoneTo} to next reward</span>
          )}
        </div>
      </div>

      {/* 7-day heatmap. Each tap adds another entry for that day (works for
          any date, not just today) and shows a light-coloured count overlay
          once the user has logged more than once. Corrections live in the
          habit editor. */}
      <div className="flex items-end gap-1 shrink-0">
        {last7.map((d) => {
          const isToday = d.date === todayISO;
          const date = new Date(d.date);
          const dayLabel = date.toLocaleDateString(undefined, { weekday: 'narrow' });
          const target = habit.daily_target ?? 1;
          const dayHasActivity = d.count >= 1;
          // Weekly: every logged day of the week takes the WEEK's colour;
          // un-logged days stay faint so you can still see which days you did
          // it. Day cadences keep their per-day state.
          const state = isWeekly
            ? weekly?.state ?? 'empty'
            : habitCellState(d.count, target, habit.target_op);
          const weeklyEmptyDay = isWeekly && !dayHasActivity;
          const showCount = dayHasActivity;
          void onToggleDate;
          void color;
          return (
            <button
              key={d.date}
              onClick={canCheck ? () => onIncrementDate(d.date) : undefined}
              disabled={!canCheck}
              className={
                'flex flex-col items-center gap-0.5 group ' +
                (canCheck ? 'cursor-pointer' : 'cursor-default')
              }
              title={
                (isWeekly && weekly
                  ? `${d.date} · ${d.count} · week ${weekly.count}/${weekly.target}`
                  : `${d.date} · ${d.count}/${target}`) +
                (canCheck ? ' (tap to add another · edit habit to correct)' : '')
              }
            >
              <div
                className={
                  'w-5 h-5 rounded-sm transition-transform relative flex items-center justify-center ' +
                  (canCheck ? 'group-hover:scale-110' : '') +
                  (isToday ? ' ring-1 ring-text/30' : '') +
                  ' ' +
                  (weeklyEmptyDay
                    ? 'bg-surface-3 border border-border/60'
                    : state === 'met'
                      ? 'bg-emerald-400'
                      : state === 'violated'
                        ? 'bg-red-500'
                        : 'bg-accent/70 dark:bg-accent/55')
                }
              >
                {/* Met/over-target days show their count (or a check when the
                    target is 1). Missed days carry their red fill + count;
                    the corner ✕ glyph was removed per design. Neutral/un-logged
                    days stay blank per the forgiving rule. */}
                {showCount ? (
                  <span className="text-[9px] font-bold leading-none text-white/90 tabular-nums">
                    {d.count}
                  </span>
                ) : !weeklyEmptyDay && state === 'met' ? (
                  <Check size={11} strokeWidth={3} className="text-white/90" />
                ) : null}
              </div>
              <span
                className={
                  'text-[10px] tabular-nums ' +
                  (isToday ? 'text-text-muted font-medium' : 'text-text-faint')
                }
              >
                {isToday ? 'Today' : dayLabel}
              </span>
            </button>
          );
        })}
      </div>

      {canEdit && (
        <button
          onClick={onEdit}
          className="w-7 h-7 min-w-[44px] min-h-[44px] rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text shrink-0"
          title="Edit"
          aria-label="Edit habit"
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}, areHabitRowsEqual);
