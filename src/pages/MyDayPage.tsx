import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  X,
  Check,
  Maximize2,
  Minimize2,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Circle,
  BookOpen,
  Music,
  TreePine,
  Gamepad2,
  Bike,
  Heart,
  Star,
  Dumbbell,
  Brush,
  Coffee,
  Apple,
  Utensils,
  Bath,
  Dog,
  ShoppingCart,
  Laptop,
  Bed,
  Pill,
  Leaf,
  Film,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { addDays, format } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { localISO } from '@/lib/dates';
import {
  PX_PER_MIN,
  SECTION_LABELS,
  SNAP_MIN,
  TIMELINE_END_MIN,
  TIMELINE_START_MIN,
  blocksForMemberDate,
  clampStartMin,
  effectiveStartMin,
  formatDuration,
  formatTimeOfDay,
  sectionForHour,
  sectionForMin,
  snapMin,
} from '@/lib/dayplan';
import type { ActivityPoolItem, DayPlanBlock, DayPlanSection } from '@/types';

// ---- Icon resolver --------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Circle, BookOpen, Music, Pencil, TreePine, Gamepad2,
  Bike, Heart, Star, Dumbbell, Brush, Coffee, Apple,
  Utensils, Bath, Dog, ShoppingCart, Laptop, Bed, Pill, Leaf, Film, Waves,
};

function resolveIcon(name: string | null): LucideIcon {
  if (!name) return Circle;
  return ICON_MAP[name] ?? Circle;
}

// ---- Date scroller --------------------------------------------------------

function DateScroller({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const dt = new Date(`${date}T00:00:00`);
  const today = localISO();
  const isToday = date === today;
  const shift = (delta: number) => onChange(format(addDays(dt, delta), 'yyyy-MM-dd'));

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => shift(-1)}
        className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-2"
        aria-label="Previous day"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex flex-col items-center min-w-[140px]">
        <span className="font-display text-sm text-text leading-tight">
          {format(dt, 'EEEE, d MMM')}
        </span>
        {!isToday && (
          <button
            onClick={() => onChange(today)}
            className="text-[10px] uppercase tracking-wider text-accent font-semibold hover:underline"
          >
            Jump to today
          </button>
        )}
        {isToday && (
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">Today</span>
        )}
      </div>
      <button
        onClick={() => shift(1)}
        className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-2"
        aria-label="Next day"
      >
        <ChevronRight size={16} />
      </button>
      {/* Native date picker for jumping further */}
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="opacity-0 absolute pointer-events-none"
        aria-hidden
      />
    </div>
  );
}

// ---- Focus mode (unchanged in spirit) -------------------------------------

interface FocusModeProps {
  blocks: DayPlanBlock[];
  onClose: () => void;
  onToggleDone: (id: string) => void;
}

function FocusMode({ blocks, onClose, onToggleDone }: FocusModeProps) {
  const now = new Date();
  const sortedAll = [...blocks].sort((a, b) => effectiveStartMin(a) - effectiveStartMin(b));
  const undone = sortedAll.filter((b) => !b.done);
  const current = undone[0] ?? sortedAll[0] ?? null;
  const next = undone[1] ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={onClose}>
      <div className="flex-1 flex flex-col items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-widest text-text-faint mb-8">
          {SECTION_LABELS[sectionForHour(now.getHours())]} · {format(now, 'h:mm a')}
        </div>

        {current ? (
          <>
            <div className="mb-3">
              {(() => {
                const Icon = resolveIcon(current.icon);
                return <Icon size={48} className="text-accent mx-auto" />;
              })()}
            </div>
            <h2 className="font-display text-5xl sm:text-6xl text-text text-center mb-3 leading-tight">
              {current.title}
            </h2>
            <div className="text-text-faint text-lg mb-10">{formatDuration(current.duration_min)}</div>
            <button
              onClick={() => onToggleDone(current.id)}
              className={
                'flex items-center gap-3 px-8 py-4 rounded-2xl text-xl font-semibold transition-all ' +
                (current.done
                  ? 'bg-surface-2 text-text-muted border-2 border-border'
                  : 'bg-accent text-white shadow-lg active:scale-95')
              }
            >
              <Check size={24} />
              {current.done ? 'Mark undone' : 'Done!'}
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="text-5xl mb-4">🎉</div>
            <div className="font-display text-3xl text-text">All done!</div>
            <div className="text-text-faint mt-2">Nothing left for today.</div>
          </div>
        )}

        {next && (
          <div className="mt-10 text-center">
            <div className="text-xs text-text-faint uppercase tracking-wider mb-1">Up next</div>
            <div className="text-text-muted text-base">{next.title} · {formatDuration(next.duration_min)}</div>
          </div>
        )}
      </div>

      <div className="p-6 flex justify-center">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-2 border border-border text-text-muted text-sm hover:bg-surface"
        >
          <Minimize2 size={16} /> Exit focus mode
        </button>
      </div>
    </div>
  );
}

// ---- Block rendered on the time grid --------------------------------------

interface BlockOnTimelineProps {
  block: DayPlanBlock;
  onCommit: (patch: { start_min?: number; duration_min?: number }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
}

function BlockOnTimeline({ block, onCommit, onToggleDone, onRemove }: BlockOnTimelineProps) {
  const start = effectiveStartMin(block);
  const duration = block.duration_min;
  const Icon = resolveIcon(block.icon);

  // Local "preview" overrides so the block visibly tracks the pointer while a
  // gesture is in progress. We only commit on pointerup.
  const [previewStart, setPreviewStart] = useState<number | null>(null);
  const [previewDur, setPreviewDur] = useState<number | null>(null);

  const renderStart = previewStart ?? start;
  const renderDur = previewDur ?? duration;

  const top = (renderStart - TIMELINE_START_MIN) * PX_PER_MIN;
  const height = renderDur * PX_PER_MIN;

  // Generic pointer-gesture helper used by move/top-resize/bottom-resize.
  const useGesture = (
    onStart: () => { origStart: number; origDur: number },
    onMove: (deltaMin: number, orig: { origStart: number; origDur: number }) => { start: number; duration: number },
  ) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const orig = onStart();

    let latest = { start: orig.origStart, duration: orig.origDur };
    const move = (ev: PointerEvent) => {
      const deltaMin = snapMin((ev.clientY - startY) / PX_PER_MIN);
      latest = onMove(deltaMin, orig);
      setPreviewStart(latest.start);
      setPreviewDur(latest.duration);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setPreviewStart(null);
      setPreviewDur(null);
      // Only commit if anything actually changed.
      const patch: { start_min?: number; duration_min?: number } = {};
      if (latest.start !== orig.origStart) patch.start_min = latest.start;
      if (latest.duration !== orig.origDur) patch.duration_min = latest.duration;
      if (patch.start_min !== undefined || patch.duration_min !== undefined) onCommit(patch);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  // Body drag — moves the whole block.
  const onBodyDown = useGesture(
    () => ({ origStart: start, origDur: duration }),
    (delta, orig) => {
      const newStart = clampStartMin(orig.origStart + delta, orig.origDur);
      return { start: newStart, duration: orig.origDur };
    },
  );

  // Top handle — adjusts start_min while keeping the bottom edge fixed.
  const onTopHandleDown = useGesture(
    () => ({ origStart: start, origDur: duration }),
    (delta, orig) => {
      const minDur = 15;
      const maxDelta = orig.origDur - minDur;
      const clampedDelta = Math.max(-(orig.origStart - TIMELINE_START_MIN), Math.min(maxDelta, delta));
      return {
        start: orig.origStart + clampedDelta,
        duration: orig.origDur - clampedDelta,
      };
    },
  );

  // Bottom handle — adjusts duration only.
  const onBottomHandleDown = useGesture(
    () => ({ origStart: start, origDur: duration }),
    (delta, orig) => {
      const minDur = 15;
      const maxDur = TIMELINE_END_MIN - orig.origStart;
      const newDur = Math.max(minDur, Math.min(maxDur, orig.origDur + delta));
      return { start: orig.origStart, duration: newDur };
    },
  );

  return (
    <div
      className={
        'absolute left-12 right-2 rounded-lg border shadow-sm group transition-shadow ' +
        (block.done
          ? 'bg-surface border-border opacity-60'
          : 'bg-surface-2 border-border hover:border-accent/40 hover:shadow')
      }
      style={{ top, height, touchAction: 'none' }}
    >
      {/* Top resize handle */}
      <div
        onPointerDown={onTopHandleDown}
        className="absolute -top-2 left-0 right-0 h-4 flex items-center justify-start pl-1 cursor-ns-resize"
        title="Drag to change start time"
      >
        <div className="w-3 h-3 rounded-full bg-accent ring-2 ring-bg opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Body — drag to move */}
      <div
        onPointerDown={onBodyDown}
        className="absolute inset-0 px-2 py-1.5 flex items-start gap-2 cursor-grab active:cursor-grabbing select-none overflow-hidden"
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleDone}
          className={
            'mt-0.5 shrink-0 rounded-full border-2 w-4 h-4 flex items-center justify-center transition-colors ' +
            (block.done
              ? 'bg-accent border-accent text-white'
              : 'border-border hover:border-accent bg-bg')
          }
          aria-label={block.done ? 'Mark undone' : 'Mark done'}
        >
          {block.done && <Check size={9} strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 leading-tight">
            <Icon size={12} className="text-accent shrink-0" />
            <span className={
              'text-xs font-medium truncate ' + (block.done ? 'line-through text-text-muted' : 'text-text')
            }>
              {block.title}
            </span>
          </div>
          <div className="text-[10px] text-text-faint mt-0.5">
            {formatTimeOfDay(renderStart)} · {formatDuration(renderDur)}
          </div>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-text-faint/40 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Remove block"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Bottom resize handle */}
      <div
        onPointerDown={onBottomHandleDown}
        className="absolute -bottom-2 left-0 right-0 h-4 flex items-center justify-end pr-1 cursor-ns-resize"
        title="Drag to change duration"
      >
        <div className="w-3 h-3 rounded-full bg-accent ring-2 ring-bg opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

// ---- Timeline grid --------------------------------------------------------

interface TimelineProps {
  blocks: DayPlanBlock[];
  isToday: boolean;
  onDropPoolItem: (poolItemId: string, startMin: number) => void;
  onUpdateBlock: (id: string, patch: { start_min?: number; duration_min?: number }) => void;
  onToggleDone: (id: string) => void;
  onRemove: (id: string) => void;
}

function Timeline({ blocks, isToday, onDropPoolItem, onUpdateBlock, onToggleDone, onRemove }: TimelineProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = TIMELINE_START_MIN / 60; h <= TIMELINE_END_MIN / 60; h++) list.push(h);
    return list;
  }, []);

  const totalHeight = (TIMELINE_END_MIN - TIMELINE_START_MIN) * PX_PER_MIN;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin - TIMELINE_START_MIN) * PX_PER_MIN;
  const showNow = isToday && nowMin >= TIMELINE_START_MIN && nowMin <= TIMELINE_END_MIN;

  const minForClientY = (clientY: number): number => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return TIMELINE_START_MIN;
    const min = TIMELINE_START_MIN + (clientY - rect.top) / PX_PER_MIN;
    return snapMin(Math.max(TIMELINE_START_MIN, Math.min(TIMELINE_END_MIN - SNAP_MIN, min)));
  };

  return (
    <div
      ref={gridRef}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        try {
          const data = JSON.parse(raw) as { type: 'pool'; id: string };
          if (data.type === 'pool') {
            onDropPoolItem(data.id, minForClientY(e.clientY));
          }
        } catch { /* ignore */ }
      }}
      className={
        'card relative overflow-hidden ' + (dragOver ? 'ring-2 ring-accent/40' : '')
      }
      style={{ height: totalHeight + 20 /* small bottom pad */ }}
    >
      {/* Hour rows */}
      {hours.map((h, idx) => {
        const top = (h * 60 - TIMELINE_START_MIN) * PX_PER_MIN;
        const ampm = h < 12 ? 'am' : 'pm';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return (
          <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top, height: 60 * PX_PER_MIN }}>
            <div className="w-12 -mt-2 text-[10px] text-text-faint text-right pr-2 select-none">
              {idx === 0 ? '' : `${h12} ${ampm}`}
            </div>
            <div className="flex-1 border-t border-border" />
          </div>
        );
      })}

      {/* Half-hour ticks */}
      {hours.slice(0, -1).map((h) => {
        const top = (h * 60 + 30 - TIMELINE_START_MIN) * PX_PER_MIN;
        return (
          <div key={`half-${h}`} className="absolute left-12 right-0 border-t border-border/40 border-dashed" style={{ top }} />
        );
      })}

      {/* Now line */}
      {showNow && (
        <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: nowTop }}>
          <div className="w-12 pr-1 text-[10px] font-semibold text-red-500 text-right">
            {format(now, 'h:mm')}
          </div>
          <div className="flex-1 h-px bg-red-500/80" />
          <div className="absolute left-12 w-2 h-2 rounded-full bg-red-500 -translate-x-1" />
        </div>
      )}

      {/* Blocks */}
      {blocks.map((b) => (
        <BlockOnTimeline
          key={b.id}
          block={b}
          onCommit={(patch) => onUpdateBlock(b.id, patch)}
          onToggleDone={() => onToggleDone(b.id)}
          onRemove={() => onRemove(b.id)}
        />
      ))}
    </div>
  );
}

// ---- Pool item chip -------------------------------------------------------

interface PoolItemProps {
  item: ActivityPoolItem;
  onEdit: () => void;
  onDelete: () => void;
}

function PoolItemChip({ item, onEdit, onDelete }: PoolItemProps) {
  const Icon = resolveIcon(item.icon);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'pool', id: item.id }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="relative flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-2 border border-border hover:border-accent/40 cursor-grab active:cursor-grabbing group"
      title="Drag onto the timeline"
    >
      <Icon size={14} className="text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text truncate">{item.title}</div>
        <div className="text-[10px] text-text-faint">{formatDuration(item.default_duration_min)}</div>
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-accent hover:bg-accent/10 opacity-0 group-hover:opacity-100 transition-all"
        title="Edit activity"
        aria-label="Edit activity"
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
        title="Delete activity"
        aria-label="Delete activity"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ---- Activity modal (add + edit) ------------------------------------------

interface ActivityModalProps {
  initial?: ActivityPoolItem | null;
  onSave: (data: { title: string; icon: string; duration: number }) => void;
  onClose: () => void;
}

const QUICK_ICONS = [
  'BookOpen', 'Music', 'Pencil', 'TreePine', 'Gamepad2', 'Bike',
  'Heart', 'Star', 'Dumbbell', 'Brush', 'Coffee', 'Apple',
  'Utensils', 'Bath', 'Dog', 'ShoppingCart', 'Laptop', 'Bed', 'Pill', 'Leaf', 'Film', 'Waves',
];

function ActivityModal({ initial, onSave, onClose }: ActivityModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [duration, setDuration] = useState(initial?.default_duration_min ?? 60);
  const [icon, setIcon] = useState(initial?.icon ?? 'Circle');

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), icon, duration });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-lg text-text">{initial ? 'Edit activity' : 'Add activity'}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Activity name"
            autoFocus
            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
          <div>
            <div className="text-xs text-text-muted mb-1.5">Default duration</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={15}
                max={180}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="text-sm text-text w-14 text-right">{formatDuration(duration)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1.5">Icon</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ICONS.map((name) => {
                const Icon = resolveIcon(name);
                return (
                  <button
                    key={name}
                    onClick={() => setIcon(name)}
                    className={
                      'w-8 h-8 rounded flex items-center justify-center transition-colors ' +
                      (icon === name ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted hover:bg-surface')
                    }
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40"
          >
            {initial ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main page ------------------------------------------------------------

export function MyDayPage() {
  const {
    activeMember,
    dayPlanBlocks,
    activityPool,
    addDayPlanBlock,
    updateDayPlanBlock,
    removeDayPlanBlock,
    toggleBlockDone,
    addPoolItem,
    updatePoolItem,
    archivePoolItem,
  } = useFamily();

  const [focusMode, setFocusMode] = useState(false);
  const [modalState, setModalState] = useState<{ mode: 'add' } | { mode: 'edit'; item: ActivityPoolItem } | null>(null);
  const [date, setDate] = useState<string>(localISO());

  if (!activeMember) return null;

  const memberBlocks = blocksForMemberDate(dayPlanBlocks, activeMember.id, date);
  const memberPool = activityPool
    .filter((ap) => ap.member_id === activeMember.id && !ap.archived)
    .sort((a, b) => b.usage_count - a.usage_count);

  const isToday = date === localISO();

  const totalDone = memberBlocks.filter((b) => b.done).length;
  const total = memberBlocks.length;

  const handleDropPoolItem = (poolItemId: string, startMin: number) => {
    const item = memberPool.find((p) => p.id === poolItemId);
    if (!item) return;
    const startSafe = clampStartMin(startMin, item.default_duration_min);
    addDayPlanBlock({
      member_id: activeMember.id,
      date,
      section: sectionForMin(startSafe),
      source: 'other',
      source_id: poolItemId,
      title: item.title,
      icon: item.icon,
      duration_min: item.default_duration_min,
      position: 0,
      done: false,
      done_at: null,
      start_min: startSafe,
    });
  };

  const handleUpdateBlock = (id: string, patch: { start_min?: number; duration_min?: number }) => {
    const next: Partial<DayPlanBlock> = { ...patch };
    if (patch.start_min !== undefined) next.section = sectionForMin(patch.start_min);
    updateDayPlanBlock(id, next);
  };

  return (
    <>
      <div className="flex gap-4 max-w-5xl">
        {/* Activity pool sidebar — desktop only */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Activities</span>
            <button
              onClick={() => setModalState({ mode: 'add' })}
              className="w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-accent hover:bg-accent/10 transition-colors"
              title="Add activity"
            >
              <Plus size={14} />
            </button>
          </div>
          {memberPool.length === 0 && (
            <div className="text-xs text-text-faint text-center py-4">
              No activities yet.{' '}
              <button onClick={() => setModalState({ mode: 'add' })} className="text-accent underline">
                Add one
              </button>
            </div>
          )}
          {memberPool.map((item) => (
            <PoolItemChip
              key={item.id}
              item={item}
              onEdit={() => setModalState({ mode: 'edit', item })}
              onDelete={() => archivePoolItem(item.id)}
            />
          ))}
          <p className="mt-2 text-[10px] text-text-faint leading-snug">
            Drag an activity onto the time grid to plan it.
          </p>
        </aside>

        {/* Timeline */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl text-text">{activeMember.name}'s Day</h2>
              {total > 0 && (
                <span className="text-xs text-text-faint">{totalDone}/{total} done</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DateScroller date={date} onChange={setDate} />
              <button
                onClick={() => setModalState({ mode: 'add' })}
                className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 border border-border rounded-md text-sm text-text-muted hover:bg-surface"
              >
                <Plus size={14} /> Add
              </button>
              <button
                onClick={() => setFocusMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90 active:scale-95 transition-all"
              >
                <Maximize2 size={14} /> Focus
              </button>
            </div>
          </div>

          <Timeline
            blocks={memberBlocks}
            isToday={isToday}
            onDropPoolItem={handleDropPoolItem}
            onUpdateBlock={handleUpdateBlock}
            onToggleDone={toggleBlockDone}
            onRemove={removeDayPlanBlock}
          />

          {/* Mobile pool — collapsed list under the timeline */}
          <div className="lg:hidden card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Activities</span>
              <button
                onClick={() => setModalState({ mode: 'add' })}
                className="w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-accent hover:bg-accent/10 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {memberPool.map((item) => (
                <PoolItemChip
                  key={item.id}
                  item={item}
                  onEdit={() => setModalState({ mode: 'edit', item })}
                  onDelete={() => archivePoolItem(item.id)}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-text-faint leading-snug">
              Long-press and drag onto the time grid to plan an activity.
            </p>
          </div>
        </div>
      </div>

      {focusMode && (
        <FocusMode
          blocks={memberBlocks}
          onClose={() => setFocusMode(false)}
          onToggleDone={(id) => { toggleBlockDone(id); }}
        />
      )}

      {modalState && (
        <ActivityModal
          initial={modalState.mode === 'edit' ? modalState.item : null}
          onClose={() => setModalState(null)}
          onSave={({ title, icon, duration }) => {
            if (modalState.mode === 'edit') {
              updatePoolItem(modalState.item.id, {
                title,
                icon,
                default_duration_min: duration,
              });
            } else {
              addPoolItem({
                member_id: activeMember.id,
                title,
                icon,
                default_duration_min: duration,
                usage_count: 0,
                archived: false,
              });
            }
          }}
        />
      )}
    </>
  );
}
