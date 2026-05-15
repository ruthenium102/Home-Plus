import { useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek
} from 'date-fns';

function eventSpansDay(occurrenceStart: string, occurrenceEnd: string, day: Date): boolean {
  return new Date(occurrenceStart) < endOfDay(day) && new Date(occurrenceEnd) > startOfDay(day);
}
import { ChevronLeft, ChevronRight, Plus, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { expandEvents, type ExpandedEvent } from '@/lib/recurrence';
import { EventChip } from '@/components/EventChip';
import { EventEditor } from '@/components/EventEditor';
import { ImportEventsModal } from '@/components/ImportEventsModal';
import { Avatar } from '@/components/Avatar';
import { useTheme } from '@/context/ThemeContext';
import { getColorTokens } from '@/lib/colors';
import type { CalendarEvent, FamilyMember } from '@/types';

type ViewMode = 'day' | 'week' | 'month';

export function CalendarPage() {
  const { events, members, updateEvent } = useFamily();
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState<Date>(new Date());
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [showMeals, setShowMeals] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [createInitial, setCreateInitial] = useState<Date | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const draggingRef = useRef<ExpandedEvent | null>(null);
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === 'day') {
      return { start: startOfDay(cursor), end: endOfDay(cursor) };
    }
    if (view === 'week') {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return { start, end: endOfDay(addDays(start, 6)) };
    }
    // month: include leading/trailing weeks for the grid
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return { start: gridStart, end: gridEnd };
  }, [view, cursor]);

  const expanded = useMemo(() => {
    let list = expandEvents(events, range.start, range.end);
    if (memberFilter) {
      list = list.filter(
        (e) => e.member_ids.length === 0 || e.member_ids.includes(memberFilter)
      );
    }
    if (!showMeals) {
      list = list.filter((e) => e.category !== 'meal');
    }
    return list;
  }, [events, range, memberFilter, showMeals]);

  const goPrev = () => {
    if (view === 'day') setCursor(addDays(cursor, -1));
    else if (view === 'week') setCursor(addWeeks(cursor, -1));
    else setCursor(addMonths(cursor, -1));
  };
  const goNext = () => {
    if (view === 'day') setCursor(addDays(cursor, 1));
    else if (view === 'week') setCursor(addWeeks(cursor, 1));
    else setCursor(addMonths(cursor, 1));
  };
  const goToday = () => setCursor(new Date());

  const handleEditEvent = (e: ExpandedEvent) => {
    const source = events.find((x) => x.id === e.id) || null;
    setEditing(source);
    setCreateInitial(undefined);
    setEditorOpen(true);
  };

  const handleDragStart = (e: ExpandedEvent) => {
    draggingRef.current = e;
  };

  const handleDropOnDay = (day: Date) => {
    const evt = draggingRef.current;
    draggingRef.current = null;
    setDragOverDayKey(null);
    if (!evt) return;
    const source = events.find((x) => x.id === evt.id);
    if (!source || source.recurrence) return;

    if (source.all_day) {
      const origStart = new Date(evt.occurrence_start);
      const origEnd = new Date(evt.occurrence_end);
      const spanMs = Math.max(0, origEnd.getTime() - origStart.getTime());
      const newStart = startOfDay(day);
      updateEvent(source.id, {
        start_at: newStart.toISOString(),
        end_at: new Date(newStart.getTime() + spanMs).toISOString()
      });
    } else {
      const origStart = new Date(evt.occurrence_start);
      const origEnd = new Date(evt.occurrence_end);
      const durationMs = Math.max(0, origEnd.getTime() - origStart.getTime());
      const newStart = startOfDay(day);
      newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
      updateEvent(source.id, {
        start_at: newStart.toISOString(),
        end_at: new Date(newStart.getTime() + durationMs).toISOString()
      });
    }
  };

  const handleNew = (date?: Date) => {
    setEditing(null);
    setCreateInitial(date);
    setEditorOpen(true);
  };

  const headerLabel =
    view === 'day'
      ? format(cursor, 'EEEE, d MMMM yyyy')
      : view === 'week'
        ? `${format(range.start, 'd MMM')} – ${format(range.end, 'd MMM yyyy')}`
        : format(cursor, 'MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-md text-sm text-text-muted hover:bg-surface-2"
          >
            Today
          </button>
          <button
            onClick={goNext}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="font-display text-lg text-text flex-1 min-w-0 truncate">
          {headerLabel}
        </div>

        {/* View toggle */}
        <div className="flex bg-surface-2 rounded-md p-0.5">
          {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                'px-3 py-1.5 rounded-sm text-sm capitalize transition-colors ' +
                (view === v ? 'bg-surface text-text shadow-sm' : 'text-text-muted')
              }
            >
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 border border-border text-text-muted text-sm rounded-md hover:bg-surface-2"
          title="Import events from holidays, paste, or iCal feed"
        >
          <Sparkles size={14} /> Import
        </button>

        <button
          onClick={() => handleNew(cursor)}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90"
        >
          <Plus size={16} /> Event
        </button>
      </div>

      {/* Member + meal filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto scroll-x-clean -mx-1 px-1">
        <button
          onClick={() => setMemberFilter(null)}
          className={
            'px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ' +
            (memberFilter === null
              ? 'bg-accent text-white border-accent'
              : 'bg-surface border-border text-text-muted')
          }
        >
          Everyone
        </button>
        {members.map((m) => (
          <MemberFilterChip
            key={m.id}
            member={m}
            active={memberFilter === m.id}
            onClick={() => setMemberFilter(memberFilter === m.id ? null : m.id)}
          />
        ))}
        <div className="w-px h-5 bg-border shrink-0" />
        <button
          onClick={() => setShowMeals((v) => !v)}
          className={
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ' +
            (showMeals
              ? 'bg-surface border-border text-text-muted'
              : 'bg-surface-2 border-border-strong text-text-muted line-through opacity-60')
          }
        >
          <UtensilsCrossed size={12} /> Meals
        </button>
      </div>

      {/* View */}
      {view === 'day' && (
        <DayView
          date={cursor}
          events={expanded}
          onEdit={handleEditEvent}
          onCreate={handleNew}
        />
      )}
      {view === 'week' && (
        <WeekView
          weekStart={range.start}
          events={expanded}
          onEdit={handleEditEvent}
          onCreate={handleNew}
          onDragStart={handleDragStart}
          onDropOnDay={handleDropOnDay}
          dragOverDayKey={dragOverDayKey}
          onDragOverDay={setDragOverDayKey}
        />
      )}
      {view === 'month' && (
        <MonthView
          monthCursor={cursor}
          gridStart={range.start}
          gridEnd={range.end}
          events={expanded}
          onEdit={handleEditEvent}
          onCreate={handleNew}
          onJumpToDay={(d) => {
            setCursor(d);
            setView('day');
          }}
          onDragStart={handleDragStart}
          onDropOnDay={handleDropOnDay}
          dragOverDayKey={dragOverDayKey}
          onDragOverDay={setDragOverDayKey}
        />
      )}

      <EventEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editing={editing}
        initialStart={createInitial}
      />
      <ImportEventsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

function MemberFilterChip({
  member,
  active,
  onClick
}: {
  member: FamilyMember;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border whitespace-nowrap transition-colors ' +
        (active
          ? 'bg-surface-2 border-border-strong'
          : 'bg-surface border-border opacity-70 hover:opacity-100')
      }
    >
      <Avatar member={member} size={22} />
      <span className="text-xs font-medium text-text">{member.name}</span>
    </button>
  );
}

// ---- Day view ---------------------------------------------------------------

function DayView({
  date,
  events,
  onEdit,
  onCreate
}: {
  date: Date;
  events: ExpandedEvent[];
  onEdit: (e: ExpandedEvent) => void;
  onCreate: (d: Date) => void;
}) {
  const allDay = events.filter((e) => e.all_day);
  const timed = events.filter((e) => !e.all_day);

  return (
    <div className="card p-4 sm:p-6">
      {allDay.length > 0 && (
        <div className="mb-4 pb-4 border-b border-border">
          <div className="text-xs uppercase tracking-wider text-text-faint mb-2">
            All day
          </div>
          <div className="space-y-1">
            {allDay.map((e) => (
              <EventChip key={e.occurrence_key} event={e} onClick={() => onEdit(e)} />
            ))}
          </div>
        </div>
      )}

      {timed.length === 0 && allDay.length === 0 ? (
        <button
          onClick={() => onCreate(date)}
          className="w-full text-center py-12 text-text-faint hover:text-text-muted transition-colors"
        >
          <div className="font-display text-lg mb-1">Nothing planned</div>
          <div className="text-sm">Tap to add an event</div>
        </button>
      ) : (
        <div className="space-y-1">
          {timed.map((e) => (
            <EventChip key={e.occurrence_key} event={e} onClick={() => onEdit(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Week view --------------------------------------------------------------

function WeekView({
  weekStart,
  events,
  onEdit,
  onCreate,
  onDragStart,
  onDropOnDay,
  dragOverDayKey,
  onDragOverDay
}: {
  weekStart: Date;
  events: ExpandedEvent[];
  onEdit: (e: ExpandedEvent) => void;
  onCreate: (d: Date) => void;
  onDragStart: (e: ExpandedEvent) => void;
  onDropOnDay: (day: Date) => void;
  dragOverDayKey: string | null;
  onDragOverDay: (key: string | null) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="card p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const dayKey = day.toISOString();
          const dayEvents = events.filter((e) =>
            eventSpansDay(e.occurrence_start, e.occurrence_end, day)
          );
          const isToday = isSameDay(day, today);
          const isDragOver = dragOverDayKey === dayKey;
          return (
            <div
              key={dayKey}
              className={
                'rounded-md p-2 min-h-[200px] flex flex-col transition-colors ' +
                (isToday ? 'bg-accent-soft' : 'bg-surface-2') +
                (isDragOver ? ' ring-2 ring-accent' : '')
              }
              onDragOver={(ev) => { ev.preventDefault(); onDragOverDay(dayKey); }}
              onDragLeave={() => onDragOverDay(null)}
              onDrop={() => onDropOnDay(day)}
            >
              <div className="flex items-baseline gap-1.5 mb-2">
                <div
                  className={
                    'text-xs uppercase tracking-wider ' +
                    (isToday ? 'text-accent font-semibold' : 'text-text-faint')
                  }
                >
                  {format(day, 'EEE')}
                </div>
                <div
                  className={
                    'text-base font-medium tabular-nums ' +
                    (isToday ? 'text-accent' : 'text-text')
                  }
                >
                  {format(day, 'd')}
                </div>
              </div>
              <div className="flex-1 space-y-0">
                {dayEvents.map((e) =>
                  e.recurrence ? (
                    <EventChip
                      key={e.occurrence_key}
                      event={e}
                      onClick={() => onEdit(e)}
                      variant="week"
                    />
                  ) : (
                    <div
                      key={e.occurrence_key}
                      draggable
                      onDragStart={() => onDragStart(e)}
                      onDragEnd={() => onDragOverDay(null)}
                    >
                      <EventChip event={e} onClick={() => onEdit(e)} variant="week" />
                    </div>
                  )
                )}
              </div>
              <button
                onClick={() => onCreate(day)}
                className="mt-1 text-text-faint hover:text-text-muted text-xs flex items-center justify-center py-1 rounded hover:bg-surface transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Month view -------------------------------------------------------------

function MonthView({
  monthCursor,
  gridStart,
  gridEnd,
  events,
  onEdit,
  onCreate,
  onJumpToDay,
  onDragStart,
  onDropOnDay,
  dragOverDayKey,
  onDragOverDay
}: {
  monthCursor: Date;
  gridStart: Date;
  gridEnd: Date;
  events: ExpandedEvent[];
  onEdit: (e: ExpandedEvent) => void;
  onCreate: (d: Date) => void;
  onJumpToDay: (d: Date) => void;
  onDragStart: (e: ExpandedEvent) => void;
  onDropOnDay: (day: Date) => void;
  dragOverDayKey: string | null;
  onDragOverDay: (key: string | null) => void;
}) {
  const { resolved } = useTheme();
  const { members } = useFamily();
  const isDark = resolved === 'dark';
  const today = new Date();

  // Build the grid
  const days: Date[] = [];
  let cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="card p-2 sm:p-3">
      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {weekdayLabels.map((d) => (
          <div
            key={d}
            className="text-[10px] uppercase tracking-wider text-text-faint font-medium text-center py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const dayKey = day.toISOString();
          const dayEvents = events.filter((e) =>
            eventSpansDay(e.occurrence_start, e.occurrence_end, day)
          );
          const isToday = isSameDay(day, today);
          const inMonth = isSameMonth(day, monthCursor);
          const isDragOver = dragOverDayKey === dayKey;

          // Show up to 3 events as colored bars; rest become "+N more"
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;

          return (
            <button
              key={dayKey}
              onClick={() => onJumpToDay(day)}
              onDoubleClick={() => onCreate(day)}
              onDragOver={(ev) => { ev.preventDefault(); onDragOverDay(dayKey); }}
              onDragLeave={() => onDragOverDay(null)}
              onDrop={() => onDropOnDay(day)}
              className={
                'rounded-md p-1.5 min-h-[80px] sm:min-h-[100px] flex flex-col text-left transition-colors hover:ring-1 hover:ring-border-strong ' +
                (isToday
                  ? 'bg-accent-soft'
                  : inMonth
                    ? 'bg-surface-2'
                    : 'bg-surface-2/40') +
                (isDragOver ? ' ring-2 ring-accent' : '')
              }
            >
              <div className="flex items-baseline justify-between mb-1">
                <span
                  className={
                    'text-sm font-medium tabular-nums ' +
                    (isToday
                      ? 'text-accent'
                      : inMonth
                        ? 'text-text'
                        : 'text-text-faint')
                  }
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-text-faint tabular-nums">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                {visible.map((e) => {
                  const owner = e.member_ids[0]
                    ? members.find((m) => m.id === e.member_ids[0])
                    : null;
                  const tokens = owner
                    ? getColorTokens(owner.color, isDark)
                    : { base: 'rgb(var(--accent))', soft: 'rgb(var(--accent-soft))', text: '#fff' };
                  const chip = (
                    <div
                      className="text-[10px] truncate px-1 py-0.5 rounded-sm leading-tight"
                      style={{
                        background: tokens.soft,
                        borderLeft: `2px solid ${tokens.base}`,
                        color: 'rgb(var(--text))'
                      }}
                    >
                      {!e.all_day && (
                        <span className="opacity-60 tabular-nums mr-1">
                          {format(new Date(e.occurrence_start), 'HH:mm')}
                        </span>
                      )}
                      {e.title}
                    </div>
                  );
                  return e.recurrence ? (
                    <div
                      key={e.occurrence_key}
                      onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}
                    >
                      {chip}
                    </div>
                  ) : (
                    <div
                      key={e.occurrence_key}
                      draggable
                      onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}
                      onDragStart={(ev) => { ev.stopPropagation(); onDragStart(e); }}
                      onDragEnd={() => onDragOverDay(null)}
                    >
                      {chip}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-text-faint px-1">
                    +{overflow} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-[10px] text-text-faint text-center mt-2">
        Tap a day for details · Double-tap to add an event
      </div>
    </div>
  );
}
