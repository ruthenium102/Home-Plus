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
  startOfWeek,
} from 'date-fns';

function eventSpansDay(occurrenceStart: string, occurrenceEnd: string, day: Date): boolean {
  return new Date(occurrenceStart) < endOfDay(day) && new Date(occurrenceEnd) > startOfDay(day);
}
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  UtensilsCrossed,
  Briefcase,
} from 'lucide-react';
import { useEventsData, useMembersData, useFamilyActions } from '@/context/FamilyContext';
import { hapticLight, hapticMedium } from '@/lib/native';
import { createEdgeAutoScroller } from '@/lib/dragAutoScroll';
import { expandEvents, type ExpandedEvent } from '@/lib/recurrence';
import { EventChip } from '@/components/EventChip';
import { EventEditor } from '@/components/EventEditor';
import { ImportEventsModal } from '@/components/ImportEventsModal';
import { Avatar } from '@/components/Avatar';
import { useTheme } from '@/context/ThemeContext';
import { useIsPhone } from '@/hooks/useIsPhone';
import { getColorTokens } from '@/lib/colors';
import type { CalendarEvent, FamilyMember } from '@/types';

type ViewMode = 'day' | 'week' | 'month';

export function CalendarPage() {
  const { events } = useEventsData();
  const { members } = useMembersData();
  const { updateEvent, addEvent } = useFamilyActions();
  const isPhone = useIsPhone();
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState<Date>(new Date());
  // On phone, week view is a 3-day rolling window starting at `cursor`.
  // On tablet+, week view is the Mon-anchored 7-day week.
  const weekDayCount = isPhone ? 3 : 7;
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [showMeals, setShowMeals] = useState(true);
  const [showWfh, setShowWfh] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  // The ISO occurrence start the user tapped, so the editor can delete a single
  // instance of a recurring event rather than the whole series.
  const [editingOccurrence, setEditingOccurrence] = useState<string | null>(null);
  const [createInitial, setCreateInitial] = useState<Date | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const draggingRef = useRef<ExpandedEvent | null>(null);
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === 'day') {
      return { start: startOfDay(cursor), end: endOfDay(cursor) };
    }
    if (view === 'week') {
      if (isPhone) {
        const start = startOfDay(cursor);
        return { start, end: endOfDay(addDays(start, weekDayCount - 1)) };
      }
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return { start, end: endOfDay(addDays(start, weekDayCount - 1)) };
    }
    // month: include leading/trailing weeks for the grid
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return { start: gridStart, end: gridEnd };
  }, [view, cursor, isPhone, weekDayCount]);

  const expanded = useMemo(() => {
    let list = expandEvents(events, range.start, range.end);
    if (memberFilter) {
      list = list.filter((e) => e.member_ids.length === 0 || e.member_ids.includes(memberFilter));
    }
    if (!showMeals) {
      list = list.filter((e) => e.category !== 'meal');
    }
    if (!showWfh) {
      list = list.filter((e) => e.category !== 'wfh');
    }
    return list;
  }, [events, range, memberFilter, showMeals, showWfh]);

  const goPrev = () => {
    if (view === 'day') setCursor(addDays(cursor, -1));
    else if (view === 'week')
      setCursor(isPhone ? addDays(cursor, -weekDayCount) : addWeeks(cursor, -1));
    else setCursor(addMonths(cursor, -1));
  };
  const goNext = () => {
    if (view === 'day') setCursor(addDays(cursor, 1));
    else if (view === 'week')
      setCursor(isPhone ? addDays(cursor, weekDayCount) : addWeeks(cursor, 1));
    else setCursor(addMonths(cursor, 1));
  };
  const goToday = () => setCursor(new Date());

  const handleEditEvent = (e: ExpandedEvent) => {
    const source = events.find((x) => x.id === e.id) || null;
    setEditing(source);
    setEditingOccurrence(e.occurrence_start);
    setCreateInitial(undefined);
    setEditorOpen(true);
  };

  // Pointer-based drag of an event chip onto a day cell. HTML5 DnD does not
  // work on iOS touch — we instead capture the pointer, watch pointermove
  // for the day under it (via data-day-key), then commit on pointerup.
  //
  // Touch drags require a short HOLD before lift-off (like native calendar
  // apps). The chips sit in scrollable grids with touch-action: pan-y, so a
  // quick vertical swipe that happens to start on a chip scrolls the page —
  // previously any 6px of movement yanked the event to another day instead.
  // Mouse drags keep the immediate movement threshold.
  const startEventDrag = (e: ExpandedEvent, downEv: React.PointerEvent) => {
    if (downEv.button !== undefined && downEv.button !== 0) return;
    // Desktop: stop the press starting a browser text selection, which would
    // otherwise highlight day numbers/labels while dragging a chip across the
    // grid. Mouse only — cancelling a touch pointerdown suppresses the
    // compatibility click on tap.
    if (downEv.pointerType === 'mouse') downEv.preventDefault();
    const target = downEv.currentTarget as HTMLElement;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    const isTouch = downEv.pointerType !== 'mouse';
    let started = false;
    let ghostEl: HTMLDivElement | null = null;
    const pointerId = downEv.pointerId;

    const findDayKeyAt = (clientX: number, clientY: number): string | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const cell = (el as HTMLElement).closest?.('[data-day-key]') as HTMLElement | null;
        if (cell) return cell.dataset.dayKey ?? null;
      }
      return null;
    };

    let rafId = 0;
    let lastKey: string | null = null;
    let lastClientX = startX;
    let lastClientY = startY;
    let holdTimer = 0;
    const autoScroll = createEdgeAutoScroller();

    // Once a touch drag owns the gesture, stop the browser from claiming
    // pan-y mid-drag (needs a non-passive touchmove; preventDefault on
    // pointermove doesn't stop native scrolling).
    const blockScroll = (ev: TouchEvent) => {
      if (started) ev.preventDefault();
    };

    const beginDrag = () => {
      started = true;
      // Light pickup tap to match native drag lift-off.
      void hapticLight();
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      draggingRef.current = e;
      document.addEventListener('touchmove', blockScroll, { passive: false });
      // A floating chip that follows the pointer so the event physically
      // moves with the finger/cursor (not just a day highlight).
      ghostEl = document.createElement('div');
      ghostEl.textContent = e.title;
      ghostEl.style.cssText =
        'position:fixed;left:0;top:0;z-index:200;pointer-events:none;' +
        'padding:4px 10px;border-radius:8px;font-size:12px;font-weight:500;' +
        'max-width:220px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' +
        'background:rgb(var(--surface));color:rgb(var(--text));' +
        'border:1px solid rgb(var(--accent));box-shadow:0 10px 24px -8px rgba(0,0,0,0.35);';
      ghostEl.style.transform = `translate(${lastClientX + 10}px, ${lastClientY + 10}px)`;
      document.body.appendChild(ghostEl);
      target.style.opacity = '0.4';
    };

    if (isTouch) {
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        beginDrag();
      }, 300);
    }

    const move = (ev: PointerEvent) => {
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      if (!started) {
        const moved =
          Math.abs(ev.clientY - startY) >= 6 || Math.abs(ev.clientX - startX) >= 6;
        if (isTouch) {
          // Movement before the hold elapsed = a scroll/tap, not a drag.
          if (moved) cancel();
          return;
        }
        if (!moved) return;
        beginDrag();
      }
      ev.preventDefault();
      if (ghostEl) {
        ghostEl.style.transform = `translate(${ev.clientX + 10}px, ${ev.clientY + 10}px)`;
      }
      // Auto-scroll the month/week grid so a day below the fold is reachable.
      autoScroll.update(ev.clientX, ev.clientY);
      // Throttle the hit-test + hover-state write to one per animation frame.
      // Previously this ran setDragOverDayKey on EVERY pointermove, re-rendering
      // the whole month/week grid each frame and dropping frames on A-series
      // devices. Coalescing to rAF keeps the drag at 60fps, and we only call
      // setState when the hovered day actually changes.
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const key = findDayKeyAt(lastClientX, lastClientY);
        if (key !== lastKey) {
          lastKey = key;
          setDragOverDayKey(key);
        }
      });
    };
    const cleanup = () => {
      autoScroll.stop();
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
      }
      document.removeEventListener('touchmove', blockScroll);
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      target.style.opacity = '';
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (!started) {
        draggingRef.current = null;
        setDragOverDayKey(null);
        return;
      }
      const key = findDayKeyAt(ev.clientX, ev.clientY);
      if (!key) {
        draggingRef.current = null;
        setDragOverDayKey(null);
        return;
      }
      // dayKey is an ISO string written by the views — parsing it back gives
      // the same Date the views used for layout.
      handleDropOnDay(new Date(key));
    };
    const cancel = () => {
      cleanup();
      draggingRef.current = null;
      setDragOverDayKey(null);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
  };

  const handleDropOnDay = (day: Date) => {
    const evt = draggingRef.current;
    draggingRef.current = null;
    setDragOverDayKey(null);
    if (!evt) return;
    const source = events.find((x) => x.id === evt.id);
    if (!source) return;
    // Confirm the move with a medium tap (only once we know a real event
    // landed on a day).
    void hapticMedium();

    // Recurring event: move just THIS occurrence — exclude its original
    // occurrence from the series and recreate it as a one-off on the new day.
    if (source.recurrence) {
      const origStart = new Date(evt.occurrence_start);
      const origEnd = new Date(evt.occurrence_end);
      const spanMs = Math.max(0, origEnd.getTime() - origStart.getTime());
      const newStart = startOfDay(day);
      if (!source.all_day) {
        newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
      }
      updateEvent(source.id, {
        exdates: [...(source.exdates ?? []), evt.occurrence_start],
      });
      // Copy the event's content, drop series/identity fields, place on new day.
      const {
        id: _id,
        created_at: _ca,
        family_id: _fid,
        recurrence: _rec,
        exdates: _ex,
        google_event_id: _g,
        ...content
      } = source;
      void _id;
      void _ca;
      void _fid;
      void _rec;
      void _ex;
      void _g;
      addEvent({
        ...content,
        start_at: newStart.toISOString(),
        end_at: new Date(newStart.getTime() + spanMs).toISOString(),
        recurrence: null,
      });
      return;
    }

    if (source.all_day) {
      const origStart = new Date(evt.occurrence_start);
      const origEnd = new Date(evt.occurrence_end);
      const spanMs = Math.max(0, origEnd.getTime() - origStart.getTime());
      const newStart = startOfDay(day);
      updateEvent(source.id, {
        start_at: newStart.toISOString(),
        end_at: new Date(newStart.getTime() + spanMs).toISOString(),
      });
    } else {
      const origStart = new Date(evt.occurrence_start);
      const origEnd = new Date(evt.occurrence_end);
      const durationMs = Math.max(0, origEnd.getTime() - origStart.getTime());
      const newStart = startOfDay(day);
      newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
      updateEvent(source.id, {
        start_at: newStart.toISOString(),
        end_at: new Date(newStart.getTime() + durationMs).toISOString(),
      });
    }
  };

  const handleNew = (date?: Date) => {
    setEditing(null);
    setEditingOccurrence(null);
    setCreateInitial(date);
    setEditorOpen(true);
  };

  // Horizontal swipe to page the calendar (mainly for phone, where week view
  // is a narrow 3-day window). Reuses goPrev/goNext so each view steps by its
  // own unit. Swipes that begin on a draggable event chip are ignored so
  // dragging an event to another day still works.
  const swipeRef = useRef<{ x: number; y: number; skip: boolean } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      swipeRef.current = null;
      return;
    }
    const t = e.touches[0];
    const skip = !!(e.target as HTMLElement).closest?.('[data-event-chip]');
    swipeRef.current = { x: t.clientX, y: t.clientY, skip };
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || s.skip) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Require a clearly horizontal swipe so vertical scrolling isn't hijacked.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx > 0) goPrev();
      else goNext();
    }
  };

  const headerLabel =
    view === 'day'
      ? format(cursor, 'EEEE, d MMMM')
      : view === 'week'
        ? `${format(range.start, 'd MMM')} – ${format(range.end, 'd MMM')}`
        : format(cursor, 'MMMM yyyy');

  // Compact date for the single-row phone toolbar.
  const shortLabel =
    view === 'day'
      ? format(cursor, 'EEE d MMM')
      : view === 'week'
        ? `${format(range.start, 'd')}–${format(range.end, 'd MMM')}`
        : format(cursor, 'MMM yyyy');

  return (
    <div className="space-y-4">
      {/* Toolbar — one balanced row: nav + Today on the left, date centred, view
          switcher + add on the right. Compact on phone (short date, icon-only
          Event); full labels return at sm+. */}
      <div className="card p-3">
        <div className="flex items-center gap-2">
          {/* Left: navigation */}
          <div className="flex items-center shrink-0">
            <button
              onClick={goPrev}
              className="w-8 sm:w-9 min-h-[40px] rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToday}
              className="px-2 sm:px-3 min-h-[40px] rounded-md text-xs sm:text-sm text-text-muted hover:bg-surface-2"
            >
              Today
            </button>
            <button
              onClick={goNext}
              className="w-8 sm:w-9 min-h-[40px] rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Date — kept on the left, just after the nav; mr-auto pushes the
              controls to the far right. */}
          <div className="min-w-0 truncate mr-auto px-1 font-display text-sm sm:text-lg text-text">
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{headerLabel}</span>
          </div>

          {/* Right: view switcher + add */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="flex bg-surface-2 rounded-md p-0.5">
              {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    'px-2 sm:px-3 py-1.5 rounded-sm text-xs sm:text-sm capitalize transition-colors ' +
                    (view === v ? 'bg-surface text-text shadow-sm' : 'text-text-muted')
                  }
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleNew(cursor)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-accent-strong text-white text-sm font-medium rounded-md hover:opacity-90"
              aria-label="New event"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Event</span>
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 border border-border text-text-muted text-sm rounded-md hover:bg-surface-2"
              title="Import events from holidays, paste, or iCal feed"
            >
              <Sparkles size={14} /> Import
            </button>
          </div>
        </div>
      </div>

      {/* Member + meal filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto scroll-x-clean -mx-1 px-1">
        <button
          onClick={() => setMemberFilter(null)}
          className={
            'px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ' +
            (memberFilter === null
              ? 'bg-accent-strong text-white border-accent'
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
              : 'bg-surface border-border text-text-faint/60')
          }
        >
          <UtensilsCrossed size={12} /> Meals
        </button>
        <button
          onClick={() => setShowWfh((v) => !v)}
          className={
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ' +
            (showWfh
              ? 'bg-surface border-border text-text-muted'
              : 'bg-surface border-border text-text-faint/60')
          }
        >
          <Briefcase size={12} /> WFH
        </button>
      </div>

      {/* View — day & week support horizontal swipe to page through dates. */}
      {view === 'day' && (
        <div onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
          <DayView date={cursor} events={expanded} onEdit={handleEditEvent} onCreate={handleNew} />
        </div>
      )}
      {view === 'week' && (
        <div onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
          <WeekView
            weekStart={range.start}
            dayCount={weekDayCount}
            events={expanded}
            onEdit={handleEditEvent}
            onCreate={handleNew}
            onStartEventDrag={startEventDrag}
            dragOverDayKey={dragOverDayKey}
          />
        </div>
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
          onStartEventDrag={startEventDrag}
          dragOverDayKey={dragOverDayKey}
        />
      )}

      <EventEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editing={editing}
        occurrenceStart={editingOccurrence}
        initialStart={createInitial}
      />
      <ImportEventsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function MemberFilterChip({
  member,
  active,
  onClick,
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
  onCreate,
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
          <div className="text-xs uppercase tracking-wider text-text-faint mb-2">All day</div>
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
  dayCount,
  events,
  onEdit,
  onCreate,
  onStartEventDrag,
  dragOverDayKey,
}: {
  weekStart: Date;
  dayCount: number;
  events: ExpandedEvent[];
  onEdit: (e: ExpandedEvent) => void;
  onCreate: (d: Date) => void;
  onStartEventDrag: (e: ExpandedEvent, downEv: React.PointerEvent) => void;
  dragOverDayKey: string | null;
}) {
  const today = new Date();
  // Tailwind needs the class string to be statically present, so the two
  // supported counts are spelled out rather than templated.
  const gridCols = dayCount === 3 ? 'grid-cols-3' : 'grid-cols-7';

  // Group events into a per-day Map once, memoised on the week range + events,
  // instead of running events.filter() per day on every render (e.g. on every
  // pointermove during an event drag, which only changes dragOverDayKey).
  const { days, eventsByDay } = useMemo(() => {
    const ds = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i));
    const byDay = new Map<string, ExpandedEvent[]>();
    for (const day of ds) {
      byDay.set(
        day.toISOString(),
        events.filter((e) => eventSpansDay(e.occurrence_start, e.occurrence_end, day)),
      );
    }
    return { days: ds, eventsByDay: byDay };
  }, [weekStart, dayCount, events]);

  return (
    <div className="card p-2 sm:p-3">
      <div className={'grid ' + gridCols + ' gap-1.5'}>
        {days.map((day) => {
          const dayKey = day.toISOString();
          const dayEvents = eventsByDay.get(dayKey) ?? [];
          const isToday = isSameDay(day, today);
          const isDragOver = dragOverDayKey === dayKey;
          return (
            <div
              key={dayKey}
              data-day-key={dayKey}
              className={
                'rounded-md p-2 min-h-[260px] sm:min-h-[180px] lg:min-h-[220px] flex flex-col transition-colors ' +
                (isToday ? 'bg-accent-soft' : 'bg-surface-2') +
                (isDragOver ? ' ring-2 ring-accent' : '')
              }
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
                    'text-base font-medium tabular-nums ' + (isToday ? 'text-accent' : 'text-text')
                  }
                >
                  {format(day, 'd')}
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-1">
                {dayEvents.map((e) => (
                  <div
                    key={e.occurrence_key}
                    data-event-chip
                    // pan-y: quick vertical swipes on a chip scroll the page;
                    // holding ~300ms lifts the chip into a drag (see
                    // startEventDrag). Callout/select suppression stops the
                    // iOS long-press magnifier during the hold.
                    style={{
                      touchAction: 'pan-y',
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                    }}
                    onPointerDown={(ev) => onStartEventDrag(e, ev)}
                  >
                    <EventChip event={e} onClick={() => onEdit(e)} variant="week" />
                  </div>
                ))}
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
  onStartEventDrag,
  dragOverDayKey,
}: {
  monthCursor: Date;
  gridStart: Date;
  gridEnd: Date;
  events: ExpandedEvent[];
  onEdit: (e: ExpandedEvent) => void;
  onCreate: (d: Date) => void;
  onJumpToDay: (d: Date) => void;
  onStartEventDrag: (e: ExpandedEvent, downEv: React.PointerEvent) => void;
  dragOverDayKey: string | null;
}) {
  const { resolved } = useTheme();
  const { members } = useMembersData();
  const isDark = resolved === 'dark';
  const today = new Date();

  // Build the grid + group events into a per-day Map once, memoised on the
  // events + visible range. Previously each cell ran events.filter() inside the
  // render map, so the whole grid re-scanned every event on every render
  // (notably on every pointermove during an event drag, which only changes
  // dragOverDayKey). Keyed on day ISO string.
  const { days, eventsByDay } = useMemo(() => {
    const ds: Date[] = [];
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      ds.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const byDay = new Map<string, ExpandedEvent[]>();
    for (const day of ds) {
      byDay.set(
        day.toISOString(),
        events.filter((e) => eventSpansDay(e.occurrence_start, e.occurrence_end, day)),
      );
    }
    return { days: ds, eventsByDay: byDay };
  }, [gridStart, gridEnd, events]);

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
          const dayEvents = eventsByDay.get(dayKey) ?? [];
          const isToday = isSameDay(day, today);
          const inMonth = isSameMonth(day, monthCursor);
          const isDragOver = dragOverDayKey === dayKey;

          // Show up to 3 events as colored bars; rest become "+N more"
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;

          return (
            // role=button div (not <button>): the event chips inside are
            // themselves interactive, and nested interactive content inside a
            // real <button> is invalid HTML + confuses VoiceOver.
            <div
              key={dayKey}
              data-day-key={dayKey}
              role="button"
              tabIndex={0}
              aria-label={format(day, 'EEEE d MMMM')}
              onClick={() => onJumpToDay(day)}
              onDoubleClick={() => onCreate(day)}
              onKeyDown={(ev) => {
                if (ev.target !== ev.currentTarget) return; // chips handle their own keys
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  onJumpToDay(day);
                }
              }}
              className={
                'rounded-md p-1.5 min-h-[88px] sm:min-h-[110px] lg:min-h-[132px] flex flex-col text-left transition-colors cursor-pointer hover:ring-1 hover:ring-border-strong ' +
                (isToday ? 'bg-accent-soft' : inMonth ? 'bg-surface-2' : 'bg-surface-2/40') +
                (isDragOver ? ' ring-2 ring-accent' : '')
              }
            >
              <div className="flex items-baseline justify-between mb-1">
                <span
                  className={
                    'text-sm font-medium tabular-nums ' +
                    (isToday ? 'text-accent' : inMonth ? 'text-text' : 'text-text-faint')
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

              <div className="flex-1 flex flex-col gap-1 overflow-hidden">
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
                        color: 'rgb(var(--text))',
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
                  return (
                    <div
                      key={e.occurrence_key}
                      role="button"
                      tabIndex={0}
                      aria-label={`${e.title} — open event`}
                      // pan-y + hold-to-drag: see the WeekView chips.
                      style={{
                        touchAction: 'pan-y',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEdit(e);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          ev.stopPropagation();
                          onEdit(e);
                        }
                      }}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        onStartEventDrag(e, ev);
                      }}
                    >
                      {chip}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-text-faint px-1">+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-text-faint text-center mt-2">
        Tap a day for details · Double-tap to add an event
      </div>
    </div>
  );
}
