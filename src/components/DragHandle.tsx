import { GripVertical } from 'lucide-react';

/**
 * Standardised grip-handle affordance used on draggable list rows.
 * Visual only — the row itself is draggable so the user can grab anywhere,
 * but this gives the consistent vertical-lines hint on the LHS.
 */
export function DragHandle({ className = '' }: { className?: string }) {
  return (
    <span
      className={'shrink-0 text-text-faint/40 cursor-grab active:cursor-grabbing select-none ' + className}
      aria-hidden
    >
      <GripVertical size={14} />
    </span>
  );
}
