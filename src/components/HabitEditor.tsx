import { useEffect, useState } from 'react';
import { Trash2, Lock, Users, Sparkles, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subDays, addDays, subWeeks } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { localISO } from '@/lib/dates';
import { getColorTokens } from '@/lib/colors';
import { habitCellState, startOfHabitWeek, targetMet } from '@/lib/habits';
import type { Habit, HabitCadence } from '@/types';

interface Props {
  open: boolean;
  editing: Habit | null;
  onClose: () => void;
}

const CADENCE_OPTIONS: { v: HabitCadence; label: string }[] = [
  { v: 'daily', label: 'Every day' },
  { v: 'weekdays', label: 'Weekdays' },
  { v: 'weekend', label: 'Weekends' },
  { v: 'pick_days', label: 'Pick days' },
  { v: 'weekly', label: 'Weekly' },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun-first

export function HabitEditor({ open, editing, onClose }: Props) {
  const {
    activeMember,
    members,
    checkIns,
    addHabit,
    updateHabit,
    deleteHabit,
    incrementCheckIn,
    decrementCheckIn,
  } = useFamily();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [memberId, setMemberId] = useState<string>('');
  // For new habits we allow tagging multiple members; on save we create one
  // habit per selected member. Editing stays single-member (each habit is its
  // own row with its own streak). memberId still holds the single owner when
  // editing.
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [cadence, setCadence] = useState<HabitCadence>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [visibility, setVisibility] = useState<'private' | 'shared'>('private');
  const [streakRewards, setStreakRewards] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(1);
  const [targetOp, setTargetOp] = useState<'lte' | 'eq' | 'gte'>('gte');
  // First day of the week for weekly habits (0=Sun..6=Sat). Default Monday.
  const [weekStart, setWeekStart] = useState(1);
  // `weekOffset` = how many weeks before "this week" the recent-counts grid is
  // showing. 0 = the current 7-day window ending today, 1 = the prior 7 days,
  // etc. The arrow buttons step this.
  const [weekOffset, setWeekOffset] = useState(0);

  // Only re-init when the editor opens or the target habit changes.
  // activeMember is intentionally excluded — its reference flips on every
  // family-context sync, which would otherwise wipe the form mid-edit.
   
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setMemberId(editing.member_id);
      setSelectedMemberIds([editing.member_id]);
      setCadence(editing.cadence);
      setWeekdays(editing.weekdays ?? []);
      setVisibility(editing.visibility);
      setStreakRewards(editing.streak_rewards);
      setDailyTarget(editing.daily_target ?? 1);
      setTargetOp(editing.target_op ?? 'gte');
      setWeekStart(editing.week_start ?? 1);
      setWeekOffset(0);
    } else {
      setTitle('');
      setDescription('');
      setMemberId(activeMember?.id || '');
      setSelectedMemberIds(activeMember?.id ? [activeMember.id] : []);
      setCadence('daily');
      setWeekdays([]);
      setVisibility('private');
      setStreakRewards(false);
      setDailyTarget(1);
      setTargetOp('gte');
      setWeekStart(1);
    }
  }, [open, editing?.id]);


  // While editing, owner is the single member_id. While creating, "owner" for
  // streak-rewards eligibility is "are ANY selected members kids" — we apply
  // streak rewards only to those that are kids (parent-assigned habits still
  // get created but with streak_rewards forced to false on those copies).
  const owner = members.find((m) => m.id === memberId);
  const anySelectedIsKid = selectedMemberIds
    .map((id) => members.find((m) => m.id === id))
    .some((m) => m?.role === 'child');
  const isKid = editing ? owner?.role === 'child' : anySelectedIsKid;

  const handleSave = () => {
    if (!title.trim()) return;

    if (editing) {
      if (!memberId) return;
      updateHabit(editing.id, {
        title: title.trim(),
        description: description.trim() || null,
        member_id: memberId,
        cadence,
        weekdays: cadence === 'pick_days' ? weekdays : [],
        visibility,
        streak_rewards: owner?.role === 'child' ? streakRewards : false,
        archived: false,
        count_mode: true,
        daily_target: Math.max(1, dailyTarget),
        target_op: targetOp,
        week_start: cadence === 'weekly' ? weekStart : null,
      });
    } else {
      if (selectedMemberIds.length === 0) return;
      for (const mid of selectedMemberIds) {
        const m = members.find((x) => x.id === mid);
        addHabit({
          title: title.trim(),
          description: description.trim() || null,
          member_id: mid,
          cadence,
          weekdays: cadence === 'pick_days' ? weekdays : [],
          visibility,
          streak_rewards: m?.role === 'child' ? streakRewards : false,
          archived: false,
          count_mode: true,
          daily_target: Math.max(1, dailyTarget),
          target_op: targetOp,
          week_start: cadence === 'weekly' ? weekStart : null,
        });
      }
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    if (confirm(`Delete "${editing.title}"? Check-ins will be removed too.`)) {
      deleteHabit(editing.id);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit habit' : 'New habit'}
      maxWidth="lg"
      footer={
        <>
          {editing ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-text-muted hover:text-accent text-sm transition-colors"
            >
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || (editing ? !memberId : selectedMemberIds.length === 0)}
              className="px-5 py-2 bg-accent-strong text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </>
      }
    >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Read 20 minutes"
            autoFocus
            className="w-full px-3 py-3 bg-surface-2 border border-border rounded-md text-text text-lg font-medium placeholder:text-text-faint focus:outline-none focus:border-accent"
          />

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />

          {/* Owner */}
          <div>
            <div className="text-sm text-text-muted mb-2">
              {editing ? 'Whose habit is this?' : 'Tag one or more people'}
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const selected = editing ? memberId === m.id : selectedMemberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (editing) {
                        setMemberId(m.id);
                      } else {
                        setSelectedMemberIds((prev) =>
                          prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                        );
                      }
                    }}
                    className={
                      'flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border transition-[transform,opacity,background-color,border-color,color,box-shadow] ' +
                      (selected
                        ? 'bg-surface-2 border-accent'
                        : 'border-border hover:border-border-strong opacity-70')
                    }
                    aria-pressed={selected}
                  >
                    <Avatar member={m} size={26} />
                    <span className="text-sm text-text">{m.name}</span>
                  </button>
                );
              })}
            </div>
            {!editing && selectedMemberIds.length > 1 && (
              <div className="text-[11px] text-text-faint mt-1.5">
                Creates {selectedMemberIds.length} habits — each person gets their own with
                independent streaks.
              </div>
            )}
          </div>

          {/* Cadence */}
          <div>
            <div className="text-sm text-text-muted mb-2">How often</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {CADENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setCadence(opt.v)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                    (cadence === opt.v
                      ? 'bg-accent-strong text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {cadence === 'pick_days' && (
              <div className="flex gap-1.5">
                {WEEKDAY_LABELS.map((label, i) => {
                  const selected = weekdays.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setWeekdays((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort(),
                        )
                      }
                      className={
                        'w-9 h-9 rounded-full text-xs font-medium transition-colors ' +
                        (selected
                          ? 'bg-accent-strong text-white'
                          : 'bg-surface-2 border border-border text-text-muted hover:border-border-strong')
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {cadence === 'weekly' && (
              <div className="mt-2">
                <div className="text-xs text-text-faint mb-1.5">Week starts on</div>
                <div className="flex flex-wrap gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setWeekStart(i)}
                      className={
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ' +
                        (weekStart === i
                          ? 'bg-accent-strong text-white border-accent'
                          : 'bg-surface-2 border-border text-text-muted hover:border-border-strong')
                      }
                      aria-pressed={weekStart === i}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Visibility */}
          <div>
            <div className="text-sm text-text-muted mb-2">Visibility</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVisibility('private')}
                className={
                  'flex flex-col items-center gap-1 p-3 rounded-md border-2 transition-colors ' +
                  (visibility === 'private'
                    ? 'border-accent bg-accent-soft'
                    : 'border-border hover:border-border-strong')
                }
              >
                <Lock
                  size={16}
                  className={visibility === 'private' ? 'text-accent' : 'text-text-muted'}
                />
                <div className="text-sm font-medium text-text">Private</div>
                <div className="text-[10px] text-text-faint">Only owner sees it</div>
              </button>
              <button
                onClick={() => setVisibility('shared')}
                className={
                  'flex flex-col items-center gap-1 p-3 rounded-md border-2 transition-colors ' +
                  (visibility === 'shared'
                    ? 'border-accent bg-accent-soft'
                    : 'border-border hover:border-border-strong')
                }
              >
                <Users
                  size={16}
                  className={visibility === 'shared' ? 'text-accent' : 'text-text-muted'}
                />
                <div className="text-sm font-medium text-text">Shared</div>
                <div className="text-[10px] text-text-faint">Family can see</div>
              </button>
            </div>
          </div>

          {/* Streak rewards (kids only) */}
          {isKid && (
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md border border-border hover:bg-surface-2/50">
              <input
                type="checkbox"
                checked={streakRewards}
                onChange={(e) => setStreakRewards(e.target.checked)}
                className="accent-accent w-4 h-4"
              />
              <Sparkles size={15} className="text-accent" />
              <div className="flex-1">
                <div className="text-sm text-text font-medium">Reward streaks</div>
                <div className="text-[11px] text-text-faint">
                  10★ at 7 days · 50★ at 30 days · 200★ at 100 days
                </div>
              </div>
            </label>
          )}

          {/* Daily target — every habit has one (default 1). Count mode is
              now implicit. Op picker lets the user set ≤ / = / ≥ semantics. */}
          <div className="px-3 py-2.5 rounded-md bg-surface-2/60 border border-border space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm text-text-muted flex-1">
                {cadence === 'weekly' ? 'Weekly target' : 'Daily target'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDailyTarget((v) => Math.max(1, v - 1))}
                  className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text text-base leading-none"
                  aria-label="Decrease target"
                >
                  −
                </button>
                <div
                  className="w-12 text-center px-1 py-1 bg-surface-2 border border-border rounded-md text-text text-sm font-medium tabular-nums select-none"
                  aria-live="polite"
                >
                  {dailyTarget}
                </div>
                <button
                  type="button"
                  onClick={() => setDailyTarget((v) => Math.min(99, v + 1))}
                  className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text text-base leading-none"
                  aria-label="Increase target"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { v: 'lte', label: '≤', title: 'Met when count is at most the target' },
                  { v: 'eq', label: '=', title: 'Met only when count equals the target' },
                  { v: 'gte', label: '≥', title: 'Met when count is at least the target' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTargetOp(opt.v)}
                  title={opt.title}
                  className={
                    'flex-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ' +
                    (targetOp === opt.v
                      ? 'bg-accent-strong text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent counts — only when editing an existing habit. Display-only
              boxes (member colour scales with progress) with explicit − / +
              buttons beneath. Mirrors the heatmap visual style from the
              Habits page, with corrections handled by the buttons. */}
          {editing &&
            (() => {
              const ownerMember = members.find((m) => m.id === memberId);
              const tokens = ownerMember
                ? getColorTokens(ownerMember.color, isDark)
                : { base: 'rgb(var(--accent))', soft: 'rgb(var(--accent-soft))', text: '#fff' };
              const todayIso = localISO();
              const isWeekly = cadence === 'weekly';
              const target = Math.max(1, dailyTarget);
              // For weekly habits the 7 boxes are the configured week (aligned
              // to week_start), stepped back a whole week per offset. For other
              // cadences they're the rolling 7 days ending at `windowEnd`.
              let days: Date[];
              let windowStart: Date;
              let windowEnd: Date;
              if (isWeekly) {
                const ref = subWeeks(new Date(`${todayIso}T00:00:00`), weekOffset);
                windowStart = startOfHabitWeek(ref, weekStart);
                days = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i));
                windowEnd = days[6];
              } else {
                windowEnd = subDays(new Date(`${todayIso}T00:00:00`), weekOffset * 7);
                windowStart = subDays(windowEnd, 6);
                days = Array.from({ length: 7 }, (_, i) => subDays(windowEnd, 6 - i));
              }
              const rangeLabel =
                weekOffset === 0
                  ? 'This week'
                  : `${format(windowStart, 'd MMM')} – ${format(windowEnd, 'd MMM')}`;
              // Weekly: the whole window shares one compliance state, driven by
              // the week total (forgiving — no red until an lte cap is blown).
              const countForIso = (iso: string) => {
                const ci = checkIns.find(
                  (c) => c.habit_id === editing.id && c.member_id === memberId && c.for_date === iso,
                );
                return ci ? (ci.count ?? 1) : 0;
              };
              const weekTotal = isWeekly
                ? days.reduce((s, d) => s + countForIso(format(d, 'yyyy-MM-dd')), 0)
                : 0;
              const weekState: ReturnType<typeof habitCellState> =
                weekTotal > 0 && targetMet(weekTotal, target, targetOp)
                  ? 'met'
                  : targetOp === 'lte' && weekTotal > target
                    ? 'violated'
                    : 'empty';
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-text-muted">Recent counts</div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setWeekOffset((w) => w + 1)}
                        className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-2"
                        aria-label="Previous week"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <div className="text-[11px] text-text-muted tabular-nums min-w-[7rem] text-center">
                        {rangeLabel}
                      </div>
                      <button
                        type="button"
                        onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                        disabled={weekOffset === 0}
                        className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Next week"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                  {isWeekly && (
                    <div className="text-[11px] text-text-muted tabular-nums">
                      Week total:{' '}
                      <span
                        className={
                          weekState === 'met'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : weekState === 'violated'
                              ? 'text-red-500 font-semibold'
                              : 'text-text'
                        }
                      >
                        {weekTotal}
                      </span>{' '}
                      / {target} {targetOp === 'lte' ? 'max' : targetOp === 'eq' ? 'exactly' : 'target'}
                    </div>
                  )}
                  <div className="grid grid-cols-7 gap-1.5">
                    {days.map((day) => {
                      const iso = format(day, 'yyyy-MM-dd');
                      const count = countForIso(iso);
                      const isToday = iso === todayIso;
                      const state = isWeekly ? weekState : habitCellState(count, target, targetOp);
                      void tokens;
                      return (
                        <div key={iso} className="flex flex-col items-stretch gap-1">
                          <div
                            className={
                              'relative h-14 rounded-md flex flex-col items-center justify-center ' +
                              (isToday ? 'ring-2 ring-accent/70 ' : '') +
                              (state === 'met'
                                ? 'bg-emerald-500'
                                : state === 'violated'
                                  ? 'bg-red-500'
                                  : 'bg-orange-200 dark:bg-orange-900/30')
                            }
                            title={`${format(day, 'EEE d MMM')} — ${count}/${target}`}
                          >
                            <span
                              className={
                                'text-lg font-bold tabular-nums leading-none ' +
                                (state === 'empty' ? 'text-text-faint' : 'text-white')
                              }
                            >
                              {count > 0 ? count : ''}
                            </span>
                            <span
                              className={
                                'text-[9px] uppercase tracking-wider mt-0.5 leading-none tabular-nums ' +
                                (state === 'empty' ? 'text-text-faint' : 'text-white/85')
                              }
                            >
                              {format(day, 'EEE d')}
                            </span>
                          </div>
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => decrementCheckIn(editing.id, memberId, iso)}
                              disabled={count === 0}
                              className="flex-1 h-6 rounded-sm border border-border flex items-center justify-center text-text-faint hover:text-text hover:bg-surface-2 disabled:opacity-20 disabled:cursor-not-allowed"
                              aria-label={`Decrement ${format(day, 'EEE d MMM')}`}
                            >
                              <Minus size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => incrementCheckIn(editing.id, memberId, iso)}
                              className="flex-1 h-6 rounded-sm border border-border flex items-center justify-center text-text-faint hover:text-text hover:bg-surface-2"
                              aria-label={`Increment ${format(day, 'EEE d MMM')}`}
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
    </Modal>
  );
}
