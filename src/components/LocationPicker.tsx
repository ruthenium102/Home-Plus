import { useState, useEffect } from 'react';
import { localISO } from '@/lib/dates';
import {
  X,
  Home as HomeIcon,
  GraduationCap,
  Briefcase,
  Coffee,
  Plane
} from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from './Avatar';
import type { FamilyMember } from '@/types';

interface Props {
  open: boolean;
  member: FamilyMember | null;
  onClose: () => void;
}

const PRESETS = [
  { label: 'Home', Icon: HomeIcon },
  { label: 'School', Icon: GraduationCap },
  { label: 'Work', Icon: Briefcase },
  { label: 'Out', Icon: Coffee }
];

export function LocationPicker({ open, member, onClose }: Props) {
  const { setMemberLocation } = useFamily();
  const [travelDest, setTravelDest] = useState('');
  const [travelUntil, setTravelUntil] = useState('');
  const [showTravelForm, setShowTravelForm] = useState(false);

  useEffect(() => {
    if (open) {
      setShowTravelForm(false);
      setTravelDest('');
      setTravelUntil('');
    }
  }, [open]);

  if (!open || !member) return null;

  const handleQuickSet = (label: string) => {
    setMemberLocation(member.id, label, null);
    onClose();
  };

  const handleTravelSubmit = () => {
    if (!travelDest.trim() || !travelUntil) return;
    const dest = travelDest.trim();
    const untilDate = new Date(travelUntil);
    const dateLabel = untilDate.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short'
    });
    const status = `${dest} til ${dateLabel}`;
    setMemberLocation(member.id, status, untilDate.toISOString());
    onClose();
  };

  const handleClear = () => {
    setMemberLocation(member.id, null, null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Avatar member={member} size={36} />
            <div>
              <div className="font-display text-lg text-text">{member.name}</div>
              <div className="text-xs text-text-faint">
                {member.current_location ? `Currently: ${member.current_location}` : 'No status set'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {!showTravelForm ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {PRESETS.map((p) => {
                  const isCurrent = member.current_location === p.label;
                  return (
                    <button
                      key={p.label}
                      onClick={() => handleQuickSet(p.label)}
                      className={
                        'flex flex-col items-center gap-1.5 p-4 rounded-md border-2 transition-colors ' +
                        (isCurrent
                          ? 'border-accent bg-accent-soft'
                          : 'border-border hover:border-border-strong')
                      }
                    >
                      <p.Icon
                        size={22}
                        className={isCurrent ? 'text-accent' : 'text-text-muted'}
                      />
                      <span className="text-sm font-medium text-text">{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setShowTravelForm(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-md border-2 border-border hover:border-accent transition-colors text-text-muted hover:text-text"
              >
                <Plane size={16} />
                <span className="text-sm font-medium">Away til...</span>
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-text-faint block mb-1.5">
                  Where to?
                </label>
                <input
                  type="text"
                  value={travelDest}
                  onChange={(e) => setTravelDest(e.target.value)}
                  placeholder="e.g. Sydney, Bali, Mum's place"
                  autoFocus
                  className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-text-faint block mb-1.5">
                  Back when?
                </label>
                <input
                  type="date"
                  value={travelUntil}
                  onChange={(e) => setTravelUntil(e.target.value)}
                  min={localISO()}
                  className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
                />
                <div className="text-[11px] text-text-faint mt-1">
                  Status auto-resets to "Home" on this date.
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowTravelForm(false)}
                  className="flex-1 px-3 py-2 text-sm text-text-muted hover:text-text border border-border rounded-md"
                >
                  Back
                </button>
                <button
                  onClick={handleTravelSubmit}
                  disabled={!travelDest.trim() || !travelUntil}
                  className="flex-1 px-3 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40"
                >
                  Set status
                </button>
              </div>
            </div>
          )}
        </div>

        {!showTravelForm && member.current_location && (
          <div className="border-t border-border p-3 text-center">
            <button
              onClick={handleClear}
              className="text-xs text-text-faint hover:text-text-muted"
            >
              Clear status
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
