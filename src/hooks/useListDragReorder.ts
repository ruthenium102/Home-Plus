import { useCallback, useState } from 'react';

type DropEdge = 'top' | 'bottom' | null;

interface RowProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  /** True when the dragged item is hovering this row (legacy — prefer dropEdge). */
  isOver: boolean;
  /** Which edge of this row the dragged item will land on — render a line there. */
  dropEdge: DropEdge;
}

/**
 * Tiny drag-to-reorder helper used by lists across the app (members, habits,
 * chores, todo lists, items within a todo list). Returns `getRowProps(id)`
 * which spreads onto the row's outer element along with `isDragging`/`isOver`/
 * `dropEdge` flags for styling. `onReorder` is called once on drop with the
 * full new order of IDs.
 *
 * The drop edge is computed from cursor Y relative to the row's mid-line so
 * the indicator shows exactly where the item will land (before or after).
 *
 * HTML5 drag-and-drop semantics: works on desktop and recent iOS Safari.
 * No touch-fallback library — keep it dependency-free.
 */
export function useListDragReorder<T extends { id: string }>(
  items: T[],
  onReorder: (orderedIds: string[]) => void,
): { getRowProps: (id: string) => RowProps; isDraggingAny: boolean } {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overEdge, setOverEdge] = useState<DropEdge>(null);

  const finish = useCallback(() => {
    setDragId(null);
    setOverId(null);
    setOverEdge(null);
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const edge = overEdge;
      if (!dragId || dragId === targetId) { finish(); return; }
      const ids = items.map((it) => it.id);
      const fromIdx = ids.indexOf(dragId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) { finish(); return; }
      const reordered = ids.slice();
      reordered.splice(fromIdx, 1);
      // Insert before or after the target based on which edge the cursor is on.
      // toIdx is the target's index in the original list; after removing the
      // dragged item, that index still points to the target if fromIdx > toIdx,
      // or shifts down by one if fromIdx < toIdx.
      const shiftedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      const insertIdx = edge === 'bottom' ? shiftedToIdx + 1 : shiftedToIdx;
      reordered.splice(insertIdx, 0, dragId);
      onReorder(reordered);
      finish();
    },
    [items, dragId, onReorder, finish, overEdge],
  );

  const getRowProps = useCallback(
    (id: string): RowProps => ({
      draggable: true,
      onDragStart: (e) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      },
      onDragOver: (e) => {
        if (!dragId || dragId === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const edge: DropEdge = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
        if (overId !== id) setOverId(id);
        if (overEdge !== edge) setOverEdge(edge);
      },
      onDragLeave: () => {
        setOverId((cur) => (cur === id ? null : cur));
      },
      onDrop: handleDrop(id),
      onDragEnd: finish,
      isDragging: dragId === id,
      isOver: overId === id,
      dropEdge: overId === id ? overEdge : null,
    }),
    [dragId, overId, overEdge, handleDrop, finish],
  );

  return { getRowProps, isDraggingAny: dragId !== null };
}
