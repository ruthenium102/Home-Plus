import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Sparkles, Trophy } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar } from '@/components/Avatar';
import { getColorTokens } from '@/lib/colors';
import { localISO } from '@/lib/dates';
import {
  computeHabitStreak,
  dailyCells,
  habitRangeStats,
  habitStartISO,
  longestHabitStreak,
  targetLabel,
  visibleHabits,
  type HabitDayCell,
} from '@/lib/habits';
import type { Habit } from '@/types';

/**
 * Resolve the inclusive [fromISO, toISO] window for a 3-month view, optionally
 * shifted back by whole months (0 = window ends today; 1 = ends a month ago).
 */
function rangeWindow(monthsBack: number): { fromISO: string; toISO: string } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setMonth(end.getMonth() - monthsBack);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  start.setDate(start.getDate() + 1);
  return { fromISO: localISO(start), toISO: localISO(end) };
}

export function HabitsStats() {
  const { habits, checkIns, members, activeMember } = useFamily();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // How many whole months back from today the window ends. 0 = window ends
  // today; 1 = ends one month ago; etc.
  const [monthsBack, setMonthsBack] = useState(0);

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
  const { fromISO, toISO } = rangeWindow(monthsBack);
  const fmtShort = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  const windowLabel = `${fmtShort(fromISO)} – ${fmtShort(toISO)}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 self-start">
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
                    fromISO={fromISO}
                    toISO={toISO}
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
  fromISO: string;
  toISO: string;
  todayISO: string;
  checkIns: ReturnType<typeof useFamily>['checkIns'];
  color: { base: string; soft: string; text: string };
}

function HabitStatsCard({
  habit,
  memberId,
  fromISO,
  toISO,
  todayISO,
  checkIns,
  color,
}: CardProps) {
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
    () => dailyCells(habit, checkIns, memberId, fromISO, toISO),
    [habit, checkIns, memberId, fromISO, toISO],
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

      <Heatmap cells={cells} todayISO={todayISO} />
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
  // so the first cell sits on its true weekday. Each column also records the
  // YYYY-MM key of its first in-month cell so we can group columns into month
  // sections with a small gap + header label between them.
  const grid = useMemo(() => {
    if (cells.length === 0) {
      return [] as { cells: (HabitDayCell | null)[]; monthKey: string }[];
    }
    const first = new Date(cells[0].date + 'T00:00:00');
    const dow = first.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const padded: (HabitDayCell | null)[] = [
      ...Array(mondayOffset).fill(null),
      ...cells,
    ];
    const cols: { cells: (HabitDayCell | null)[]; monthKey: string }[] = [];
    for (let i = 0; i < padded.length; i += 7) {
      const slice = padded.slice(i, i + 7);
      const firstReal = slice.find((c) => c !== null);
      // A column's month = the month of its first real day. Empty padding
      // columns get an empty key so they fold into the previous group.
      const monthKey = firstReal ? firstReal.date.slice(0, 7) : '';
      cols.push({ cells: slice, monthKey });
    }
    return cols;
  }, [cells]);

  if (cells.length === 0) {
    return <div className="text-xs text-text-faint">No data in this range</div>;
  }

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-start">
          {/* Left column: weekday letters so M/W/F orient the reader */}
          <div className="flex flex-col gap-[3px] pr-1 pt-4">
            {WEEKDAY_ROW_LABELS.map((label, i) => (
              <div
                key={i}
                className="w-3 h-3 text-[8px] leading-[0.75rem] text-text-faint text-right tabular-nums"
              >
                {label}
              </div>
            ))}
          </div>
          {/* Month sections — columns grouped by month with a gap between groups */}
          <div className="flex items-start gap-4">
            {groupByMonth(grid).map((group) => (
              <MonthSection
                key={group.monthKey}
                monthKey={group.monthKey}
                columns={group.columns}
                todayISO={todayISO}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MonthGroup {
  monthKey: string;
  columns: { cells: (HabitDayCell | null)[]; monthKey: string }[];
}

/**
 * Walk the column list and bundle adjacent columns belonging to the same
 * month. Padding columns (monthKey === '') attach to the previous group.
 */
function groupByMonth(
  cols: { cells: (HabitDayCell | null)[]; monthKey: string }[],
): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const col of cols) {
    const key = col.monthKey || groups[groups.length - 1]?.monthKey || '';
    if (!groups.length || groups[groups.length - 1].monthKey !== key) {
      groups.push({ monthKey: key, columns: [col] });
    } else {
      groups[groups.length - 1].columns.push(col);
    }
  }
  return groups;
}

function MonthSection({
  monthKey,
  columns,
  todayISO,
}: {
  monthKey: string;
  columns: { cells: (HabitDayCell | null)[]; monthKey: string }[];
  todayISO: string;
}) {
  const label = monthKey
    ? new Date(monthKey + '-01T00:00:00').toLocaleDateString(undefined, {
        month: 'short',
      })
    : '';
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[9px] text-text-faint tabular-nums leading-none h-3">
        {label}
      </div>
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.cells.map((c, ri) => {
              if (!c) return <div key={ri} className="w-3 h-3" />;
              const isToday = c.date === todayISO;
              // Mirror the Habits tab palette. lte days with no entry stay
              // neutral — zero is ambiguous between success and no-log.
              const base = !c.inRange
                ? 'bg-surface-3 border border-text-faint/20'
                : c.state === 'met'
                  ? 'bg-emerald-400'
                  : c.state === 'violated'
                    ? 'bg-red-500'
                    : 'bg-[#c44d2e]/70 dark:bg-[#e07450]/55';
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
  );
}
