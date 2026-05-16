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
  const { setMemberPin } = useFamily();
  const [step, setStep] = useState<Step>('enter_new');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'set' | 'remove' | null>(null);

  if (!open || !member) return null;

  const hasPin = member.pin_hash !== null;
  const initialStep: Step = hasPin ? 'verify_current' : 'enter_new';
  // For has-PIN flows the user must pick set/remove first (mode), and until
  // they do we keep showing the chooser. For no-PIN flows we walk step
  // directly so it can advance enter_new → confirm_new without being pinned
  // back to initialStep on each render.
  const currentStep = mode || !hasPin ? step : initialStep;

  const reset = () => {
    setStep('enter_new');
    setFirstPin('');
    setError(null);
    setMode(null);
  };

  const handleClose = () => {
    reset();
    onClose();
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
        setStep('enter_new');
      }
      return;
    }

    if (currentStep === 'enter_new') {
      setFirstPin(pin);
      setStep('confirm_new');
      return;
    }

    if (currentStep === 'confirm_new') {
      if (pin !== firstPin) {
        setError("PINs don't match");
        setStep('enter_new');
        setFirstPin('');
        return;
      }
      setMemberPin(member.id, pin);
      handleClose();
      return;
    }
  };

  // Initial choice screen if member already has a PIN
  if (hasPin && !mode) {
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
                setStep('verify_current');
              }}
              className="w-full flex items-center gap-3 p-4 rounded-md border border-border hover:bg-surface-2 transition-colors text-left"
            >
              <Lock size={18} className="text-text-muted" />
              <div className="flex-1">
                <div className="text-sm font-medium text-text">Change PIN</div>
                <div className="text-xs text-text-faint">
                  You'll need the current one first
                </div>
              </div>
            </button>
            <button
              onClick={() => {
                setMode('remove');
                setStep('verify_current');
              }}
              className="w-full flex items-center gap-3 p-4 rounded-md border border-border hover:bg-surface-2 transition-colors text-left"
            >
              <Unlock size={18} className="text-text-muted" />
              <div className="flex-1">
                <div className="text-sm font-medium text-text">Remove PIN</div>
                <div className="text-xs text-text-faint">
                  Anyone will be able to tap straight in
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
          />
        </div>
      </div>
    </div>
  );
}
