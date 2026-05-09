import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  Check,
  GripVertical,
  ChevronDown,
  Maximize2,
  Minimize2,
  Trash2,
  Circle,
  BookOpen,
  Music,
  Pencil,
  TreePine,
  Gamepad2,
  Bike,
  Heart,
  Star,
  Dumbbell,
  Brush,
  Coffee,
  Apple,
  type LucideIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { useFamily } from '@/context/FamilyContext';
import { localISO } from '@/lib/dates';
import {
  SECTION_LABELS,
  SECTION_TIME_RANGE,
  blocksForMemberDate,
  formatDuration,
  nextPosition,
  sectionForHour,
  sortedSectionBlocks
} from '@/lib/dayplan';
import type { ActivityPoolItem, DayPlanBlock, DayPlanSection } from '@/types';

// ---- Icon resolver -------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Circle, BookOpen, Music, Pencil, TreePine, Gamepad2,
  Bike, Heart, Star, Dumbbell, Brush, Coffee, Apple
};

function resolveIcon(name: string | null): LucideIcon {
  if (!name) return Circle;
  return ICON_MAP[name] ?? Circle;
}

// ---- Now indicator -------------------------------------------------------

function NowIndicator() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
      <span className="text-xs font-medium text-red-500">{format(time, 'h:mm a')}</span>
      <div className="flex-1 h-px bg-red-400/40" />
    </div>
  );
}

// ---- Focus mode overlay --------------------------------------------------

interface FocusModeProps {
  blocks: DayPlanBlock[];
  onClose: () => void;
  onToggleDone: (id: string) => void;
}

function FocusMode({ blocks, onClose, onToggleDone }: FocusModeProps) {
  const now = new Date();
  const section = sectionForHour(now.getHours());
  const sectionBlocks = sortedSectionBlocks(blocks, section);
  const undone = sectionBlocks.filter((b) => !b.done);
  const current = undone[0] ?? sectionBlocks[0] ?? null;
  const next = undone[1] ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={onClose}>
      <div className="flex-1 flex flex-col items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs uppercase tracking-widest text-text-faint mb-8">
          {SECTION_LABELS[section]} · {format(now, 'h:mm a')}
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
            <div className="text-text-faint mt-2">Nothing left for this part of the day.</div>
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

// ---- Block card ----------------------------------------------------------

interface BlockCardProps {
  block: DayPlanBlock;
  onToggleDone: () => void;
  onRemove: () => void;
  onResize: (newDuration: number) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}

function BlockCard({ block, onToggleDone, onRemove, onResize, dragHandleProps }: BlockCardProps) {
  const resizeRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startDur = useRef(block.duration_min);
  const [hovered, setHovered] = useState(false);
  const Icon = resolveIcon(block.icon);

  const handleResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current?.setPointerCapture(e.pointerId);
      startY.current = e.clientY;
      startDur.current = block.duration_min;
    },
    [block.duration_min]
  );

  const handleResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current?.hasPointerCapture(e.pointerId)) return;
      const delta = e.clientY - startY.current;
      const addMin = Math.round(delta / 2 / 5) * 5;
      const newDur = Math.max(5, Math.min(240, startDur.current + addMin));
      onResize(newDur);
    },
    [onResize]
  );

  const handleResizeUp = useCallback(
    (e: React.PointerEvent) => {
      resizeRef.current?.releasePointerCapture(e.pointerId);
    },
    []
  );

  const minHeight = Math.max(56, block.duration_min * 1.2);

  return (
    <div
      className={
        'relative rounded-lg border transition-all group ' +
        (block.done
          ? 'bg-surface border-border opacity-60'
          : 'bg-surface-2 border-border hover:border-accent/40')
      }
      style={{ minHeight }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-2 p-3">
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-text-faint/40 hover:text-text-faint shrink-0 touch-none"
        >
          <GripVertical size={16} />
        </div>

        {/* Done toggle */}
        <button
          onClick={onToggleDone}
          className={
            'mt-0.5 shrink-0 rounded-full border-2 w-5 h-5 flex items-center justify-center transition-colors ' +
            (block.done
              ? 'bg-accent border-accent text-white'
              : 'border-border hover:border-accent')
          }
        >
          {block.done && <Check size={11} strokeWidth={3} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Icon size={14} className="text-accent shrink-0" />
            <span className={
              'text-sm font-medium truncate ' +
              (block.done ? 'line-through text-text-muted' : 'text-text')
            }>
              {block.title}
            </span>
          </div>
          <div className="text-xs text-text-faint">{formatDuration(block.duration_min)}</div>
        </div>

        {/* Delete button */}
        {(hovered || block.done) && (
          <button
            onClick={onRemove}
            className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-text-faint/40 hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Resize handle */}
      <div
        ref={resizeRef}
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center group/resize touch-none"
        title="Drag to resize"
      >
        <div className="w-8 h-0.5 rounded-full bg-border group-hover/resize:bg-accent/50 transition-colors" />
      </div>
    </div>
  );
}

// ---- Day section ---------------------------------------------------------

interface DaySectionProps {
  section: DayPlanSection;
  blocks: DayPlanBlock[];
  isCurrentSection: boolean;
  onDropPoolItem: (poolItemId: string, section: DayPlanSection) => void;
  onDropBlock: (blockId: string, targetSection: DayPlanSection, targetPosition: number) => void;
  onToggleDone: (id: string) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, dur: number) => void;
}

function DaySection({
  section,
  blocks,
  isCurrentSection,
  onDropPoolItem,
  onDropBlock,
  onToggleDone,
  onRemove,
  onResize
}: DaySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const sorted = sortedSectionBlocks(blocks, section);
  const doneCount = sorted.filter((b) => b.done).length;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDrop = (e: React.DragEvent, targetPos?: number) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { type: 'pool'; id: string } | { type: 'block'; id: string };
      if (data.type === 'pool') {
        onDropPoolItem(data.id, section);
      } else if (data.type === 'block') {
        onDropBlock(data.id, section, targetPos ?? nextPosition(blocks, section));
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="card overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-display text-base text-text">{SECTION_LABELS[section]}</span>
          <span className="text-xs text-text-faint">{SECTION_TIME_RANGE[section]}</span>
          {isCurrentSection && (
            <span className="text-[10px] uppercase tracking-wider bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full font-semibold">
              now
            </span>
          )}
          {doneCount > 0 && (
            <span className="text-[10px] text-text-faint">
              {doneCount}/{sorted.length} done
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={'text-text-faint transition-transform ' + (collapsed ? '-rotate-90' : '')}
        />
      </button>

      {!collapsed && (
        <div
          className={
            'px-3 pb-3 space-y-2 min-h-[60px] transition-colors ' +
            (dragOver ? 'bg-accent/5' : '')
          }
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => handleDrop(e)}
        >
          {isCurrentSection && sorted.length > 0 && <NowIndicator />}

          {sorted.map((block, idx) => (
            <div
              key={block.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'block', id: block.id }));
              }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.stopPropagation(); handleDrop(e, idx); }}
            >
              <BlockCard
                block={block}
                onToggleDone={() => onToggleDone(block.id)}
                onRemove={() => onRemove(block.id)}
                onResize={(dur) => onResize(block.id, dur)}
                dragHandleProps={{
                  draggable: false,
                  onDragStart: (e) => e.stopPropagation()
                }}
              />
            </div>
          ))}

          {sorted.length === 0 && (
            <div className={
              'flex items-center justify-center h-14 rounded-lg border-2 border-dashed text-xs text-text-faint transition-colors ' +
              (dragOver ? 'border-accent/50 bg-accent/5' : 'border-border')
            }>
              Drop activities here
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Pool item chip -------------------------------------------------------

interface PoolItemProps {
  item: ActivityPoolItem;
  onAdd: (section: DayPlanSection) => void;
  onArchive: () => void;
}

function PoolItemChip({ item, onAdd, onArchive }: PoolItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = resolveIcon(item.icon);
  const currentSection = sectionForHour(new Date().getHours());

  return (
    <div
      className="relative flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface-2 border border-border hover:border-accent/40 cursor-grab active:cursor-grabbing group"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'pool', id: item.id }));
      }}
    >
      <Icon size={14} className="text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text truncate">{item.title}</div>
        <div className="text-[10px] text-text-faint">{formatDuration(item.default_duration_min)}</div>
      </div>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-faint/40 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Plus size={13} />
      </button>

      {menuOpen && (
        <div className="absolute left-0 top-full mt-1 z-30 card overflow-hidden shadow-lg border border-border w-36">
          {(['morning', 'afternoon', 'evening'] as DayPlanSection[]).map((s) => (
            <button
              key={s}
              onClick={() => { onAdd(s); setMenuOpen(false); }}
              className={
                'w-full text-left px-3 py-2 text-xs text-text hover:bg-surface-2 flex items-center gap-2 ' +
                (s === currentSection ? 'font-semibold' : '')
              }
            >
              {s === currentSection && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
              {SECTION_LABELS[s]}
            </button>
          ))}
          <div className="border-t border-border">
            <button
              onClick={() => { onArchive(); setMenuOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-text-muted hover:bg-surface-2"
            >
              Remove from pool
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Add pool item modal --------------------------------------------------

interface AddPoolModalProps {
  memberId: string;
  onAdd: (item: Omit<ActivityPoolItem, 'id' | 'created_at' | 'family_id'>) => void;
  onClose: () => void;
}

function AddPoolModal({ memberId, onAdd, onClose }: AddPoolModalProps) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(20);
  const [icon, setIcon] = useState('Circle');

  const QUICK_ICONS = [
    'BookOpen', 'Music', 'Pencil', 'TreePine', 'Gamepad2', 'Bike',
    'Heart', 'Star', 'Dumbbell', 'Brush', 'Coffee', 'Apple'
  ];

  const handleSave = () => {
    if (!title.trim()) return;
    onAdd({
      member_id: memberId,
      title: title.trim(),
      icon,
      default_duration_min: duration,
      usage_count: 0,
      archived: false
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-lg text-text">Add activity</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text">
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
                min={5}
                max={120}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="text-sm text-text w-12 text-right">{formatDuration(duration)}</span>
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
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main page -----------------------------------------------------------

export function MyDayPage() {
  const {
    activeMember,
    dayPlanBlocks,
    activityPool,
    addDayPlanBlock,
    updateDayPlanBlock,
    removeDayPlanBlock,
    reorderDayPlanBlocks,
    toggleBlockDone,
    addPoolItem,
    archivePoolItem
  } = useFamily();

  const [focusMode, setFocusMode] = useState(false);
  const [addPoolOpen, setAddPoolOpen] = useState(false);

  const today = localISO();
  const now = new Date();
  const currentSection = sectionForHour(now.getHours());

  if (!activeMember) return null;

  const memberBlocks = blocksForMemberDate(dayPlanBlocks, activeMember.id, today);
  const memberPool = activityPool
    .filter((ap) => ap.member_id === activeMember.id && !ap.archived)
    .sort((a, b) => b.usage_count - a.usage_count);

  const sections: DayPlanSection[] = ['morning', 'afternoon', 'evening'];

  const handleDropPoolItem = (poolItemId: string, section: DayPlanSection) => {
    const item = memberPool.find((p) => p.id === poolItemId);
    if (!item) return;
    addDayPlanBlock({
      member_id: activeMember.id,
      date: today,
      section,
      source: 'other',
      source_id: poolItemId,
      title: item.title,
      icon: item.icon,
      duration_min: item.default_duration_min,
      position: nextPosition(memberBlocks, section),
      done: false,
      done_at: null
    });
  };

  const handleDropBlock = (blockId: string, targetSection: DayPlanSection, targetPosition: number) => {
    const block = memberBlocks.find((b) => b.id === blockId);
    if (!block) return;

    if (block.section === targetSection) {
      // Reorder within section
      const sectionBlocks = sortedSectionBlocks(memberBlocks, targetSection);
      const without = sectionBlocks.filter((b) => b.id !== blockId);
      without.splice(targetPosition, 0, block);
      reorderDayPlanBlocks(
        without.map((b, i) => ({ id: b.id, position: i, section: targetSection }))
      );
    } else {
      // Move to different section
      const updates: { id: string; position: number; section: DayPlanSection }[] = [
        { id: blockId, position: nextPosition(memberBlocks.filter((b) => b.section === targetSection), targetSection), section: targetSection }
      ];
      reorderDayPlanBlocks(updates);
    }
  };

  const totalDone = memberBlocks.filter((b) => b.done).length;
  const total = memberBlocks.length;

  return (
    <>
      <div className="flex gap-4 max-w-5xl">
        {/* Activity pool sidebar — desktop only */}
        <aside className="hidden lg:flex flex-col w-48 shrink-0 gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Activities</span>
            <button
              onClick={() => setAddPoolOpen(true)}
              className="w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-accent hover:bg-accent/10 transition-colors"
              title="Add activity"
            >
              <Plus size={14} />
            </button>
          </div>
          {memberPool.length === 0 && (
            <div className="text-xs text-text-faint text-center py-4">
              No activities yet.{' '}
              <button onClick={() => setAddPoolOpen(true)} className="text-accent underline">
                Add one
              </button>
            </div>
          )}
          {memberPool.map((item) => (
            <PoolItemChip
              key={item.id}
              item={item}
              onAdd={(section) => handleDropPoolItem(item.id, section)}
              onArchive={() => archivePoolItem(item.id)}
            />
          ))}
        </aside>

        {/* Timeline */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl text-text">{activeMember.name}'s Day</h2>
              <div className="text-xs text-text-faint">{format(now, 'EEEE, d MMM')}</div>
            </div>
            <div className="flex items-center gap-2">
              {total > 0 && (
                <span className="text-xs text-text-faint">{totalDone}/{total} done</span>
              )}
              {/* Mobile add button */}
              <button
                onClick={() => setAddPoolOpen(true)}
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

          {/* Sections */}
          {sections.map((section) => (
            <DaySection
              key={section}
              section={section}
              blocks={memberBlocks.filter((b) => b.section === section)}
              isCurrentSection={section === currentSection}
              onDropPoolItem={handleDropPoolItem}
              onDropBlock={handleDropBlock}
              onToggleDone={toggleBlockDone}
              onRemove={removeDayPlanBlock}
              onResize={(id, dur) => updateDayPlanBlock(id, { duration_min: dur })}
            />
          ))}
        </div>
      </div>

      {focusMode && (
        <FocusMode
          blocks={memberBlocks}
          onClose={() => setFocusMode(false)}
          onToggleDone={(id) => { toggleBlockDone(id); }}
        />
      )}

      {addPoolOpen && (
        <AddPoolModal
          memberId={activeMember.id}
          onAdd={addPoolItem}
          onClose={() => setAddPoolOpen(false)}
        />
      )}
    </>
  );
}
