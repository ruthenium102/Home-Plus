import { useState } from 'react';
import { X, Lock, Unlock } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from './Avatar';
import { PinPad } from './PinPad';
import { verifyPinSync } from '@/lib/storage';
import type { FamilyMember } from '@/types';

interface Props {
  open: boolean;
  member: FamilyMember | null;
  onClose: () => void;
}

type Step = 'verify_current' | 'enter_new' | 'confirm_new' | 'remove_confirm';

export function SetPinModal({ open, member, onClose }: Props) {
  const { setMemberPin, activeMember } = useFamily();
  const [step, setStep] = useState<Step>('enter_new');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'set' | 'remove' | null>(null);
  // Bumped on every step transition so the PinPad clears its entered dots
  // before the user re-enters / confirms the next value.
  const [padResetKey, setPadResetKey] = useState(0);

  if (!open || !member) return null;

  const hasPin = member.pin_hash !== null;
  // Parent override: a parent editing another member's PIN can bypass the
  // current-PIN check entirely (covers the "kid forgot their PIN" case).
  const canOverride =
    activeMember?.role === 'parent' && activeMember.id !== member.id;
  const requiresVerify = hasPin && !canOverride;
  const initialStep: Step = requiresVerify ? 'verify_current' : 'enter_new';
  // For has-PIN flows the user must pick set/remove first (mode), and until
  // they do we keep showing the chooser. For no-PIN / override flows we walk
  // step directly so it advances enter_new → confirm_new on each render.
  const currentStep = mode || !requiresVerify ? step : initialStep;

  const reset = () => {
    setStep('enter_new');
    setFirstPin('');
    setError(null);
    setMode(null);
    setPadResetKey((k) => k + 1);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const advance = (next: Step) => {
    setStep(next);
    setPadResetKey((k) => k + 1);
  };

  const handlePinComplete = (pin: string) => {
    setError(null);

    if (currentStep === 'verify_current') {
      if (!verifyPinSync(pin, member.pin_hash)) {
        setError('Wrong PIN');
        return;
      }
      // Verified — now choose what to do
      if (mode === 'remove') {
        setMemberPin(member.id, null);
        handleClose();
      } else {
        advance('enter_new');
      }
      return;
    }

    if (currentStep === 'enter_new') {
      setFirstPin(pin);
      advance('confirm_new');
      return;
    }

    if (currentStep === 'confirm_new') {
      if (pin !== firstPin) {
        setError("PINs don't match");
        setFirstPin('');
        advance('enter_new');
        return;
      }
      setMemberPin(member.id, pin);
      handleClose();
      return;
    }
  };

  // Initial choice screen if member already has a PIN. Parent-override skips
  // straight to enter_new (no current PIN required) but we still let them
  // pick set vs. remove explicitly.
  if (hasPin && !mode) {
    const overrideHint = canOverride
      ? 'Parent override — no current PIN needed'
      : "You'll need the current one first";
    return (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <div
          className="card w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Avatar member={member} size={44} />
              <div>
                <div className="font-display text-lg text-text">{member.name}</div>
                <div className="text-xs text-text-faint">PIN protected</div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => {
                setMode('set');
                advance(canOverride ? 'enter_new' : 'verify_current');
              }}
              className="w-full flex items-center gap-3 p-4 rounded-md border border-border hover:bg-surface-2 transition-colors text-left"
            >
              <Lock size={18} className="text-text-muted" />
              <div className="flex-1">
                <div className="text-sm font-medium text-text">Change PIN</div>
                <div className="text-xs text-text-faint">{overrideHint}</div>
              </div>
            </button>
            <button
              onClick={() => {
                if (canOverride) {
                  // Parent skips verification and removes directly.
                  setMemberPin(member.id, null);
                  handleClose();
                  return;
                }
                setMode('remove');
                advance('verify_current');
              }}
              className="w-full flex items-center gap-3 p-4 rounded-md border border-border hover:bg-surface-2 transition-colors text-left"
            >
              <Unlock size={18} className="text-text-muted" />
              <div className="flex-1">
                <div className="text-sm font-medium text-text">Remove PIN</div>
                <div className="text-xs text-text-faint">
                  {canOverride
                    ? 'Removes now — anyone will be able to tap straight in'
                    : 'Anyone will be able to tap straight in'}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const prompt =
    currentStep === 'verify_current'
      ? 'Enter current PIN'
      : currentStep === 'enter_new'
        ? hasPin
          ? 'Enter new PIN'
          : 'Choose a PIN'
        : 'Confirm PIN';

  const saveLabel =
    currentStep === 'verify_current' ? 'Unlock' :
    currentStep === 'confirm_new' ? 'Save PIN' :
    'Next';

  // The verify step keeps the auto-submit behaviour (lighter touch); the
  // setup/confirm steps require an explicit Save tap so the user can review.
  const submitMode = currentStep === 'verify_current' ? 'auto' : 'save';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Avatar member={member} size={44} />
            <div>
              <div className="font-display text-lg text-text">{member.name}</div>
              <div className="text-xs text-text-faint">{prompt}</div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex justify-center pb-2">
          <PinPad
            onComplete={handlePinComplete}
            error={error}
            prompt={prompt}
            onCancel={handleClose}
            resetKey={padResetKey}
            submitMode={submitMode}
            saveLabel={saveLabel}
          />
        </div>
      </div>
    </div>
  );
}
