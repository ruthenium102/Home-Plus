import { useEffect, useRef, useState } from 'react';
import { Trash2, Repeat, Bell, MapPin, Users, Palette, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useEventsData, useMembersData, useFamilyActions } from '@/context/FamilyContext';
import { suggestDuration } from '@/lib/events';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import { supabase } from '@/lib/supabase';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import type { CalendarEvent, EventCategory, MemberColor, Recurrence } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: CalendarEvent | null;
  // The ISO occurrence start the user actually tapped. For a recurring event
  // this identifies WHICH instance is open, so Delete can drop just that one
  // (via exdates) rather than the whole series. Null for non-recurring events
  // and new events.
  occurrenceStart?: string | null;
  initialStart?: Date;
}

const CATEGORIES: EventCategory[] = [
  'general',
  'school',
  'work',
  'sport',
  'medical',
  'social',
  'travel',
  'meal',
  'wfh',
];

function categoryLabel(c: EventCategory): string {
  if (c === 'wfh') return 'WFH';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

const QUICK_DURATIONS = [
  { label: '15min', mins: 15 },
  { label: '30min', mins: 30 },
  { label: '1hr', mins: 60 },
  { label: '1.5hr', mins: 90 },
  { label: '2hr', mins: 120 },
];

function durationLabel(
  allDay: boolean,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): string {
  if (!startDate || !endDate) return '';
  if (allDay) {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    if (days <= 0) return '—';
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (!startTime || !endTime) return '';
  const s = new Date(`${startDate}T${startTime}:00`);
  const e = new Date(`${endDate}T${endTime}:00`);
  const mins = Math.round((e.getTime() - s.getTime()) / 60000);
  if (mins <= 0) return '—';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h} hour${h === 1 ? '' : 's'} ${m} minute${m === 1 ? '' : 's'}`;
}

function shiftEnd(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  newStartDate: string,
  newStartTime: string,
): { date: string; time: string } {
  const s = new Date(`${startDate}T${startTime}:00`);
  const e = new Date(`${endDate}T${endTime}:00`);
  const durationMs = Math.max(0, e.getTime() - s.getTime());
  const ns = new Date(`${newStartDate}T${newStartTime}:00`);
  const ne = new Date(ns.getTime() + durationMs);
  return { date: format(ne, 'yyyy-MM-dd'), time: format(ne, 'HH:mm') };
}

function applyMins(
  startDate: string,
  startTime: string,
  mins: number,
): { date: string; time: string } {
  const s = new Date(`${startDate}T${startTime}:00`);
  const e = new Date(s.getTime() + mins * 60000);
  return { date: format(e, 'yyyy-MM-dd'), time: format(e, 'HH:mm') };
}

export function EventEditor({ open, onClose, editing, occurrenceStart, initialStart }: Props) {
  const { events } = useEventsData();
  const { members, activeMember, family } = useMembersData();
  const { addEvent, updateEvent, deleteEvent } = useFamilyActions();
  const [hasGoogleIntegration, setHasGoogleIntegration] = useState(false);
  const [syncToGoogle, setSyncToGoogle] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<EventCategory>('general');
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [color, setColor] = useState<MemberColor | null>(null);
  const [recurFreq, setRecurFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>(
    'none',
  );
  const [byweekday, setByweekday] = useState<number[]>([]);
  const [recurInterval, setRecurInterval] = useState(1);
  const [reminderMin, setReminderMin] = useState<number | null>(null);
  const [showCustomEnd, setShowCustomEnd] = useState(false);
  // When deleting a recurring event, swap the footer to a "this one vs the whole
  // series" choice (Outlook-style) instead of a single confirm.
  const [deleteScope, setDeleteScope] = useState(false);

  // True once the user has manually picked an end time — stops smart-duration overwriting it.
  const userChangedEndRef = useRef(false);

  // Only re-init when the editor opens or the target event changes.
  // We intentionally exclude activeMember / initialStart from deps: their
  // references can churn on context syncs (members array reference flips on
  // every realtime tick), which would otherwise wipe the form mid-edit.
   
  useEffect(() => {
    if (!open) return;
    userChangedEndRef.current = false;
    setDeleteScope(false);
    if (editing) {
      setShowCustomEnd(true);
      const s = new Date(editing.start_at);
      const e = new Date(editing.end_at);
      setTitle(editing.title);
      setDescription(editing.description || '');
      setLocation(editing.location || '');
      setCategory(editing.category);
      setAllDay(editing.all_day);
      setStartDate(format(s, 'yyyy-MM-dd'));
      setStartTime(format(s, 'HH:mm'));
      setEndDate(format(e, 'yyyy-MM-dd'));
      setEndTime(format(e, 'HH:mm'));
      setMemberIds(editing.member_ids);
      setColor(editing.color ?? null);
      setRecurFreq(
        (editing.recurrence?.freq as 'daily' | 'weekly' | 'monthly' | 'yearly') ?? 'none',
      );
      setByweekday((editing.recurrence?.byweekday as number[]) ?? []);
      setRecurInterval(editing.recurrence?.interval ?? 1);
      setReminderMin(editing.reminder_offsets[0] ?? null);
      setSyncToGoogle(editing.sync_to_google !== false);
    } else {
      setShowCustomEnd(false);
      const s = initialStart || new Date();
      const sd = format(s, 'yyyy-MM-dd');
      const st = format(s, 'HH:mm');
      const suggestedMins = suggestDuration(events, '', 'general');
      const end = applyMins(sd, st, suggestedMins);
      setTitle('');
      setDescription('');
      setLocation('');
      setCategory('general');
      setAllDay(false);
      setStartDate(sd);
      setStartTime(st);
      setEndDate(end.date);
      setEndTime(end.time);
      setMemberIds(activeMember ? [activeMember.id] : []);
      setColor(null);
      setRecurFreq('none');
      setByweekday([]);
      setRecurInterval(1);
      setReminderMin(null);
      setSyncToGoogle(true);
    }
  }, [open, editing?.id]);

  // Detect whether the family has at least one connected Google integration —
  // the per-event sync toggle is only meaningful when someone's connected.
  useEffect(() => {
    if (!open || !supabase) return;
    let cancelled = false;
    supabase
      .rpc('get_family_google_integration', { p_family_id: family.id })
      .then(({ data }) => {
        if (!cancelled) setHasGoogleIntegration(Array.isArray(data) && data.length > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [open, family.id]);

  // ---- handlers ---------------------------------------------------------------

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!editing && !userChangedEndRef.current && startDate && startTime) {
      const mins = suggestDuration(events, val, category);
      const end = applyMins(startDate, startTime, mins);
      setEndDate(end.date);
      setEndTime(end.time);
    }
  };

  const handleCategoryChange = (c: EventCategory) => {
    setCategory(c);
    // WFH defaults to an all-day event so parents can drop it on a day
    // without fiddling with start/end times.
    if (c === 'wfh' && !editing) {
      setAllDay(true);
    }
    if (!editing && !userChangedEndRef.current && startDate && startTime) {
      const mins = suggestDuration(events, title, c);
      const end = applyMins(startDate, startTime, mins);
      setEndDate(end.date);
      setEndTime(end.time);
    }
  };

  const handleStartDateChange = (val: string) => {
    if (startDate && startTime && endDate && endTime) {
      const ne = shiftEnd(startDate, startTime, endDate, endTime, val, startTime);
      setEndDate(ne.date);
      if (!allDay) setEndTime(ne.time);
    }
    setStartDate(val);
    // All-day: keep end >= start
    if (allDay && endDate && val > endDate) setEndDate(val);
  };

  const handleStartTimeChange = (val: string) => {
    if (startDate && startTime && endDate && endTime) {
      const ne = shiftEnd(startDate, startTime, endDate, endTime, startDate, val);
      setEndDate(ne.date);
      setEndTime(ne.time);
    }
    setStartTime(val);
  };

  const handleAllDayToggle = (checked: boolean) => {
    setAllDay(checked);
    if (checked) {
      if (!endDate || endDate < startDate) setEndDate(startDate);
    } else {
      const st = startTime || '09:00';
      if (!startTime) setStartTime(st);
      const mins = suggestDuration(events, title, category);
      const end = applyMins(startDate, st, mins);
      setEndDate(end.date);
      setEndTime(end.time);
      userChangedEndRef.current = false;
      setShowCustomEnd(false);
    }
  };

  const toggleByWeekday = (d: number) =>
    setByweekday((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const handleQuickDuration = (mins: number) => {
    if (!startDate || !startTime) return;
    const end = applyMins(startDate, startTime, mins);
    setEndDate(end.date);
    setEndTime(end.time);
    userChangedEndRef.current = true;
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const startISO = allDay
      ? new Date(`${startDate}T00:00:00`).toISOString()
      : new Date(`${startDate}T${startTime}:00`).toISOString();
    const endISO = allDay
      ? new Date(`${endDate}T23:59:00`).toISOString()
      : new Date(`${endDate}T${endTime}:00`).toISOString();

    const recurrence: Recurrence | null =
      recurFreq === 'none'
        ? null
        : {
            freq: recurFreq,
            interval: Math.max(1, recurInterval),
            ...(recurFreq === 'weekly' && byweekday.length > 0 ? { byweekday } : {}),
          };

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      category,
      color,
      all_day: allDay,
      start_at: startISO,
      end_at: endISO,
      member_ids: memberIds,
      recurrence,
      reminder_offsets: reminderMin !== null ? [reminderMin] : [],
      sync_to_google: syncToGoogle,
      created_by: activeMember?.id ?? null,
    };

    if (editing) {
      updateEvent(editing.id, payload);
    } else {
      addEvent(payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    // Repeating event with a known occurrence: let the user choose this one or
    // the whole series. Without an occurrence we can only delete the series.
    if (editing.recurrence && occurrenceStart) {
      setDeleteScope(true);
      return;
    }
    setConfirmDelete(true);
  };
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Drop just the tapped occurrence by adding its start to the series' exdates;
  // expandEvents() then skips it. Leaves the rest of the series intact.
  const deleteThisOccurrence = () => {
    if (!editing || !occurrenceStart) return;
    updateEvent(editing.id, {
      exdates: [...(editing.exdates ?? []), occurrenceStart],
    });
    setDeleteScope(false);
    onClose();
  };

  const deleteSeries = () => {
    if (!editing) return;
    deleteEvent(editing.id);
    setDeleteScope(false);
    onClose();
  };

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const durLabel = durationLabel(allDay, startDate, startTime, endDate, endTime);

  const inputCls =
    'px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit event' : 'New event'}
      maxWidth="2xl"
      footer={
        deleteScope ? (
          <>
            <span className="flex items-center gap-1.5 text-text-muted text-sm">
              <Repeat size={15} /> Delete repeating event
            </span>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setDeleteScope(false)}
                className="px-4 py-2 text-sm text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                onClick={deleteThisOccurrence}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-text hover:border-accent"
              >
                This event
              </button>
              <button
                onClick={deleteSeries}
                className="px-4 py-2 text-sm font-medium rounded-md bg-accent-strong text-white hover:opacity-90"
              >
                All events
              </button>
            </div>
          </>
        ) : (
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
                disabled={!title.trim()}
                className="px-5 py-2 bg-accent-strong text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </>
        )
      }
    >
      {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Event title"
            autoFocus
            className="w-full px-3 py-3 bg-surface-2 border border-border rounded-md text-text text-lg font-medium placeholder:text-text-faint focus:outline-none focus:border-accent"
          />

          {/* Date & time */}
          <div className="space-y-3">
            {/* All day toggle */}
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => handleAllDayToggle(e.target.checked)}
                className="accent-accent w-4 h-4"
              />
              All day
            </label>

            {/* Start field */}
            <div>
              <div className="text-xs text-text-faint mb-1.5">Starts</div>
              {allDay ? (
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className={inputCls + ' w-full'}
                />
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className={inputCls + ' flex-1 min-w-0'}
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className={inputCls + ' w-[5.5rem]'}
                  />
                </div>
              )}
            </div>

            {/* All-day end OR timed duration */}
            {allDay ? (
              <div>
                <div className="text-xs text-text-faint mb-1.5">Ends</div>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    userChangedEndRef.current = true;
                  }}
                  className={inputCls + ' w-full'}
                />
                {durLabel && <div className="text-xs text-text-faint mt-1.5">{durLabel}</div>}
              </div>
            ) : showCustomEnd ? (
              <>
                <div>
                  <div className="text-xs text-text-faint mb-1.5">Ends</div>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        userChangedEndRef.current = true;
                      }}
                      className={inputCls + ' flex-1 min-w-0'}
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        userChangedEndRef.current = true;
                      }}
                      className={inputCls + ' w-[5.5rem]'}
                    />
                  </div>
                </div>
                {durLabel && <div className="text-xs text-text-faint pl-0.5">{durLabel}</div>}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_DURATIONS.map(({ label, mins }) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleQuickDuration(mins)}
                      className="px-3 py-1 rounded-full text-xs border border-border text-text-muted hover:border-accent hover:text-accent transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DURATIONS.map(({ label, mins }) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleQuickDuration(mins)}
                    className="px-3 py-1 rounded-full text-xs border border-border text-text-muted hover:border-accent hover:text-accent transition-colors"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowCustomEnd(true)}
                  className="px-3 py-1 rounded-full text-xs border border-border text-text-muted hover:border-accent hover:text-accent transition-colors"
                >
                  Other…
                </button>
              </div>
            )}
          </div>

          {/* Members */}
          <div>
            <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
              <Users size={14} /> Who's involved?
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const selected = memberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={
                      'flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border transition-[transform,opacity,background-color,border-color,color,box-shadow] ' +
                      (selected
                        ? 'bg-surface-2 border-accent'
                        : 'border-border hover:border-border-strong opacity-70')
                    }
                  >
                    <Avatar member={m} size={26} />
                    <span className="text-sm text-text">{m.name}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setMemberIds([])}
                className={
                  'flex items-center gap-1.5 px-3 py-1 rounded-full border transition-[transform,opacity,background-color,border-color,color,box-shadow] ' +
                  (memberIds.length === 0
                    ? 'bg-surface-2 border-accent'
                    : 'border-border hover:border-border-strong opacity-70')
                }
              >
                <Users size={14} />
                <span className="text-sm text-text">Family</span>
              </button>
            </div>
          </div>

          {/* Location */}
          <div>
            <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
              <MapPin size={14} /> Location
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
            />
          </div>

          {/* Category */}
          <div>
            <div className="text-sm text-text-muted mb-2">Category</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => handleCategoryChange(c)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                    (category === c
                      ? 'bg-accent-strong text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {categoryLabel(c)}
                </button>
              ))}
            </div>
          </div>

          {/* Colour override */}
          <div>
            <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
              <Palette size={14} /> Colour
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <button
                type="button"
                onClick={() => setColor(null)}
                title="Auto (use member colour)"
                className={
                  'px-3 h-8 rounded-full text-xs border transition-colors ' +
                  (color === null
                    ? 'bg-accent-strong text-white border-accent'
                    : 'border-border text-text-muted hover:border-border-strong')
                }
              >
                Auto
              </button>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className={
                    'w-8 h-8 rounded-full transition-transform ' +
                    (color === c ? 'ring-2 ring-text-muted scale-110' : '')
                  }
                  style={{ background: MEMBER_COLORS[c].base }}
                />
              ))}
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
              <Repeat size={14} /> Repeats
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setRecurFreq(f);
                    // Pre-populate the day from the event's start date when switching to weekly
                    if (f === 'weekly' && byweekday.length === 0 && startDate) {
                      setByweekday([new Date(startDate + 'T00:00:00').getDay()]);
                    }
                  }}
                  className={
                    'px-3 py-1.5 rounded-full text-xs capitalize border transition-colors ' +
                    (recurFreq === f
                      ? 'bg-accent-strong text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {f === 'none' ? 'Never' : f}
                </button>
              ))}
            </div>
            {recurFreq !== 'none' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                <span>Every</span>
                <div className="flex items-center rounded-full border border-border">
                  <button
                    type="button"
                    onClick={() => setRecurInterval((n) => Math.max(1, n - 1))}
                    disabled={recurInterval <= 1}
                    className="w-7 h-7 flex items-center justify-center hover:text-text disabled:opacity-40"
                    aria-label="Fewer"
                  >
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums text-text">{recurInterval}</span>
                  <button
                    type="button"
                    onClick={() => setRecurInterval((n) => Math.min(99, n + 1))}
                    className="w-7 h-7 flex items-center justify-center hover:text-text"
                    aria-label="More"
                  >
                    +
                  </button>
                </div>
                <span>
                  {(recurFreq === 'daily'
                    ? 'day'
                    : recurFreq === 'weekly'
                      ? 'week'
                      : recurFreq === 'monthly'
                        ? 'month'
                        : 'year') + (recurInterval > 1 ? 's' : '')}
                </span>
              </div>
            )}
            {recurFreq === 'weekly' && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleByWeekday(i)}
                    className={
                      'w-10 py-1.5 rounded-full text-xs border transition-colors ' +
                      (byweekday.includes(i)
                        ? 'bg-accent-strong text-white border-accent'
                        : 'border-border text-text-muted hover:border-border-strong')
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reminder */}
          <div>
            <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
              <Bell size={14} /> Reminder
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { v: null, label: 'None' },
                  { v: 0, label: 'At time' },
                  { v: 10, label: '10 min' },
                  { v: 30, label: '30 min' },
                  { v: 60, label: '1 hr' },
                  { v: 1440, label: '1 day' },
                ] as { v: number | null; label: string }[]
              ).map((opt) => (
                <button
                  key={String(opt.v)}
                  onClick={() => setReminderMin(opt.v)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                    (reminderMin === opt.v
                      ? 'bg-accent-strong text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
          />

          {/* Google Calendar opt-out — only shown when at least one parent
              has connected their Google account. */}
          {hasGoogleIntegration && (
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncToGoogle}
                onChange={(e) => setSyncToGoogle(e.target.checked)}
                className="accent-accent"
              />
              <CalendarIcon size={14} />
              <span>Sync to connected Google Calendars</span>
            </label>
          )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete event?"
        body={editing ? `"${editing.title}" will be removed.` : undefined}
        onConfirm={() => {
          if (!editing) return;
          deleteEvent(editing.id);
          onClose();
        }}
      />
    </Modal>
  );
}
