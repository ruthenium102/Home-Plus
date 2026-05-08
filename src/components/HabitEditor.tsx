import { useEffect, useState } from 'react';
import { X, Trash2, Lock, Users, Sparkles } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from './Avatar';
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
  { v: 'weekly', label: 'Weekly' }
];

export function HabitEditor({ open, editing, onClose }: Props) {
  const { activeMember, members, addHabit, updateHabit, deleteHabit } = useFamily();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [memberId, setMemberId] = useState<string>('');
  const [cadence, setCadence] = useState<HabitCadence>('daily');
  const [visibility, setVisibility] = useState<'private' | 'shared'>('private');
  const [streakRewards, setStreakRewards] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setMemberId(editing.member_id);
      setCadence(editing.cadence);
      setVisibility(editing.visibility);
      setStreakRewards(editing.streak_rewards);
    } else {
      setTitle('');
      setDescription('');
      setMemberId(activeMember?.id || '');
      setCadence('daily');
      setVisibility('private');
      setStreakRewards(false);
    }
  }, [open, editing, activeMember]);

  if (!open) return null;

  const owner = members.find((m) => m.id === memberId);
  const isKid = owner?.role === 'child';

  const handleSave = () => {
    if (!title.trim() || !memberId) return;
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      member_id: memberId,
      cadence,
      visibility,
      streak_rewards: isKid ? streakRewards : false,
      archived: false
    };
    if (editing) {
      updateHabit(editing.id, payload);
    } else {
      addHabit(payload);
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
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md sm:max-w-lg max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-display text-xl text-text">
            {editing ? 'Edit habit' : 'New habit'}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
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
            <div className="text-sm text-text-muted mb-2">Whose habit is this?</div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMemberId(m.id)}
                  className={
                    'flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border transition-colors ' +
                    (memberId === m.id
                      ? 'bg-surface-2 border-accent'
                      : 'border-border opacity-70 hover:opacity-100')
                  }
                >
                  <Avatar member={m} size={26} />
                  <span className="text-sm text-text">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cadence */}
          <div>
            <div className="text-sm text-text-muted mb-2">How often</div>
            <div className="flex flex-wrap gap-1.5">
              {CADENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setCadence(opt.v)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                    (cadence === opt.v
                      ? 'bg-accent text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
                  className={
                    visibility === 'private' ? 'text-accent' : 'text-text-muted'
                  }
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
                  className={
                    visibility === 'shared' ? 'text-accent' : 'text-text-muted'
                  }
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
        </div>

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
              disabled={!title.trim() || !memberId}
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
