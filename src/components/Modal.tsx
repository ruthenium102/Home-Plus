import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type MaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Right-aligned header content (renders before the close X). */
  headerExtras?: ReactNode;
  /** Hides the default header entirely. */
  hideHeader?: boolean;
  /** Sticky footer slot. Padded with safe-area-inset-bottom on iOS. */
  footer?: ReactNode;
  maxWidth?: MaxWidth;
  children: ReactNode;
  /** Optional extra classes on the card surface. */
  className?: string;
}

const MAX_WIDTH_CLS: Record<MaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  headerExtras,
  hideHeader,
  footer,
  maxWidth = '2xl',
  children,
  className,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`card w-full ${MAX_WIDTH_CLS[maxWidth]} max-h-[85vh] flex flex-col ${className ?? ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {!hideHeader && (
          <div className="flex items-center justify-between gap-2 p-4 border-b border-border shrink-0">
            <h2 className="font-display text-xl text-text truncate">{title}</h2>
            <div className="flex items-center gap-1 shrink-0">
              {headerExtras}
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="p-4 space-y-4 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div
            className="flex items-center justify-between gap-2 p-4 border-t border-border shrink-0 bg-surface"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
