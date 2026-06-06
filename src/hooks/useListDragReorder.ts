import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticLight, hapticMedium } from '@/lib/native';
import { createEdgeAutoScroller } from '@/lib/dragAutoScroll';

type DropEdge = 'top' | 'bottom' | null;

/**
 * Props for the drag handle (the grip dots). The handle — not the whole row —
 * initiates the pointer drag, so a press on the row body still scrolls/taps
 * normally and never starts a text selection. `touch-action: none` keeps the
 * browser from stealing the gesture for scrolling, and the select/callout
 * suppressions stop the iOS long-press text selection + magnifier.
 */
export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
}

interface RowProps {
  /** Data attribute used by the pointer-move logic to identify hover targets. */
  'data-dnd-id': string;
  /** Spread onto the <DragHandle/> — this is what starts a pointer drag. */
  handleProps: DragHandleProps;
  /** Keyboard reorder: space/enter to pick up, arrows to move, esc/space to drop. */
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Drops a keyboard "pick up" if focus leaves the row entirely. */
  onBlur: (e: React.FocusEvent) => void;
  /** Makes the row focusable so keyboard reordering is reachable via Tab. */
  tabIndex: number;
  'aria-roledescription': string;
  isDragging: boolean;
  /** True when the dragged item is hovering this row (legacy — prefer dropEdge). */
  isOver: boolean;
  /** Which edge of this row the dragged item will land on — render a line there. */
  dropEdge: DropEdge;
  style?: React.CSSProperties;
}

/**
 * Drag-to-reorder helper used by lists across the app (members, habits,
 * chores, todo lists, items within a todo list). Returns `getRowProps(id)`
 * which spreads onto the row's outer element along with `isDragging`/`isOver`/
 * `dropEdge` flags for styling. `onReorder` is called once on drop with the
 * full new order of IDs.
 *
 * Uses Pointer Events (not HTML5 DnD) so it works on iOS touch as well as
 * desktop mouse — HTML5 drag-and-drop is effectively non-functional on touch.
 * A small movement threshold prevents accidental drags on tap.
 *
 * Sets `touch-action: none` on dragging rows so the browser doesn't try to
 * scroll while a drag is in progress.
 */
export function useListDragReorder<T extends { id: string }>(
  items: T[],
  onReorder: (orderedIds: string[]) => void,
): { getRowProps: (id: string) => RowProps; isDraggingAny: boolean } {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overEdge, setOverEdge] = useState<DropEdge>(null);
  // Keyboard reorder: the id currently "picked up" via the keyboard, if any.
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  // One auto-scroller for the hook; pointer drags reuse it across gestures.
  const autoScrollRef = useRef(createEdgeAutoScroller());
  // Latest hover state held in refs so the up-handler can read without
  // closing over stale React state.
  const overRef = useRef<{ id: string | null; edge: DropEdge }>({ id: null, edge: null });
  // Movement threshold in pixels — below this we don't start a drag, so a
  // plain tap on the row still works to open editors etc.
  const THRESHOLD = 6;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const finish = useCallback(() => {
    setDragId(null);
    setOverId(null);
    setOverEdge(null);
    overRef.current = { id: null, edge: null };
  }, []);

  // Find the row id under a given clientY by scanning data-dnd-id elements
  // in the document. Cheap enough for short lists; called only during drag.
  const findRowAt = useCallback((clientX: number, clientY: number) => {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const row = (el as HTMLElement).closest?.('[data-dnd-id]') as HTMLElement | null;
      if (row) {
        const id = row.dataset.dndId ?? null;
        const rect = row.getBoundingClientRect();
        const edge: DropEdge = clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
        return { id, edge };
      }
    }
    return { id: null, edge: null as DropEdge };
  }, []);

  const onPointerDown = useCallback(
    (id: string) => (e: React.PointerEvent) => {
      // Only primary button / single-touch
      if (e.button !== undefined && e.button !== 0) return;
      // Don't fight inner interactive elements (button/input/textarea/a). Their
      // own onClick/onChange handles the gesture; if we install pointer
      // listeners here the iOS browser can delay or swallow the click, which
      // shows up as "needs two taps". Drag still works when the user grabs
      // anywhere non-interactive on the row.
      const evTarget = e.target as HTMLElement | null;
      if (evTarget && evTarget.closest('button, a, input, textarea, select, [contenteditable]')) {
        return;
      }
      const target = e.currentTarget as HTMLElement;
      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;
      const pointerId = e.pointerId;

      const move = (ev: PointerEvent) => {
        if (!started) {
          if (Math.abs(ev.clientY - startY) < THRESHOLD && Math.abs(ev.clientX - startX) < THRESHOLD)
            return;
          started = true;
          // Light pickup tap — iOS users expect a tactile cue when a drag
          // lifts off, matching native list reordering.
          void hapticLight();
          // Now own the gesture — prevents scrolling and stray clicks.
          try {
            target.setPointerCapture(pointerId);
          } catch {
            /* ignore */
          }
          // A pointer drag supersedes any pending keyboard "pick up".
          setGrabbedId(null);
          setDragId(id);
        }
        // Drive edge auto-scroll so off-screen drop targets are reachable on
        // long lists (the pointer is captured + touch-action:none, so native
        // scroll is suppressed during the drag).
        autoScrollRef.current.update(ev.clientX, ev.clientY);
        const hit = findRowAt(ev.clientX, ev.clientY);
        // Don't track hover when over the dragged item itself.
        const nextId = hit.id && hit.id !== id ? hit.id : null;
        const nextEdge = nextId ? hit.edge : null;
        overRef.current = { id: nextId, edge: nextEdge };
        setOverId((cur) => (cur === nextId ? cur : nextId));
        setOverEdge((cur) => (cur === nextEdge ? cur : nextEdge));
        ev.preventDefault();
      };

      const cleanup = () => {
        autoScrollRef.current.stop();
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', cancel);
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      };

      const up = () => {
        cleanup();
        if (!started) {
          finish();
          return;
        }
        const { id: targetId, edge } = overRef.current;
        if (!targetId || targetId === id) {
          finish();
          return;
        }
        const ids = itemsRef.current.map((it) => it.id);
        const fromIdx = ids.indexOf(id);
        const toIdx = ids.indexOf(targetId);
        if (fromIdx < 0 || toIdx < 0) {
          finish();
          return;
        }
        const reordered = ids.slice();
        reordered.splice(fromIdx, 1);
        // After removing dragId, the target's index shifts down by 1 if it
        // came after; recompute, then insert before/after based on edge.
        const shiftedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
        const insertIdx = edge === 'bottom' ? shiftedToIdx + 1 : shiftedToIdx;
        reordered.splice(insertIdx, 0, id);
        void hapticMedium();
        onReorder(reordered);
        finish();
      };
      const cancel = () => {
        cleanup();
        finish();
      };

      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', cancel);
    },
    [findRowAt, onReorder, finish],
  );

  // Keyboard reorder (accessibility): space/enter picks the focused row up,
  // arrow keys move it one slot at a time, space/enter or escape drops it.
  // Mirrors the pointer path's persistence — onReorder gets the full new order.
  const moveByKeyboard = useCallback(
    (id: string, dir: -1 | 1) => {
      const ids = itemsRef.current.map((it) => it.id);
      const from = ids.indexOf(id);
      if (from < 0) return;
      const to = from + dir;
      if (to < 0 || to >= ids.length) return;
      const reordered = ids.slice();
      reordered.splice(from, 1);
      reordered.splice(to, 0, id);
      void hapticLight();
      onReorder(reordered);
    },
    [onReorder],
  );

  const onKeyDown = useCallback(
    (id: string) => (e: React.KeyboardEvent) => {
      // Leave inner controls (buttons, inputs, links) to their own handlers.
      const evTarget = e.target as HTMLElement | null;
      if (
        evTarget &&
        evTarget !== e.currentTarget &&
        evTarget.closest('button, a, input, textarea, select, [contenteditable]')
      ) {
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setGrabbedId((cur) => {
          if (cur === id) {
            void hapticMedium();
            return null;
          }
          void hapticLight();
          return id;
        });
        return;
      }
      if (grabbedId !== id) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveByKeyboard(id, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveByKeyboard(id, 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setGrabbedId(null);
      }
    },
    [grabbedId, moveByKeyboard],
  );

  // Belt-and-braces — if the document loses pointer events somehow (e.g.
  // visibility change mid-drag), clear state on the next escape press.
  useEffect(() => {
    if (!dragId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dragId, finish]);

  const getRowProps = useCallback(
    (id: string): RowProps => ({
      'data-dnd-id': id,
      handleProps: {
        onPointerDown: onPointerDown(id),
        style: {
          // Don't let the browser claim the gesture for scrolling, and never
          // let a press on the handle start a text selection / iOS callout.
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          cursor: dragId === id ? 'grabbing' : 'grab',
        },
      },
      onKeyDown: onKeyDown(id),
      onBlur: (e: React.FocusEvent) => {
        // Only clear when focus truly leaves the row (not moving to a child).
        const next = e.relatedTarget as Node | null;
        if (grabbedId === id && (!next || !e.currentTarget.contains(next))) {
          setGrabbedId(null);
        }
      },
      tabIndex: 0,
      'aria-roledescription':
        'Sortable item. Press space to pick up, arrow keys to move, space to drop.',
      // Treat a keyboard "pick up" exactly like a pointer drag for styling so
      // the lift + memo invalidation fire the same way.
      isDragging: dragId === id || grabbedId === id,
      isOver: overId === id,
      dropEdge: overId === id ? overEdge : null,
      // While dragging this row: block native scroll, and give it a
      // compositor-only "grabbed" lift (scale + shadow + raised z), the way
      // native iOS list reordering picks a row up. Transition is transform/
      // shadow only (never layout), so it stays on the compositor at 60fps.
      // Consumers no longer fade the row to opacity-40 — the lift + the
      // drop-edge line communicate the drag instead.
      style:
        dragId === id || grabbedId === id
          ? {
              touchAction: 'none',
              transform: 'scale(1.02)',
              boxShadow: '0 10px 24px -8px rgb(0 0 0 / 0.28)',
              position: 'relative',
              zIndex: 20,
              transition: 'transform 140ms cubic-bezier(0.16,1,0.3,1), box-shadow 140ms ease-out',
            }
          : undefined,
    }),
    [dragId, grabbedId, overId, overEdge, onPointerDown, onKeyDown],
  );

  return { getRowProps, isDraggingAny: dragId !== null || grabbedId !== null };
}
