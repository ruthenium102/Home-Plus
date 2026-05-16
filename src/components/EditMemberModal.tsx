import { useEffect, useState } from 'react';
import { X, Mail, CheckCircle2, KeyRound, Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/Avatar';
import { BirthdayPicker } from '@/components/BirthdayPicker';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { InviteModal } from '@/components/InviteModal';
import type { MemberColor, Role, FamilyMember } from '@/types';

interface Props {
  open: boolean;
  member: FamilyMember | null;
  onClose: () => void;
}

export function EditMemberModal({ open, member, onClose }: Props) {
  const { updateMember, deleteMember, activeMember, members } = useFamily();
  const { forgotPassword, user: authUser } = useAuth();
  const { show } = useToast();

  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('child');
  const [color, setColor] = useState<MemberColor>('dusty-blue');
  const [birthday, setBirthday] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    if (!open || !member) return;
    setName(member.name);
    setRole(member.role);
    setColor(member.color);
    setBirthday(member.birthday || '');
    setPwOpen(false);
    setNewPw('');
    setConfirmPw('');
    setPwError('');
  }, [open, member]);

  if (!open || !member) return null;

  const preview: FamilyMember = { ...member, name: name || member.name, role, color };
  const isSelf = activeMember?.id === member.id;
  const isParent = activeMember?.role === 'parent';
  const parentCount = members.filter((m) => m.role === 'parent').length;
  const canDelete = isParent && !isSelf && !(member.role === 'parent' && parentCount <= 1);

  const handleChangePassword = async () => {
    setPwError('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    if (!supabase) { setPwError('Supabase not configured.'); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) { setPwError(error.message); return; }
    setPwOpen(false);
    setNewPw('');
    setConfirmPw('');
    show({ message: 'Password updated.' });
  };

  const handleDelete = () => {
    if (!canDelete) return;
    if (!confirm(`Delete "${member.name}"? This removes them from the family but does not delete their login account.`)) return;
    deleteMember(member.id);
    onClose();
  };

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
                <div className="space-y-2">
                  {/* Email field (read-only). When the member row is missing
                      its email, fall back to the signed-in auth user's email
                      so the field never appears blank for the active user. */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">Email</div>
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-2 border border-border rounded-md text-sm text-text">
                      <Mail size={14} className="text-text-faint shrink-0" />
                      <span className="truncate flex-1">
                        {member.email
                          || (authUser && member.auth_user_id === authUser.id ? authUser.email : null)
                          || '—'}
                      </span>
                      <CheckCircle2 size={14} className="text-green-500 shrink-0" aria-label="Account linked" />
                    </div>
                  </div>

                  {/* Password field (masked) + change form */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">Password</div>
                    {!pwOpen ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2.5 bg-surface-2 border border-border rounded-md text-sm text-text tracking-widest">
                          ••••••••
                        </div>
                        {isSelf ? (
                          <button
                            type="button"
                            onClick={() => setPwOpen(true)}
                            className="px-3 py-2.5 bg-surface-2 border border-border rounded-md text-sm text-text-muted hover:border-accent hover:text-accent transition-colors whitespace-nowrap"
                          >
                            Change
                          </button>
                        ) : member.email ? (
                          <button
                            type="button"
                            disabled={resettingPw}
                            onClick={async () => {
                              if (!member.email) return;
                              setResettingPw(true);
                              const { error } = await forgotPassword(member.email);
                              setResettingPw(false);
                              show({
                                message: error
                                  ? `Could not send reset email: ${error}`
                                  : `Password reset email sent to ${member.email}`,
                              });
                            }}
                            className="flex items-center gap-1.5 px-3 py-2.5 bg-surface-2 border border-border rounded-md text-sm text-text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {resettingPw ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                            Reset
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2 p-3 bg-surface-2 border border-border rounded-md">
                        <div className="relative">
                          <input
                            type={showPw ? 'text' : 'password'}
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder="New password (8+ characters)"
                            autoComplete="new-password"
                            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
                            tabIndex={-1}
                          >
                            {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={confirmPw}
                          onChange={(e) => setConfirmPw(e.target.value)}
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
                        />
                        {pwError && (
                          <div className="text-xs text-red-500">{pwError}</div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setPwOpen(false); setNewPw(''); setConfirmPw(''); setPwError(''); }}
                            className="flex-1 py-2 text-sm text-text-muted hover:text-text"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingPw || !newPw || !confirmPw}
                            onClick={handleChangePassword}
                            className="flex-1 py-2 bg-accent text-white rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {savingPw && <Loader2 size={14} className="animate-spin" />}
                            Save password
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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

          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} /> Remove from family
            </button>
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
