import { useCallback, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useVoiceCapture } from '@/hooks/useVoiceCapture';
import { useVoiceIntake } from '@/hooks/useVoiceIntake';
import { useToast } from '@/context/ToastContext';

/**
 * Mic button + listening overlay. Tap to start, tap again to stop early.
 * Auto-ends on silence (Web Speech API decides). The live transcript shows
 * in the overlay; once final, the transcript is dispatched to the intake
 * pipeline which fires its own toast on success or error.
 */
export function VoiceButton() {
  const { show } = useToast();
  const { dispatch } = useVoiceIntake();
  const [dispatching, setDispatching] = useState(false);

  const onFinal = useCallback(
    (text: string) => {
      setDispatching(true);
      void dispatch(text).finally(() => setDispatching(false));
    },
    [dispatch],
  );

  const onError = useCallback(
    (message: string) => {
      show({ message, duration: 4000 });
    },
    [show],
  );

  const { supported, status, transcript, start, stop } = useVoiceCapture({
    onFinal,
    onError,
  });

  if (!supported) {
    return (
      <button
        disabled
        className="p-2 rounded-full text-text-faint/50 cursor-not-allowed"
        title="Voice not supported on this device"
      >
        <MicOff size={20} />
      </button>
    );
  }

  const listening = status === 'listening';

  const handleClick = () => {
    if (listening) stop();
    else if (dispatching) return;
    else start();
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={
          'relative p-2 rounded-full transition-colors ' +
          (listening
            ? 'text-bg bg-accent shadow-md'
            : dispatching
              ? 'text-accent'
              : 'text-text-faint hover:text-accent hover:bg-surface-2')
        }
        title={listening ? 'Listening — tap to stop' : 'Voice command'}
        aria-pressed={listening}
      >
        <Mic size={20} />
        {listening && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bg opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-bg" />
          </span>
        )}
      </button>

      {(listening || dispatching) && (
        <ListeningOverlay
          transcript={transcript}
          processing={dispatching}
          onCancel={() => {
            if (listening) stop();
          }}
        />
      )}
    </>
  );
}

function ListeningOverlay({
  transcript,
  processing,
  onCancel,
}: {
  transcript: string;
  processing: boolean;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-[55] flex justify-center pointer-events-none"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className="pointer-events-auto bg-text text-bg rounded-full shadow-xl px-5 py-2.5 max-w-[90vw] flex items-center gap-3">
        <span className="flex h-2.5 w-2.5 relative">
          <span
            className={
              'relative inline-flex rounded-full h-2.5 w-2.5 ' +
              (processing ? 'bg-bg/60' : 'bg-bg')
            }
          />
          {!processing && (
            <span className="animate-ping absolute inset-0 inline-flex rounded-full bg-bg opacity-75" />
          )}
        </span>
        <span className="text-sm flex-1 truncate">
          {processing ? 'Thinking…' : transcript || 'Listening…'}
        </span>
        {!processing && (
          <button
            onClick={onCancel}
            className="text-sm opacity-60 hover:opacity-100"
            title="Cancel"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
