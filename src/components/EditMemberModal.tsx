import { useEffect, useState } from 'react';
import { X, Mail, CheckCircle2 } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { Avatar } from '@/components/Avatar';
import { BirthdayPicker } from '@/components/BirthdayPicker';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import { isSupabaseConfigured } from '@/lib/supabase';
import { InviteModal } from '@/components/InviteModal';
import type { MemberColor, Role, FamilyMember } from '@/types';

interface Props {
  open: boolean;
  member: FamilyMember | null;
  onClose: () => void;
}

export function EditMemberModal({ open, member, onClose }: Props) {
  const { updateMember } = useFamily();

  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('child');
  const [color, setColor] = useState<MemberColor>('dusty-blue');
  const [birthday, setBirthday] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (!open || !member) return;
    setName(member.name);
    setRole(member.role);
    setColor(member.color);
    setBirthday(member.birthday || '');
  }, [open, member]);

  if (!open || !member) return null;

  const preview: FamilyMember = { ...member, name: name || member.name, role, color };

  const handleSave = () => {
    if (!name.trim()) return;
    updateMember(member.id, {
      name: name.trim(),
      role,
      color,
      birthday: birthday || null
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg text-text">Edit member</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex justify-center">
            <Avatar member={preview} size={64} />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
            />
          </div>

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

          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">
              Birthday <span className="text-text-faint">(optional)</span>
            </label>
            <BirthdayPicker value={birthday} onChange={setBirthday} />
            {birthday && (
              <button
                type="button"
                onClick={() => setBirthday('')}
                className="mt-1 text-xs text-text-faint hover:text-text"
              >
                Clear birthday
              </button>
            )}
          </div>

          {isSupabaseConfigured && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5 font-medium">Account</label>
              {member.auth_user_id ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                  Account linked
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-text-muted hover:border-accent hover:text-accent transition-colors"
                >
                  <Mail size={14} />
                  Send invite to join Home+
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-md text-sm text-text-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2.5 bg-accent text-white rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} defaultName={member.name} />
    </div>
  );
}
