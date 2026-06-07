import { useState } from 'react';
import { Users } from 'lucide-react';
import { useFamily, FAMILY_PROFILE_ID } from '@/context/FamilyContext';
import { Avatar } from './Avatar';
import { PinPad } from './PinPad';
import type { FamilyMember } from '@/types';

interface Props {
  onClose?: () => void;
  // When true, shown as a full-screen takeover (no active session yet).
  // When false, shown as a modal "switch user" panel.
  fullscreen?: boolean;
}

export function UserSwitcher({ onClose, fullscreen = false }: Props) {
  const { members, signInAs, family } = useFamily();
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePin = async (pin: string) => {
    if (!selected) return;
    const res = await signInAs(selected.id, pin);
    if (!res.ok) {
      setError(res.error || 'Try again');
      return;
    }
    setError(null);
    onClose?.();
  };

  const handleSelectMember = async (m: FamilyMember) => {
    setSelected(m);
    setError(null);
    if (!m.has_pin) {
      // No PIN — sign in immediately
      const res = await signInAs(m.id, null);
      if (res.ok) onClose?.();
    }
  };

  const wrapper = fullscreen
    ? 'fixed inset-0 bg-bg z-50 flex flex-col items-center justify-center p-8'
    : 'fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4';

  const inner = fullscreen
    ? 'w-full max-w-2xl flex flex-col items-center'
    : 'card p-8 w-full max-w-2xl';

  return (
    <div className={wrapper}>
      <div className={inner}>
        {!selected ? (
          <>
            <div className="text-center mb-10">
              <div className="text-text-faint text-xs tracking-widest uppercase mb-2">
                {family.name}
              </div>
              <h1 className="font-display text-4xl text-text">Who's using Home Plus?</h1>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 w-full">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMember(m)}
                  className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-surface-2 transition-colors active:scale-95"
                >
                  <Avatar member={m} size={88} />
                  <div className="text-base font-medium text-text">{m.name}</div>
                  <div className="text-xs text-text-faint capitalize">{m.role}</div>
                </button>
              ))}

              {/* Shared "Family" profile for the kitchen benchtop — no PIN, sees
                  everyone's shared content. */}
              <button
                onClick={() => signInAs(FAMILY_PROFILE_ID, null).then((r) => r.ok && onClose?.())}
                className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-surface-2 transition-colors active:scale-95"
              >
                <div
                  className="flex items-center justify-center rounded-full bg-surface-2 text-text-muted"
                  style={{ width: 88, height: 88 }}
                >
                  <Users size={40} />
                </div>
                <div className="text-base font-medium text-text">Family</div>
                <div className="text-xs text-text-faint">Shared</div>
              </button>
            </div>

            {onClose && (
              <button onClick={onClose} className="mt-8 text-sm text-text-muted hover:text-text">
                Cancel
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="flex flex-col items-center gap-3">
              <Avatar member={selected} size={72} />
              <div className="font-display text-2xl text-text">Hi, {selected.name}</div>
            </div>
            <PinPad
              onComplete={handlePin}
              error={error}
              onCancel={() => {
                setSelected(null);
                setError(null);
              }}
              prompt="Enter your PIN"
            />
          </div>
        )}
      </div>
    </div>
  );
}
