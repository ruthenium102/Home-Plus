import { useMemo, useState } from 'react';
import { localISO } from '@/lib/dates';
import {
  Plus,
  Pencil,
  Lock,
  Users,
  Flame,
  Sparkles
} from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { Avatar } from '@/components/Avatar';
import { HabitEditor } from '@/components/HabitEditor';
import { SwipeableRow } from '@/components/SwipeableRow';
import { getColorTokens } from '@/lib/colors';
import {
  computeHabitStreak,
  isCheckedIn,
  lastNDays,
  visibleHabits,
  nextStreakMilestone
} from '@/lib/habits';
import type { Habit } from '@/types';

export function HabitsPage() {
  const { habits, checkIns, members, activeMember, toggleCheckIn, incrementCheckIn, decrementCheckIn, deleteHabit, addHabit } =
    useFamily();
  const { resolved } = useTheme();
  const { show } = useToast();
  const swipeMode = useSwipeMode();
  const isDark = resolved === 'dark';

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);

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
          visibility: snapshot.visibility,
          streak_rewards: snapshot.streak_rewards,
          archived: snapshot.archived,
          count_mode: snapshot.count_mode ?? false,
          daily_target: snapshot.daily_target ?? 1
        });
      }
    });
  };

  const habitsToShow = useMemo(
    () => (activeMember ? visibleHabits(habits, activeMember.id) : []),
    [habits, activeMember]
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
    const ordered: { member: typeof members[number]; list: Habit[] }[] = [];
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
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-text">Habits</h1>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90"
        >
          <Plus size={16} /> New habit
        </button>
      </div>

      {byMember.length === 0 ? (
        <div className="card p-12 text-center">
          <Sparkles size={32} className="mx-auto mb-3 text-text-faint opacity-50" />
          <div className="font-display text-lg text-text mb-1">No habits yet</div>
          <div className="text-sm text-text-faint mb-4">
            Build a daily routine — read, walk, practise — and watch the streaks add up.
          </div>
          <button
            onClick={handleNew}
            className="text-sm text-accent hover:underline"
          >
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
                    {member.name}{isActive && <span className="text-text-faint text-sm font-sans"> · you</span>}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {list.length} habit{list.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {list.map((habit) => {
                  const todayCheckIn = checkIns.find(
                    (c) => c.habit_id === habit.id && c.member_id === member.id && c.for_date === todayISO
                  );
                  const todayCount = todayCheckIn ? (todayCheckIn.count ?? 1) : 0;
                  const target = habit.daily_target ?? 1;

                  // For count-mode heatmap: a day is "checked" when count >= target
                  const last7Data = lastNDays(checkIns, habit.id, member.id, 7).map((d) => {
                    if (!habit.count_mode) return d;
                    const ci = checkIns.find(
                      (c) => c.habit_id === habit.id && c.member_id === member.id && c.for_date === d.date
                    );
                    const dayCount = ci ? (ci.count ?? 1) : 0;
                    return { date: d.date, checked: dayCount >= target };
                  });

                  const row = (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      color={tokens}
                      canEdit={isActive}
                      canCheck={isActive}
                      todayISO={todayISO}
                      isCheckedToday={isCheckedIn(checkIns, habit.id, member.id, today)}
                      streak={computeHabitStreak(checkIns, habit.id, member.id)}
                      last7={last7Data}
                      todayCount={todayCount}
                      onToggle={() => toggleCheckIn(habit.id, member.id, todayISO)}
                      onToggleDate={(iso) => toggleCheckIn(habit.id, member.id, iso)}
                      onIncrement={() => incrementCheckIn(habit.id, member.id, todayISO)}
                      onDecrement={() => decrementCheckIn(habit.id, member.id, todayISO)}
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
  last7: { date: string; checked: boolean }[];
  todayCount: number;
  onToggle: () => void;
  onToggleDate: (iso: string) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onEdit: () => void;
}

function HabitRow({
  habit,
  color,
  canEdit,
  canCheck,
  todayISO,
  isCheckedToday,
  streak,
  last7,
  todayCount,
  onToggle,
  onToggleDate,
  onIncrement,
  onDecrement,
  onEdit
}: HabitRowProps) {
  const milestone = nextStreakMilestone(streak);
  const milestoneTo = milestone - streak;

  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-surface-2/40 hover:bg-surface-2/70 transition-colors">
      {/* Tick / status circle — or counter row for count-mode habits */}
      {habit.count_mode ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={canCheck ? onDecrement : undefined}
            disabled={!canCheck || todayCount === 0}
            className={
              'w-8 h-8 rounded-full flex items-center justify-center text-base font-bold transition-all border ' +
              (canCheck && todayCount > 0
                ? 'cursor-pointer active:scale-95 hover:bg-surface-2 border-border text-text-muted'
                : 'cursor-default border-border/40 text-text-faint opacity-40')
            }
            title="Decrease count"
          >
            −
          </button>
          <div
            className="min-w-[3rem] text-center"
            style={{ color: todayCount >= (habit.daily_target ?? 1) ? color.base : undefined }}
          >
            <span className={
              'text-sm font-bold tabular-nums ' +
              (todayCount >= (habit.daily_target ?? 1) ? '' : 'text-text-muted')
            }>
              {todayCount}
            </span>
            <span className="text-[10px] text-text-faint">
              /{habit.daily_target ?? 1}
            </span>
          </div>
          <button
            onClick={canCheck ? onIncrement : undefined}
            disabled={!canCheck}
            className={
              'w-8 h-8 rounded-full flex items-center justify-center text-base font-bold transition-all border ' +
              (canCheck
                ? 'cursor-pointer active:scale-95 hover:bg-surface-2 border-border text-text-muted'
                : 'cursor-default border-border/40 text-text-faint opacity-40')
            }
            style={canCheck ? { background: todayCount >= (habit.daily_target ?? 1) ? color.soft : undefined } : undefined}
            title="Increase count"
          >
            +
          </button>
        </div>
      ) : (
        <button
          onClick={canCheck ? onToggle : undefined}
          disabled={!canCheck}
          className={
            'w-11 h-11 rounded-full shrink-0 flex items-center justify-center transition-all ' +
            (canCheck ? 'cursor-pointer active:scale-95' : 'cursor-default')
          }
          style={{
            background: isCheckedToday ? color.base : color.soft,
            border: isCheckedToday ? 'none' : `2px solid ${color.base}40`
          }}
          title={
            canCheck
              ? isCheckedToday
                ? 'Tap to undo'
                : 'Tap to check in'
              : 'View only'
          }
        >
          {isCheckedToday && (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-text truncate">{habit.title}</div>
          {habit.visibility === 'shared' ? (
            <Users size={11} className="text-text-faint shrink-0" />
          ) : (
            <Lock size={11} className="text-text-faint shrink-0" />
          )}
          {habit.streak_rewards && (
            <Sparkles size={11} className="text-accent shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex items-center gap-1 text-xs">
            <Flame
              size={11}
              className={streak > 0 ? 'text-accent' : 'text-text-faint'}
            />
            <span
              className={
                'tabular-nums ' + (streak > 0 ? 'text-text' : 'text-text-faint')
              }
            >
              {streak} day{streak === 1 ? '' : 's'}
            </span>
          </div>
          {habit.streak_rewards && streak > 0 && (
            <span className="text-[10px] text-text-faint">
              · {milestoneTo} to next reward
            </span>
          )}
        </div>
      </div>

      {/* 7-day heatmap — tappable to backfill */}
      <div className="flex items-end gap-1 shrink-0">
        {last7.map((d, idx) => {
          const isToday = d.date === todayISO;
          const date = new Date(d.date);
          const dayLabel = date.toLocaleDateString(undefined, { weekday: 'narrow' });
          return (
            <button
              key={d.date}
              onClick={canCheck ? () => onToggleDate(d.date) : undefined}
              disabled={!canCheck}
              className={
                'flex flex-col items-center gap-0.5 group ' +
                (canCheck ? 'cursor-pointer' : 'cursor-default')
              }
              title={
                d.date +
                (d.checked ? ' · done' : '') +
                (canCheck ? (d.checked ? ' (tap to undo)' : ' (tap to mark done)') : '')
              }
            >
              <div
                className={
                  'w-5 h-5 rounded-sm transition-transform ' +
                  (canCheck ? 'group-hover:scale-110' : '') +
                  (isToday ? ' ring-1 ring-text/30' : '')
                }
                style={{
                  background: d.checked ? color.base : color.soft,
                  opacity: d.checked ? 1 : 0.5
                }}
              />
              <span
                className={
                  'text-[9px] tabular-nums ' +
                  (isToday ? 'text-text-muted font-medium' : 'text-text-faint')
                }
              >
                {idx === last7.length - 1 ? 'Today' : dayLabel}
              </span>
            </button>
          );
        })}
      </div>

      {canEdit && (
        <button
          onClick={onEdit}
          className="w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text shrink-0"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}
