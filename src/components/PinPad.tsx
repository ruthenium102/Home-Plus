import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';

interface Props {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string | null;
  onCancel?: () => void;
  prompt?: string;
}

export function PinPad({ length = 4, onComplete, error, onCancel, prompt }: Props) {
  const [pin, setPin] = useState('');

  // Reset on error so user can retry
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setPin(''), 600);
      return () => clearTimeout(t);
    }
  }, [error]);

  const press = (digit: string) => {
    if (pin.length >= length) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === length) {
      // Defer slightly so the dot animation is visible
      setTimeout(() => onComplete(next), 120);
    }
  };

  const back = () => setPin(pin.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-8 select-none">
      {prompt && <div className="text-text-muted text-base">{prompt}</div>}

      {/* Dots */}
      <div className="flex gap-4" aria-live="polite">
        {Array.from({ length }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className={
                'w-4 h-4 rounded-full border-2 transition-colors ' +
                (filled
                  ? 'bg-accent border-accent pin-dot-fill'
                  : 'bg-transparent border-border-strong')
              }
            />
          );
        })}
      </div>

      {error && <div className="text-accent text-sm font-medium">{error}</div>}

      {/* Pad */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <PinButton key={n} onPress={() => press(String(n))}>
            {n}
          </PinButton>
        ))}
        <PinButton onPress={onCancel || (() => {})} variant="muted">
          {onCancel ? 'Cancel' : ''}
        </PinButton>
        <PinButton onPress={() => press('0')}>0</PinButton>
        <PinButton onPress={back} variant="muted" aria-label="Delete">
          <Delete size={22} />
        </PinButton>
      </div>
    </div>
  );
}

function PinButton({
  children,
  onPress,
  variant = 'normal',
  ...rest
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'normal' | 'muted';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onPress}
      className={
        'w-20 h-20 rounded-full text-2xl font-medium flex items-center justify-center transition-all active:scale-90 ' +
        (variant === 'muted'
          ? 'text-text-muted text-sm hover:bg-surface-2'
          : 'bg-surface border border-border hover:bg-surface-2 text-text')
      }
      {...rest}
    >
      {children}
    </button>
  );
}
