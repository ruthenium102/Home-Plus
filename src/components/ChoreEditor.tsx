import { useEffect, useRef, useState } from 'react';
import { localISO } from '@/lib/dates';
import { hapticLight, hapticMedium } from '@/lib/native';
import { createEdgeAutoScroller } from '@/lib/dragAutoScroll';
import { Trash2, ShieldCheck, RotateCw } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { isoWeekStr } from '@/lib/rotation';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import type { Chore, ChoreFrequency, ChoreMode, FamilyMember, RewardCategoryKey } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Chore | null;
}

const FREQ_OPTIONS: { v: ChoreFrequency; label: string }[] = [
  { v: 'daily', label: 'Every day' },
  { v: 'weekdays', label: 'Weekdays' },
  { v: 'weekend', label: 'Weekends' },
  { v: 'weekly', label: 'Pick days' },
  { v: 'monthly', label: 'Monthly' },
  { v: 'one_off', label: 'One-off' },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun-first

export function ChoreEditor({ open, onClose, editing }: Props) {
  const { members, rewardCategories, addChore, updateChore, deleteChore } = useFamily();
  const kids = members.filter((m) => m.role === 'child');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigned, setAssigned] = useState<string[]>([]);
  const [freq, setFreq] = useState<ChoreFrequency>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [payout, setPayout] = useState<Partial<Record<RewardCategoryKey, number>>>({
    stars: 5,
  });
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [mode, setMode] = useState<ChoreMode>('standard');
  const [rotationRoster, setRotationRoster] = useState<string[]>([]);
  const [rosterRoleName, setRosterRoleName] = useState('');
  // Weekday the rotation advances on (0=Sun..6=Sat). Default Monday.
  const [rotationWeekday, setRotationWeekday] = useState(1);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setAssigned(editing.assigned_to);
      setFreq(editing.frequency);
      setWeekdays(editing.weekdays);
      setPayout(editing.payout);
      setRequiresApproval(editing.requires_approval);
      setMode(editing.mode ?? 'standard');
      setRotationRoster(editing.rotation_roster ?? []);
      setRosterRoleName(editing.roster_role_name ?? '');
      setRotationWeekday(editing.rotation_weekday ?? 1);
    } else {
      setTitle('');
      setDescription('');
      setAssigned([]);
      setFreq('daily');
      setWeekdays([]);
      setPayout({ stars: 5 });
      setRequiresApproval(false);
      setMode('standard');
      setRotationRoster([]);
      setRosterRoleName('');
      setRotationWeekday(1);
    }
  }, [open, editing]);

  // Heal stale IDs in both the assigned list and rotation roster. Old chores
  // sometimes carry IDs for kids who were renamed, removed, or whose role
  // changed; left in the data they inflate the roster length and shift the
  // visible numbering (e.g. "4. Sophie" instead of "1. Sophie").
  useEffect(() => {
    if (!open) return;
    const validKidIds = new Set(
      members.filter((m) => m.role === 'child').map((k) => k.id),
    );
    setAssigned((prev) => {
      const cleaned = prev.filter((id) => validKidIds.has(id));
      return cleaned.length === prev.length ? prev : cleaned;
    });
    setRotationRoster((prev) => {
      const cleaned = prev.filter((id) => validKidIds.has(id));
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, [open, members]);

  // Keep the rotation roster in sync with the assigned list whenever rotation
  // is active. New kids get appended to the end; removed kids drop out of the
  // roster. The user's manual ordering is preserved across the diff.
  useEffect(() => {
    if (mode === 'standard') return;
    setRotationRoster((prev) => {
      const assignedSet = new Set(assigned);
      const kept = prev.filter((id) => assignedSet.has(id));
      const existing = new Set(kept);
      for (const id of assigned) {
        if (!existing.has(id)) kept.push(id);
      }
      // Avoid an extra render when nothing changed.
      if (kept.length === prev.length && kept.every((id, i) => id === prev[i])) {
        return prev;
      }
      return kept;
    });
  }, [assigned, mode]);


  const handleSave = () => {
    if (!title.trim()) return;
    const today = localISO();
    const effectiveRoster = mode !== 'standard' ? rotationRoster : [];
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      assigned_to: assigned,
      frequency: freq,
      weekdays: freq === 'weekly' ? weekdays : [],
      payout,
      active_from: editing?.active_from || today,
      // Photo capture isn't built yet, so the toggle is hidden — keep any
      // value already stored on the row for when the feature lands.
      requires_photo: editing?.requires_photo ?? false,
      requires_approval: requiresApproval,
      archived: false,
      mode,
      rotation_roster: effectiveRoster,
      rotation_pointer: editing?.rotation_pointer ?? 0,
      rotation_anchor_iso_week:
        editing?.rotation_anchor_iso_week ?? (mode !== 'standard' ? isoWeekStr() : null),
      roster_role_name: mode === 'roster_role' ? rosterRoleName.trim() || null : null,
      rotation_weekday: mode !== 'standard' ? rotationWeekday : null,
    };

    if (editing) {
      updateChore(editing.id, payload);
    } else {
      addChore(payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    if (confirm(`Delete "${editing.title}"?`)) {
      deleteChore(editing.id);
      onClose();
    }
  };

  const updatePayout = (cat: RewardCategoryKey, val: string) => {
    const n = parseInt(val, 10);
    setPayout((prev) => {
      const next = { ...prev };
      if (isNaN(n) || n <= 0) {
        delete next[cat];
      } else {
        next[cat] = n;
      }
      return next;
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit chore' : 'New chore'}
      maxWidth="2xl"
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
              disabled={!title.trim() || assigned.length === 0}
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
            placeholder="Chore title"
            autoFocus
            className="w-full px-3 py-3 bg-surface-2 border border-border rounded-md text-text text-lg font-medium placeholder:text-text-faint focus:outline-none focus:border-accent"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
          />

          {/* Assigned to */}
          <div>
            <div className="text-sm text-text-muted mb-2">Assigned to</div>
            <div className="flex flex-wrap gap-2">
              {kids.map((m) => {
                const selected = assigned.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setAssigned((prev) =>
                        prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                      )
                    }
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
            <div className="text-xs text-text-faint mt-1.5">
              Tap each person who should do this chore.
            </div>
          </div>

          {/* Frequency */}
          <div>
            <div className="text-sm text-text-muted mb-2">How often</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {FREQ_OPTIONS.map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setFreq(opt.v)}
                  className={
                    'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                    (freq === opt.v
                      ? 'bg-accent-strong text-white border-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {freq === 'weekly' && (
              <div className="flex gap-1.5">
                {WEEKDAY_LABELS.map((label, i) => {
                  const selected = weekdays.includes(i);
                  return (
                    <button
                      key={i}
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
          </div>

          {/* Rotation mode */}
          {assigned.length >= 2 && (
            <div>
              <div className="text-sm text-text-muted mb-2">Assignment mode</div>
              <div className="flex gap-1.5 flex-wrap">
                {(
                  [
                    { v: 'standard', label: 'All do it' },
                    { v: 'rotated', label: 'Rotate weekly' },
                    { v: 'roster_role', label: 'Role rotation' },
                  ] as const
                ).map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => setMode(v)}
                    className={
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                      (mode === v
                        ? 'bg-accent-strong text-white border-accent'
                        : 'border-border text-text-muted hover:border-border-strong')
                    }
                  >
                    {v !== 'standard' && <RotateCw size={11} />}
                    {label}
                  </button>
                ))}
              </div>
              {mode !== 'standard' && (
                <RosterDragList
                  roster={rotationRoster}
                  kids={kids}
                  onChange={setRotationRoster}
                  mode={mode}
                  rosterRoleName={rosterRoleName}
                  onRoleNameChange={setRosterRoleName}
                  rotationWeekday={rotationWeekday}
                  onRotationWeekdayChange={setRotationWeekday}
                />
              )}
            </div>
          )}

          {/* Payout + flags side-by-side on tablet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-text-muted mb-2">Reward per completion</div>
              <div className="space-y-1.5">
                {rewardCategories.map((cat) => (
                  <div key={cat.key} className="flex items-center gap-3">
                    <label className="flex-1 text-sm text-text">
                      {cat.label} ({cat.unit})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={payout[cat.key] ?? ''}
                      onChange={(e) => updatePayout(cat.key, e.target.value)}
                      placeholder="0"
                      className="w-20 px-2 py-1.5 bg-surface-2 border border-border rounded-md text-text text-sm text-right tabular-nums focus:outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
              {(payout.savings_cents ?? 0) > 0 && (
                <div className="text-[11px] text-text-faint mt-1.5">
                  Savings is in cents — 100 = $1.00
                </div>
              )}
            </div>

            <div>
              <div className="text-sm text-text-muted mb-2">Approval</div>
              <div className="space-y-2">
                {/* "Photo proof" toggle removed until photo capture actually
                    exists — it advertised a verification step that never
                    happened (completions always saved photo_url: null). */}
                <SegmentedToggle
                  icon={<ShieldCheck size={14} />}
                  label="Parent approves"
                  value={requiresApproval}
                  onChange={setRequiresApproval}
                />
              </div>
            </div>
          </div>
    </Modal>
  );
}

// ---- Segmented on/off toggle (used for Photo proof + Parent approves) ------

function SegmentedToggle({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-surface-2/40 border border-border">
      <span className="text-text-muted">{icon}</span>
      <span className="text-sm text-text flex-1">{label}</span>
      <div className="flex bg-surface-2 border border-border rounded-md p-0.5">
        {(
          [
            { v: false, label: 'Off' },
            { v: true, label: 'On' },
          ] as const
        ).map((opt) => (
          <button
            key={String(opt.v)}
            type="button"
            onClick={() => onChange(opt.v)}
            className={
              'px-3 py-1 rounded text-xs font-semibold transition-colors ' +
              (value === opt.v ? 'bg-accent-strong text-white' : 'text-text-muted hover:text-text')
            }
            aria-pressed={value === opt.v}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Roster drag-and-drop reorder ------------------------------------------

const FULL_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface RosterDragListProps {
  roster: string[];
  kids: FamilyMember[];
  onChange: (next: string[]) => void;
  mode: ChoreMode;
  rosterRoleName: string;
  onRoleNameChange: (v: string) => void;
  rotationWeekday: number;
  onRotationWeekdayChange: (v: number) => void;
}

function RosterDragList({
  roster,
  kids,
  onChange,
  mode,
  rosterRoleName,
  onRoleNameChange,
  rotationWeekday,
  onRotationWeekdayChange,
}: RosterDragListProps) {
  // Pointer-event drag-to-reorder — HTML5 DnD doesn't work on iOS touch.
  // We use elementsFromPoint to find which chip the pointer is hovering and
  // reorder live (matching the previous live-feedback behaviour).
  const dragIdRef = useRef<string | null>(null);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;

  const startDrag = (id: string, downEv: React.PointerEvent) => {
    if (downEv.button !== undefined && downEv.button !== 0) return;
    const target = downEv.currentTarget as HTMLElement;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    let started = false;
    const pointerId = downEv.pointerId;
    const autoScroll = createEdgeAutoScroller();

    const findRosterIdAt = (clientX: number, clientY: number): string | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const chip = (el as HTMLElement).closest?.('[data-roster-id]') as HTMLElement | null;
        if (chip) return chip.dataset.rosterId ?? null;
      }
      return null;
    };

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientY - startY) < 6 && Math.abs(ev.clientX - startX) < 6) return;
        started = true;
        // Match the app-wide drag lift-off cue.
        void hapticLight();
        try {
          target.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        dragIdRef.current = id;
      }
      autoScroll.update(ev.clientX, ev.clientY);
      const overId = findRosterIdAt(ev.clientX, ev.clientY);
      if (!overId || overId === id) return;
      const cur = rosterRef.current;
      const from = cur.indexOf(id);
      const to = cur.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;
      const next = cur.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onChange(next);
      ev.preventDefault();
    };
    const cleanup = () => {
      autoScroll.stop();
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cleanup);
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      dragIdRef.current = null;
    };
    const up = () => {
      // Settle cue on a genuine reorder drop (not a plain tap).
      if (started) void hapticMedium();
      cleanup();
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cleanup);
  };

  return (
    <div className="mt-2 p-3 bg-surface-2 rounded-lg text-xs text-text-faint space-y-2">
      <div>Rotation order — drag to reorder:</div>
      <div className="flex flex-wrap gap-1.5">
        {roster.map((id) => {
          const m = kids.find((k) => k.id === id);
          if (!m) return null;
          return (
            <span
              key={id}
              data-roster-id={id}
              style={{ touchAction: 'none' }}
              onPointerDown={(ev) => startDrag(id, ev)}
              className="flex items-center gap-1 bg-surface border border-border px-2 py-0.5 rounded-full text-xs text-text cursor-grab active:cursor-grabbing select-none"
            >
              {m.name}
            </span>
          );
        })}
      </div>
      {mode === 'roster_role' && (
        <input
          type="text"
          value={rosterRoleName}
          onChange={(e) => onRoleNameChange(e.target.value)}
          placeholder="Role name (e.g. Bins person)"
          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-md text-xs text-text placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      )}
      <div>
        <div className="mb-1.5">Rotation advances on:</div>
        <div className="flex flex-wrap gap-1">
          {FULL_WEEKDAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onRotationWeekdayChange(i)}
              className={
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ' +
                (rotationWeekday === i
                  ? 'bg-accent-strong text-white border-accent'
                  : 'bg-surface border-border text-text-muted hover:border-border-strong')
              }
              aria-pressed={rotationWeekday === i}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
