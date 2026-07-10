import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  /** Optional supporting copy under the title. */
  body?: ReactNode;
  /** Confirm button label. Defaults to "Delete". */
  confirmLabel?: string;
  /** Destructive styling on the confirm button (default true). */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// Branded replacement for window.confirm(): native WebView dialogs ignore the
// theme, can't be styled, and read as a different app. Callers keep their own
// "what am I confirming" state and render this instead.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={
        <div className="flex gap-2 ml-auto">
          <button onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={
              'px-4 py-2 text-sm font-medium rounded-md text-white hover:opacity-90 ' +
              (danger ? 'bg-danger-strong' : 'bg-accent-strong')
            }
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      {body ? <div className="text-sm text-text-muted leading-relaxed">{body}</div> : null}
    </Modal>
  );
}
