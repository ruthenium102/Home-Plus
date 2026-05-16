import { useCallback, useState } from 'react';

interface RowProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isOver: boolean;
}

/**
 * Tiny drag-to-reorder helper used by lists across the app (members, habits,
 * chores, todo lists, items within a todo list). Returns `getRowProps(id)`
 * which spreads onto the row's outer element along with `isDragging`/`isOver`
 * flags for styling. `onReorder` is called once on drop with the full new
 * order of IDs.
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

  const finish = useCallback(() => {
    setDragId(null);
    setOverId(null);
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragId || dragId === targetId) { finish(); return; }
      const ids = items.map((it) => it.id);
      const fromIdx = ids.indexOf(dragId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) { finish(); return; }
      const reordered = ids.slice();
      reordered.splice(fromIdx, 1);
      // Insert at the target's original index; this gives intuitive
      // before/after behaviour without exposing it to the caller.
      reordered.splice(toIdx, 0, dragId);
      onReorder(reordered);
      finish();
    },
    [items, dragId, onReorder, finish],
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
        if (overId !== id) setOverId(id);
      },
      onDragLeave: () => setOverId((cur) => (cur === id ? null : cur)),
      onDrop: handleDrop(id),
      onDragEnd: finish,
      isDragging: dragId === id,
      isOver: overId === id,
    }),
    [dragId, overId, handleDrop, finish],
  );

  return { getRowProps, isDraggingAny: dragId !== null };
}
