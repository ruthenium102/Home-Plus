import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  onDelete: () => void;
  /**
   * 'partial' = swipe reveals red Delete button, tap to confirm (kids).
   * 'full'    = swipe past threshold commits delete on release (parents).
   */
  mode?: 'partial' | 'full';
  /** Custom label for the action */
  label?: string;
  /** Disable swiping for this row */
  disabled?: boolean;
}

const REVEAL_WIDTH = 88; // width of the red action panel
const COMMIT_THRESHOLD = 0.55; // fraction of width past which a full-swipe deletes

export function SwipeableRow({
  children,
  onDelete,
  mode = 'partial',
  label = 'Delete',
  disabled = false
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const startTranslateRef = useRef(0);
  const [translate, setTranslate] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Reset to closed when disabled
  useEffect(() => {
    if (disabled) {
      setTranslate(0);
    }
  }, [disabled]);

  const closeRow = () => {
    setAnimating(true);
    setTranslate(0);
    setTimeout(() => setAnimating(false), 200);
  };

  const openRow = () => {
    setAnimating(true);
    setTranslate(-REVEAL_WIDTH);
    setTimeout(() => setAnimating(false), 200);
  };

  const commitDelete = () => {
    setCommitting(true);
    const width = containerRef.current?.offsetWidth ?? 400;
    setAnimating(true);
    setTranslate(-width);
    setTimeout(() => {
      onDelete();
      // After delete, parent should unmount this row. If not, reset.
      setCommitting(false);
      setTranslate(0);
      setAnimating(false);
    }, 180);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || committing) return;
    // Don't start a swipe on a click that's clearly going to be a button tap
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-swipe]')) return;

    startXRef.current = e.clientX;
    startTranslateRef.current = translate;
    setAnimating(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    let next = startTranslateRef.current + dx;
    // Constrain: only left swipe; clamp at -width
    const width = containerRef.current?.offsetWidth ?? 400;
    if (next > 0) next = 0;
    if (next < -width) next = -width;
    setTranslate(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    const width = containerRef.current?.offsetWidth ?? 400;
    startXRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    // If movement was small, treat as tap — close any open row
    if (Math.abs(dx) < 8) {
      if (translate < 0) closeRow();
      return;
    }

    if (mode === 'full') {
      // Past threshold? commit delete
      const fraction = Math.abs(translate) / width;
      if (fraction > COMMIT_THRESHOLD) {
        commitDelete();
        return;
      }
      // Otherwise close
      closeRow();
      return;
    }

    // Partial mode: snap open if past halfway of REVEAL, else close
    if (Math.abs(translate) > REVEAL_WIDTH / 2) {
      openRow();
    } else {
      closeRow();
    }
  };

  // Tap outside the row should close it (only relevant in partial mode)
  useEffect(() => {
    if (translate === 0) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        closeRow();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [translate]);

  const isFullSwipeActive =
    mode === 'full' && Math.abs(translate) / (containerRef.current?.offsetWidth ?? 400) > COMMIT_THRESHOLD;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden touch-pan-y"
      style={{ touchAction: 'pan-y' }}
    >
      {/* Red action panel behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 pointer-events-none"
        style={{
          background: isFullSwipeActive
            ? 'rgb(var(--accent))'
            : 'rgb(var(--accent))',
          width: '100%',
          transition: 'background 150ms'
        }}
      >
        {mode === 'partial' ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              commitDelete();
            }}
            data-no-swipe
            className="pointer-events-auto flex flex-col items-center justify-center text-white px-4 py-2 hover:opacity-80 transition-opacity"
            style={{ width: REVEAL_WIDTH }}
            disabled={disabled}
          >
            <Trash2 size={18} />
            <span className="text-[10px] uppercase tracking-wider mt-1 font-medium">
              {label}
            </span>
          </button>
        ) : (
          <div className="flex flex-col items-center text-white pr-2">
            <Trash2 size={20} />
            <span className="text-[10px] uppercase tracking-wider mt-1 font-medium">
              {isFullSwipeActive ? 'Release to ' + label.toLowerCase() : label}
            </span>
          </div>
        )}
      </div>

      {/* Foreground content slides over */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${translate}px)`,
          transition: animating ? 'transform 180ms ease-out' : 'none',
          // background needs to be opaque so the red panel stays hidden
          background: 'rgb(var(--surface))',
          position: 'relative',
          zIndex: 1
        }}
      >
        {children}
      </div>
    </div>
  );
}
