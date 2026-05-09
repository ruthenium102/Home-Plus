import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Repeat, Bell, MapPin, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { suggestDuration } from '@/lib/events';
import { Avatar } from './Avatar';
import type { CalendarEvent, EventCategory, Recurrence } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: CalendarEvent | null;
  initialStart?: Date;
}

const CATEGORIES: EventCategory[] = [
  'general', 'school', 'work', 'sport', 'medical', 'social', 'travel', 'meal'
];

const QUICK_DURATIONS = [
  { label: '15min', mins: 15 },
  { label: '30min', mins: 30 },
  { label: '1hr',   mins: 60 },
  { label: '1.5hr', mins: 90 },
  { label: '2hr',   mins: 120 },
];

function durationLabel(
  allDay: boolean,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string
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
  newStartTime: string
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
  mins: number
): { date: string; time: string } {
  const s = new Date(`${startDate}T${startTime}:00`);
  const e = new Date(s.getTime() + mins * 60000);
  return { date: format(e, 'yyyy-MM-dd'), time: format(e, 'HH:mm') };
}

export function EventEditor({ open, onClose, editing, initialStart }: Props) {
  const { members, events, addEvent, updateEvent, deleteEvent, activeMember } = useFamily();

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
  const [recurFreq, setRecurFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [reminderMin, setReminderMin] = useState<number | null>(null);

  // True once the user has manually picked an end time — stops smart-duration overwriting it.
  const userChangedEndRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    userChangedEndRef.current = false;
    if (editing) {
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
      setRecurFreq((editing.recurrence?.freq as 'daily' | 'weekly' | 'monthly' | 'yearly') ?? 'none');
      setReminderMin(editing.reminder_offsets[0] ?? null);
    } else {
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
      setRecurFreq('none');
      setReminderMin(null);
    }
  }, [open, editing, initialStart, activeMember]);

  if (!open) return null;

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
    }
  };

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
      recurFreq === 'none' ? null : { freq: recurFreq, interval: 1 };

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      category,
      all_day: allDay,
      start_at: startISO,
      end_at: endISO,
      member_ids: memberIds,
      recurrence,
      reminder_offsets: reminderMin !== null ? [reminderMin] : [],
      created_by: activeMember?.id ?? null
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
    if (confirm(`Delete "${editing.title}"?`)) {
      deleteEvent(editing.id);
      onClose();
    }
  };

  const toggleMember = (id: string) =>
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const durLabel = durationLabel(allDay, startDate, startTime, endDate, endTime);

  const inputCls =
    'px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-display text-xl text-text">
            {editing ? 'Edit event' : 'New event'}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
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

            {/* Starts / Ends */}
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <div className="text-xs text-text-faint mb-1.5">Ends</div>
                {allDay ? (
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => { setEndDate(e.target.value); userChangedEndRef.current = true; }}
                    className={inputCls + ' w-full'}
                  />
                ) : (
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => { setEndDate(e.target.value); userChangedEndRef.current = true; }}
                      className={inputCls + ' flex-1 min-w-0'}
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => { setEndTime(e.target.value); userChangedEndRef.current = true; }}
                      className={inputCls + ' w-[5.5rem]'}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Duration label */}
            {durLabel && (
              <div className="text-xs text-text-faint pl-0.5">{durLabel}</div>
            )}

            {/* Quick duration presets — timed events only */}
            {!allDay && (
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
                      'flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border transition-all ' +
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
            </div>
            <div className="text-xs text-text-faint mt-1.5">
              Leave empty for whole-family events
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
                    'px-3 py-1.5 rounded-full text-xs capitalize border transition-colors ' +
                    (category === c
                      ? 'bg-accent text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {c}
                </button>
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
                  onClick={() => setRecurFreq(f)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs capitalize border transition-colors ' +
                    (recurFreq === f
                      ? 'bg-accent text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {f === 'none' ? 'Never' : f}
                </button>
              ))}
            </div>
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
                  { v: 0,    label: 'At time' },
                  { v: 10,   label: '10 min' },
                  { v: 30,   label: '30 min' },
                  { v: 60,   label: '1 hr' },
                  { v: 1440, label: '1 day' }
                ] as { v: number | null; label: string }[]
              ).map((opt) => (
                <button
                  key={String(opt.v)}
                  onClick={() => setReminderMin(opt.v)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                    (reminderMin === opt.v
                      ? 'bg-accent text-white border-accent'
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border shrink-0 bg-surface">
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
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
