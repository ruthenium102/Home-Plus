import { GripVertical } from 'lucide-react';
import type { DragHandleProps } from '@/hooks/useListDragReorder';

/**
 * Standardised grip-handle affordance used on draggable list rows. This is the
 * drag initiator: spread `handleProps` from `useListDragReorder().getRowProps`
 * onto it so the pointer drag starts here (not on the whole row), which keeps
 * row taps/scroll working and stops press-and-hold from selecting text.
 * Press space/arrows on the focused row for the keyboard path.
 */
export function DragHandle({
  className = '',
  handleProps,
}: {
  className?: string;
  /** From getRowProps(id).handleProps. Omit for a purely decorative handle. */
  handleProps?: DragHandleProps;
}) {
  return (
    <span
      {...(handleProps
        ? { onPointerDown: handleProps.onPointerDown, style: handleProps.style }
        : {})}
      className={
        // -m-1 p-1 enlarges the touch target around the small grip glyph so
        // "grab near the dots" is forgiving, without shifting layout.
        'shrink-0 -m-1 p-1 text-text-faint/40 cursor-grab active:cursor-grabbing select-none ' +
        'opacity-50 hover:opacity-100 transition-opacity touch-none ' +
        className
      }
      aria-hidden
    >
      <GripVertical size={14} />
    </span>
  );
}
