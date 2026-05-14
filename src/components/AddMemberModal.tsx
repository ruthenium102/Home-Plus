import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from '@/components/Avatar';
import { BirthdayPicker } from '@/components/BirthdayPicker';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { MemberColor, Role, FamilyMember } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const BLANK: Omit<FamilyMember, 'id' | 'created_at' | 'family_id'> = {
  name: '',
  role: 'child',
  color: 'dusty-blue',
  avatar_url: null,
  pin_hash: null,
  birthday: null,
  current_location: null,
  location_until: null,
  reward_balances: {},
  my_day_enabled: false,
  chores_enabled: true,
  habits_enabled: true,
  kitchen_enabled: false,
  pet_enabled: false,
  email: null,
};

export function AddMemberModal({ open, onClose }: Props) {
  const { addMember, family, activeMember } = useFamily();

  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('child');
  const [color, setColor] = useState<MemberColor>('dusty-blue');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState('');
  const [sendInvite, setSendInvite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const preview: FamilyMember = {
    ...BLANK, id: 'preview', family_id: '', created_at: '',
    name: name || 'Preview', role, color,
  };

  const handleClose = () => {
    setName(''); setRole('child'); setColor('dusty-blue');
    setBirthday(''); setEmail(''); setSendInvite(false);
    setError(''); setLoading(false);
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setError('');
    setLoading(true);

    addMember({
      ...BLANK,
      name: name.trim(),
      role,
      color,
      birthday: birthday || null,
      email: email.trim() || null,
    });

    // Optionally send a Supabase invite so this person can log in on their own device
    if (sendInvite && email.trim() && supabase && isSupabaseConfigured) {
      try {
        const { error: fnErr } = await supabase.functions.invoke('send-invite', {
          body: {
            email: email.trim(),
            name: name.trim(),
            family_id: family.id,
            family_name: family.name,
            invited_by_name: activeMember?.name ?? 'A family member',
            site_url: window.location.origin,
          },
        });
        if (fnErr) setError('Member added, but invite failed: ' + fnErr.message);
      } catch {
        setError('Member added, but invite email could not be sent.');
      }
    }

    setLoading(false);
    if (!error) handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="card w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg text-text">Add family member</h2>
          <button onClick={handleClose} className="text-text-faint hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Avatar preview */}
          <div className="flex justify-center">
            <Avatar member={preview} size={64} />
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emma"
              autoFocus
              className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(['parent', 'child'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={
                    'py-2 text-sm font-medium rounded-md border-2 transition-all capitalize ' +
                    (role === r
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border text-text-muted hover:border-border-strong')
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className={
                    'w-7 h-7 rounded-full transition-transform ' +
                    (color === c ? 'ring-2 ring-offset-2 ring-text-muted scale-110' : '')
                  }
                  style={{ background: MEMBER_COLORS[c].base }}
                />
              ))}
            </div>
          </div>

          {/* Birthday (optional) */}
          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">
              Birthday <span className="text-text-faint">(optional)</span>
            </label>
            <BirthdayPicker value={birthday} onChange={setBirthday} />
          </div>

          {/* Email invite — optional, only when Supabase is configured */}
          {isSupabaseConfigured && (
            <div className="border border-border rounded-md p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="accent-accent w-4 h-4"
                />
                <span className="text-sm text-text">Send login invite by email</span>
              </label>
              {sendInvite && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="their@email.com"
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
                />
              )}
              <p className="text-xs text-text-faint">
                They'll get an email so they can log in from their own device.
              </p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-md">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0">
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 border border-border rounded-md text-sm text-text-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-2.5 bg-accent text-white rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Add member
          </button>
        </div>
      </div>
    </div>
  );
}
