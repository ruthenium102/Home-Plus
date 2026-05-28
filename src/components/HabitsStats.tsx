import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Sparkles, Trophy, BarChart3 } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar } from '@/components/Avatar';
import { getColorTokens } from '@/lib/colors';
import { localISO } from '@/lib/dates';
import {
  aggregateBuckets,
  computeHabitStreak,
  dailyCells,
  habitRangeStats,
  habitStartISO,
  longestHabitStreak,
  targetLabel,
  visibleHabits,
  type HabitBucket,
  type HabitDayCell,
} from '@/lib/habits';
import type { Habit } from '@/types';

type Range = '30d' | '3m' | '1y' | 'all';

const RANGE_OPTIONS: { v: Range; label: string }[] = [
  { v: '30d', label: '30 days' },
  { v: '3m', label: '3 months' },
  { v: '1y', label: '1 year' },
  { v: 'all', label: 'All time' },
];

/**
 * Resolve the date window for a given range + month-offset (0 = ending today,
 * 1 = ending one month ago, etc). Returns the inclusive [fromISO, toISO]
 * window. For 'all', month-offset is ignored and the window spans habit-start
 * to today.
 */
function rangeWindow(
  range: Range,
  monthsBack: number,
  habit: Habit,
): { fromISO: string; toISO: string } {
  if (range === 'all') {
    return { fromISO: habitStartISO(habit), toISO: localISO() };
  }
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setMonth(end.getMonth() - monthsBack);
  const start = new Date(end);
  if (range === '30d') {
    start.setDate(start.getDate() - 29);
  } else if (range === '3m') {
    start.setMonth(start.getMonth() - 3);
    start.setDate(start.getDate() + 1);
  } else {
    // '1y'
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
  }
  return { fromISO: localISO(start), toISO: localISO(end) };
}

/** Pick the right visualization for the chosen range. */
function bucketingFor(range: Range): 'day' | 'week' | 'month' {
  if (range === '30d' || range === '3m') return 'day';
  return 'month';
}

/** Day-bucketed ranges support stepping back month-by-month. */
function isPageable(range: Range): boolean {
  return range === '30d' || range === '3m';
}

export function HabitsStats() {
  const { habits, checkIns, members, activeMember } = useFamily();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const [range, setRange] = useState<Range>('3m');
  // How many whole months back from today the window ends. 0 = window ends
  // today; 1 = ends one month ago; etc. Used by the prev/next arrows on the
  // day-bucketed views.
  const [monthsBack, setMonthsBack] = useState(0);
  const pageable = isPageable(range);

  const habitsToShow = useMemo(
    () => (activeMember ? visibleHabits(habits, activeMember.id) : []),
    [habits, activeMember],
  );

  const byMember = useMemo(() => {
    const map = new Map<string, Habit[]>();
    for (const h of habitsToShow) {
      const arr = map.get(h.member_id) ?? [];
      arr.push(h);
      map.set(h.member_id, arr);
    }
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

  const todayISO = localISO();

  // For the prev/next labels, derive a sample window using any habit (just to
  // format dates). When no habit is loaded, skip the label.
  const sampleHabit = habitsToShow[0];
  const windowLabel = sampleHabit
    ? (() => {
        const { fromISO, toISO } = rangeWindow(range, monthsBack, sampleHabit);
        const fmt = (iso: string) =>
          new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          });
        return `${fmt(fromISO)} – ${fmt(toISO)}`;
      })()
    : '';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-surface-2 rounded-md p-0.5">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.v}
              onClick={() => {
                setRange(o.v);
                setMonthsBack(0);
              }}
              className={
                'px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ' +
                (range === o.v ? 'bg-surface text-text shadow-sm' : 'text-text-muted')
              }
            >
              {o.label}
            </button>
          ))}
        </div>
        {pageable && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setMonthsBack((m) => m + 1)}
              className="w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text"
              title="Earlier"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] text-text-faint tabular-nums min-w-[8rem] text-center">
              {windowLabel}
            </span>
            <button
              onClick={() => setMonthsBack((m) => Math.max(0, m - 1))}
              disabled={monthsBack === 0}
              className="w-7 h-7 rounded-md hover:bg-surface-2 disabled:hover:bg-transparent disabled:opacity-30 flex items-center justify-center text-text-faint hover:text-text"
              title="Later"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {byMember.length === 0 ? (
        <div className="card p-12 text-center">
          <Sparkles size={32} className="mx-auto mb-3 text-text-faint opacity-50" />
          <div className="font-display text-lg text-text mb-1">No data yet</div>
          <div className="text-sm text-text-faint">
            Add a habit on the Habits tab to start tracking history.
          </div>
        </div>
      ) : (
        byMember.map(({ member, list }) => {
          const tokens = getColorTokens(member.color, isDark);
          const isActive = member.id === activeMember?.id;
          return (
            <section key={member.id} className="card p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-4">
                <Avatar member={member} size={36} />
                <div className="font-display text-lg text-text">
                  {member.name}
                  {isActive && <span className="text-text-faint text-sm font-sans"> · you</span>}
                </div>
              </div>
              <div className="space-y-4">
                {list.map((h) => (
                  <HabitStatsCard
                    key={h.id}
                    habit={h}
                    memberId={member.id}
                    range={range}
                    monthsBack={monthsBack}
                    todayISO={todayISO}
                    checkIns={checkIns}
                    color={tokens}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

interface CardProps {
  habit: Habit;
  memberId: string;
  range: Range;
  monthsBack: number;
  todayISO: string;
  checkIns: ReturnType<typeof useFamily>['checkIns'];
  color: { base: string; soft: string; text: string };
}

function HabitStatsCard({
  habit,
  memberId,
  range,
  monthsBack,
  todayISO,
  checkIns,
  color,
}: CardProps) {
  const { fromISO, toISO } = rangeWindow(range, monthsBack, habit);
  const bucketing = bucketingFor(range);

  const stats = useMemo(
    () => habitRangeStats(habit, checkIns, memberId, fromISO, toISO),
    [habit, checkIns, memberId, fromISO, toISO],
  );
  const currentStreak = useMemo(
    () => computeHabitStreak(checkIns, habit.id, memberId),
    [checkIns, habit.id, memberId],
  );
  const bestStreak = useMemo(
    () => longestHabitStreak(checkIns, habit.id, memberId),
    [checkIns, habit.id, memberId],
  );
  const cells = useMemo(
    () =>
      bucketing === 'day' ? dailyCells(habit, checkIns, memberId, fromISO, toISO) : [],
    [habit, checkIns, memberId, fromISO, toISO, bucketing],
  );
  const buckets = useMemo(
    () =>
      bucketing === 'day'
        ? []
        : aggregateBuckets(habit, checkIns, memberId, fromISO, toISO, bucketing),
    [habit, checkIns, memberId, fromISO, toISO, bucketing],
  );

  const startISO = habitStartISO(habit);
  const startedLabel = new Date(startISO + 'T00:00:00').toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="bg-surface-2/40 rounded-md p-3 sm:p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text truncate">{habit.title}</div>
          <div className="text-[11px] text-text-faint tabular-nums">
            {targetLabel(habit.daily_target ?? 1, habit.target_op)} · since {startedLabel}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          label="Success"
          value={stats.daysDue === 0 ? '—' : `${Math.round(stats.successRate * 100)}%`}
          accent={color.base}
        />
        <StatTile label="Days met" value={`${stats.daysMet}/${stats.daysDue}`} />
        <StatTile
          label="Current"
          value={`${currentStreak}d`}
          icon={
            <Flame
              size={12}
              className={currentStreak > 0 ? 'text-accent' : 'text-text-faint'}
            />
          }
        />
        <StatTile
          label="Best"
          value={`${bestStreak}d`}
          icon={<Trophy size={12} className="text-text-faint" />}
        />
      </div>

      {bucketing === 'day' ? (
        <Heatmap cells={cells} todayISO={todayISO} />
      ) : (
        <BarChart buckets={buckets} unit={bucketing} />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-surface rounded-md p-2">
      <div className="text-[10px] text-text-faint uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-1 mt-0.5">
        {icon}
        <div
          className="text-base font-semibold tabular-nums text-text"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

const WEEKDAY_ROW_LABELS = ['M', '', 'W', '', 'F', '', ''];

function Heatmap({ cells, todayISO }: { cells: HabitDayCell[]; todayISO: string }) {
  // GitHub-style grid: rows = weekday (Mon→Sun), columns = weeks. Pad the head
  // so the first cell sits on its true weekday.
  const grid = useMemo(() => {
    if (cells.length === 0) return [] as (HabitDayCell | null)[][];
    const first = new Date(cells[0].date + 'T00:00:00');
    const dow = first.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const padded: (HabitDayCell | null)[] = [
      ...Array(mondayOffset).fill(null),
      ...cells,
    ];
    const cols: (HabitDayCell | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }
    return cols;
  }, [cells]);

  if (cells.length === 0) {
    return <div className="text-xs text-text-faint">No data in this range</div>;
  }

  const firstDate = new Date(cells[0].date + 'T00:00:00');
  const lastCell = cells[cells.length - 1];
  const lastDate = new Date(lastCell.date + 'T00:00:00');
  const fmtShort = (d: Date) =>
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const startLabel = fmtShort(firstDate);
  const endLabel = lastCell.date === todayISO ? 'Today →' : fmtShort(lastDate);

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-[3px]">
          {/* Left column: weekday letters so M/W/F orient the reader */}
          <div className="flex flex-col gap-[3px] pr-1">
            {WEEKDAY_ROW_LABELS.map((label, i) => (
              <div
                key={i}
                className="w-3 h-3 text-[8px] leading-[0.75rem] text-text-faint text-right tabular-nums"
              >
                {label}
              </div>
            ))}
          </div>
          {grid.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {col.map((c, ri) => {
                if (!c) return <div key={ri} className="w-3 h-3" />;
                const isToday = c.date === todayISO;
                // Mirror the Habits tab palette: only days that actively
                // failed the target render red. Days with no entry stay
                // neutral, matching the user's "forgiving" preference even
                // when the success % counts them as missed.
                const base = !c.inRange
                  ? 'bg-surface border border-text-faint/10'
                  : c.state === 'met'
                    ? 'bg-emerald-400'
                    : c.state === 'violated'
                      ? 'bg-rose-400'
                      : 'bg-orange-300 dark:bg-orange-800/50';
                return (
                  <div
                    key={ri}
                    title={
                      c.inRange
                        ? `${c.date} · ${c.count}`
                        : `${c.date} · before habit start`
                    }
                    className={
                      'w-3 h-3 rounded-[2px] ' +
                      base +
                      (isToday ? ' ring-1 ring-text/40' : '')
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-text-faint pl-4 pr-0.5 tabular-nums">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

function BarChart({ buckets, unit }: { buckets: HabitBucket[]; unit: 'week' | 'month' }) {
  if (buckets.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-faint">
        <BarChart3 size={14} /> No data in this range
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {buckets.map((b) => {
          const rate = b.daysDue > 0 ? b.daysMet / b.daysDue : 0;
          // Tiny visible nub when there's any activity but the % rounds to 0
          const minPct = b.daysMet > 0 || b.totalCount > 0 ? 3 : 0;
          const heightPct = Math.max(rate * 100, minPct);
          return (
            <div
              key={b.key}
              className="flex-1 flex flex-col items-stretch min-w-0"
              title={`${b.label} · ${b.daysMet}/${b.daysDue} met (${Math.round(rate * 100)}%)`}
            >
              <div className="flex-1 flex items-end">
                <div className="w-full h-full bg-surface rounded-sm relative overflow-hidden">
                  <div
                    className="w-full bg-emerald-400/80 absolute bottom-0 left-0"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {buckets.map((b, i) => {
          // Show every label for month buckets; thin out weekly labels so they
          // don't collide on narrow screens.
          const show =
            unit === 'month' || i === 0 || i === buckets.length - 1 || i % 2 === 0;
          return (
            <div
              key={b.key}
              className="flex-1 text-[9px] text-text-faint truncate text-center min-w-0"
            >
              {show ? b.label : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
