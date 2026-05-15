import { useEffect, useState } from 'react';

interface Props {
  /** A unique key per message; changing this re-shows the bubble. */
  messageKey: number;
  text: string | null;
  /** ms to show before fading out. */
  duration?: number;
}

/**
 * A floating speech bubble that pops in above the pet, holds, then fades out.
 * Re-show by changing `messageKey` (and providing the text again).
 */
export function SpeechBubble({ messageKey, text, duration = 2000 }: Props) {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');

  useEffect(() => {
    if (!text) return;
    setPhase('in');
    const t1 = setTimeout(() => setPhase('out'), duration);
    const t2 = setTimeout(() => setPhase('hidden'), duration + 250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [messageKey, text, duration]);

  if (phase === 'hidden' || !text) return null;

  return (
    <div
      className={
        'absolute left-1/2 -translate-x-1/2 -top-4 pointer-events-none z-20 ' +
        (phase === 'in' ? 'bubble-in' : 'bubble-out')
      }
      style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.12))' }}
      aria-hidden
    >
      <div className="relative px-3 py-1.5 rounded-2xl border bg-surface text-text text-sm font-medium whitespace-nowrap"
        style={{ borderColor: 'rgb(var(--border))' }}>
        {text}
        {/* Tail */}
        <svg viewBox="0 0 20 12" className="absolute left-1/2 -translate-x-1/2 -bottom-[10px]"
          width="20" height="12" aria-hidden>
          <path d="M 0 0 L 20 0 L 10 11 Z" fill="rgb(var(--surface))" stroke="rgb(var(--border))" strokeWidth="1" />
          <path d="M 1 0 L 19 0 L 10 10 Z" fill="rgb(var(--surface))" />
        </svg>
      </div>
    </div>
  );
}
