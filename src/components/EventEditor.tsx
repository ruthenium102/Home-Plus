import { useEffect, useState } from 'react';
import { X, Trash2, Repeat, Bell, MapPin, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from './Avatar';
import type { CalendarEvent, EventCategory, Recurrence } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  // Existing event (edit mode) OR initial start time (create mode)
  editing?: CalendarEvent | null;
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
  'meal'
];

export function EventEditor({ open, onClose, editing, initialStart }: Props) {
  const { members, addEvent, updateEvent, deleteEvent, activeMember } = useFamily();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<EventCategory>('general');
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(''); // YYYY-MM-DD
  const [startTime, setStartTime] = useState(''); // HH:mm
  const [endTime, setEndTime] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [recurFreq, setRecurFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>(
    'none'
  );
  const [reminderMin, setReminderMin] = useState<number | null>(null);

  // Populate form when opening
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const s = new Date(editing.start_at);
      const e = new Date(editing.end_at);
      setTitle(editing.title);
      setDescription(editing.description || '');
      setLocation(editing.location || '');
      setCategory(editing.category);
      setAllDay(editing.all_day);
      setDate(format(s, 'yyyy-MM-dd'));
      setStartTime(format(s, 'HH:mm'));
      setEndTime(format(e, 'HH:mm'));
      setMemberIds(editing.member_ids);
      setRecurFreq((editing.recurrence?.freq as any) ?? 'none');
      setReminderMin(editing.reminder_offsets[0] ?? null);
    } else {
      const s = initialStart || new Date();
      const e = new Date(s.getTime() + 60 * 60 * 1000);
      setTitle('');
      setDescription('');
      setLocation('');
      setCategory('general');
      setAllDay(false);
      setDate(format(s, 'yyyy-MM-dd'));
      setStartTime(format(s, 'HH:mm'));
      setEndTime(format(e, 'HH:mm'));
      setMemberIds(activeMember ? [activeMember.id] : []);
      setRecurFreq('none');
      setReminderMin(null);
    }
  }, [open, editing, initialStart, activeMember]);

  if (!open) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    const startISO = allDay
      ? new Date(`${date}T00:00:00`).toISOString()
      : new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = allDay
      ? new Date(`${date}T23:59:00`).toISOString()
      : new Date(`${date}T${endTime}:00`).toISOString();

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
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            autoFocus
            className="w-full px-3 py-3 bg-surface-2 border border-border rounded-md text-text text-lg font-medium placeholder:text-text-faint focus:outline-none focus:border-accent"
          />

          {/* Date & time */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="accent-accent"
              />
              All day
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={allDay}
                className="px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent disabled:opacity-50"
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={allDay}
                className="px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent disabled:opacity-50"
              />
            </div>
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
                  onClick={() => setCategory(c)}
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
              {[
                { v: null, label: 'None' },
                { v: 0, label: 'At time' },
                { v: 10, label: '10 min' },
                { v: 30, label: '30 min' },
                { v: 60, label: '1 hr' },
                { v: 1440, label: '1 day' }
              ].map((opt) => (
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
