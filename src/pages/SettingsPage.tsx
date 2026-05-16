import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Lock, LockOpen, MapPin, Search, X, UserPlus, LogOut, Pencil, Home, Calendar, ListChecks, Trophy, Sparkles, ChefHat, PawPrint } from 'lucide-react';
import { DragHandle } from '@/components/DragHandle';
import { useListDragReorder } from '@/hooks/useListDragReorder';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { useWeather } from '@/hooks/useWeather';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { SetPinModal } from '@/components/SetPinModal';
import { InviteModal } from '@/components/InviteModal';
import { AddMemberModal } from '@/components/AddMemberModal';
import { EditMemberModal } from '@/components/EditMemberModal';
import { MEMBER_COLORS } from '@/lib/colors';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { ThemeMode, FamilyMember } from '@/types';

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code: string;
  admin1?: string;
}

export function SettingsPage() {
  const {
    members,
    family,
    isDemoMode,
    updateMember,
    signOut,
    activeMember,
    kitchenSettings,
    updateKitchenSettings,
    reorderMembers,
  } = useFamily();
  const { authSignOut } = useAuth();
  const memberDnd = useListDragReorder(members, reorderMembers);
  const { mode, setMode } = useTheme();
  const { temp, locationName, locationStatus, resetLocation, setManualLocation, unit, setUnit } = useWeather();
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  const [editTarget, setEditTarget] = useState<FamilyMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const isParent = activeMember?.role === 'parent';
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<GeoResult[]>([]);
  const [citySearching, setCitySearching] = useState(false);

  useEffect(() => {
    if (cityQuery.length < 2) { setCityResults([]); return; }
    const t = setTimeout(async () => {
      setCitySearching(true);
      try {
        const r = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=6&language=en&format=json`
        ).then((x) => x.json());
        setCityResults((r.results as GeoResult[]) || []);
      } catch { setCityResults([]); }
      finally { setCitySearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [cityQuery]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {isDemoMode && (
        <div className="card p-4 border-accent/40 bg-accent-soft/40">
          <div className="text-sm text-text font-medium mb-1">
            Running in demo mode
          </div>
          <div className="text-xs text-text-muted leading-relaxed">
            Supabase isn't configured yet. Your changes are saved to this device only.
            To enable cloud sync across devices, set <code>VITE_SUPABASE_URL</code> and
            <code> VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> and restart the dev server.
          </div>
        </div>
      )}

      {/* Family info */}
      <section className="card p-5">
        <h2 className="font-display text-lg text-text mb-4">Family</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-text-faint text-xs uppercase tracking-wider mb-1">Name</div>
            <div className="text-text">{family.name}</div>
          </div>
          <div>
            <div className="text-text-faint text-xs uppercase tracking-wider mb-1">
              Timezone
            </div>
            <div className="text-text">{family.timezone}</div>
          </div>
        </div>
      </section>

      {/* Theme */}
      <section className="card p-5">
        <h2 className="font-display text-lg text-text mb-4">Appearance</h2>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { v: 'light', icon: Sun, label: 'Light' },
              { v: 'dark', icon: Moon, label: 'Dark' },
              { v: 'system', icon: Monitor, label: 'System' }
            ] as const
          ).map(({ v, icon: Icon, label }) => (
            <button
              key={v}
              onClick={() => setMode(v as ThemeMode)}
              className={
                'flex flex-col items-center gap-2 p-4 rounded-md border-2 transition-all ' +
                (mode === v
                  ? 'border-accent bg-accent-soft'
                  : 'border-border hover:border-border-strong')
              }
            >
              <Icon size={22} className={mode === v ? 'text-accent' : 'text-text-muted'} />
              <span
                className={
                  'text-sm font-medium ' + (mode === v ? 'text-text' : 'text-text-muted')
                }
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Members */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-text">Family members</h2>
          {isParent && (
            <div className="flex gap-2">
              <button
                onClick={() => setAddMemberOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent border border-accent/30 rounded-md hover:bg-accent/10 transition-colors font-medium"
              >
                <UserPlus size={13} /> Add member
              </button>
              {isSupabaseConfigured && (
                <button
                  onClick={() => setInviteOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted border border-border rounded-md hover:bg-surface-2 transition-colors font-medium"
                >
                  Invite by email
                </button>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {members.map((m) => {
            const rowProps = isParent && members.length > 1 ? memberDnd.getRowProps(m.id) : null;
            return (
              <MemberRow
                key={m.id}
                member={m}
                isActive={activeMember?.id === m.id}
                dragProps={rowProps}
                onEdit={() => setEditTarget(m)}
                onSetPin={() => setPinTarget(m)}
              />
            );
          })}
        </div>
      </section>

      {/* Pages */}
      <section className="card p-5">
        <h2 className="font-display text-lg text-text mb-1">Pages</h2>
        <p className="text-xs text-text-faint mb-4">
          Control which pages each family member can access. Tick the "All users" row to apply to everyone.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left pb-2 pr-3 text-text-faint font-medium">Member</th>
                {[
                  { icon: Home, label: 'Home', locked: true },
                  { icon: Calendar, label: 'Calendar', locked: true },
                  { icon: ListChecks, label: 'Lists', locked: true },
                  { icon: Sun, label: 'My Day', locked: false, field: 'my_day_enabled' as const },
                  { icon: Trophy, label: 'Chores', locked: false, field: 'chores_enabled' as const },
                  { icon: Sparkles, label: 'Habits', locked: false, field: 'habits_enabled' as const },
                  { icon: PawPrint, label: 'Pet', locked: false, field: 'pet_enabled' as const },
                  { icon: ChefHat, label: 'Kitchen+', locked: false, field: 'kitchen_enabled' as const },
                ].map(({ icon: Icon, label }) => (
                  <th key={label} className="text-center pb-2 px-1 text-text-faint font-medium min-w-[52px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <Icon size={13} />
                      <span className="text-[10px]">{label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isParent && members.length > 1 && (
                <tr className="bg-surface-2/30">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center">
                        <UserPlus size={13} className="text-text-faint" />
                      </div>
                      <span className="text-sm text-text font-medium">All users</span>
                    </div>
                  </td>
                  {[
                    { locked: true },
                    { locked: true },
                    { locked: true },
                    { locked: false, field: 'my_day_enabled' as const },
                    { locked: false, field: 'chores_enabled' as const },
                    { locked: false, field: 'habits_enabled' as const },
                    { locked: false, field: 'pet_enabled' as const },
                    { locked: false, field: 'kitchen_enabled' as const },
                  ].map((col, idx) => (
                    <td key={idx} className="text-center py-2 px-1">
                      {col.locked ? (
                        <Lock size={13} className="mx-auto text-text-faint/40" />
                      ) : (
                        (() => {
                          const allOn = members.every((m) => m[col.field!] === true);
                          return (
                            <input
                              type="checkbox"
                              checked={allOn}
                              onChange={(e) => {
                                const next = e.target.checked;
                                members.forEach((m) => updateMember(m.id, { [col.field!]: next }));
                              }}
                              className="accent-accent w-4 h-4 cursor-pointer"
                              title="Toggle for all members"
                            />
                          );
                        })()
                      )}
                    </td>
                  ))}
                </tr>
              )}
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <Avatar member={m} size={28} />
                      <span className="text-sm text-text">{m.name}</span>
                    </div>
                  </td>
                  {[
                    { locked: true },
                    { locked: true },
                    { locked: true },
                    { locked: false, field: 'my_day_enabled' as keyof typeof m, value: m.my_day_enabled },
                    { locked: false, field: 'chores_enabled' as keyof typeof m, value: m.chores_enabled },
                    { locked: false, field: 'habits_enabled' as keyof typeof m, value: m.habits_enabled },
                    { locked: false, field: 'pet_enabled' as keyof typeof m, value: m.pet_enabled },
                    { locked: false, field: 'kitchen_enabled' as keyof typeof m, value: m.kitchen_enabled },
                  ].map((col, idx) => (
                    <td key={idx} className="text-center py-2 px-1">
                      {col.locked ? (
                        <Lock size={13} className="mx-auto text-text-faint/40" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={col.value as boolean}
                          onChange={(e) => updateMember(m.id, { [col.field!]: e.target.checked })}
                          className="accent-accent w-4 h-4 cursor-pointer"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Kitchen+ */}
      {isParent && (
        <section className="card p-5">
          <h2 className="font-display text-lg text-text mb-1">Kitchen+</h2>
          <p className="text-xs text-text-faint mb-4">Cupboard staples, shopping days, and meal-event colour.</p>

          <div className="mb-5">
            <h3 className="text-sm font-medium text-text mb-1">Cupboard staples</h3>
            <p className="text-xs text-text-faint mb-2">
              Ingredients you always have — excluded from the shopping list.
            </p>
            <CupboardEditor />
          </div>

          <div className="mb-5">
            <h3 className="text-sm font-medium text-text mb-1">Shopping days</h3>
            <p className="text-xs text-text-faint mb-3">Used to split the shopping list into two shops.</p>
            <ShopDaysEditor />
          </div>

          <div>
            <h3 className="text-sm font-medium text-text mb-1">Meal-event colour</h3>
            <p className="text-xs text-text-faint mb-3">Colour used when meal plans appear on the calendar.</p>
            <div className="flex flex-wrap gap-2">
              {['#3b82f6','#8b5cf6','#ec4899','#f97316','#22c55e','#14b8a6','#f59e0b','#ef4444'].map((hex) => {
                const active = (kitchenSettings.meal_color ?? '#3b82f6') === hex;
                return (
                  <button
                    key={hex}
                    onClick={() => updateKitchenSettings({ meal_color: hex })}
                    className={'w-8 h-8 rounded-full border-2 transition-all ' + (active ? 'border-text scale-110' : 'border-transparent hover:scale-105')}
                    style={{ background: hex }}
                    title={hex}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Weather */}
      <section className="card p-5">
        <h2 className="font-display text-lg text-text mb-4">Weather</h2>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <div className="text-text-faint text-xs uppercase tracking-wider mb-1">Location</div>
            <div className="text-text">
              {locationStatus === 'idle'
                ? 'Not set'
                : locationStatus === 'requesting'
                  ? 'Detecting…'
                  : locationName || 'Unknown'}
            </div>
          </div>
          <div>
            <div className="text-text-faint text-xs uppercase tracking-wider mb-1">Current</div>
            <div className="text-text">{temp !== null ? `${temp}°${unit}` : '—'}</div>
          </div>
        </div>

        {/* Unit toggle */}
        <div className="flex items-center justify-between mb-4 p-2 rounded-md bg-surface-2/40">
          <span className="text-sm text-text-muted">Show temperatures in</span>
          <div className="flex items-center bg-surface-2 border border-border rounded-md p-0.5">
            {(['C', 'F'] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={
                  'px-3 py-1 rounded text-xs font-semibold transition-colors ' +
                  (unit === u
                    ? 'bg-accent text-white'
                    : 'text-text-muted hover:text-text')
                }
                aria-pressed={unit === u}
              >
                °{u}
              </button>
            ))}
          </div>
        </div>

        {/* City search */}
        <div className="relative mb-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-md focus-within:border-accent">
            <Search size={13} className="text-text-faint shrink-0" />
            <input
              type="text"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Pin a city (e.g. Perth, WA)…"
              className="flex-1 bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none"
            />
            {citySearching && <span className="text-[10px] text-text-faint">…</span>}
            {cityQuery && (
              <button onClick={() => { setCityQuery(''); setCityResults([]); }}>
                <X size={12} className="text-text-faint" />
              </button>
            )}
          </div>
          {cityResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-40 card overflow-hidden shadow-lg border border-border">
              {cityResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    const name = r.admin1 ? `${r.name}, ${r.admin1}` : r.name;
                    setManualLocation(r.latitude, r.longitude, name);
                    setCityQuery('');
                    setCityResults([]);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm text-text hover:bg-surface-2 border-b border-border last:border-b-0"
                >
                  <span className="font-medium">{r.name}</span>
                  {r.admin1 && <span className="text-text-faint"> · {r.admin1}</span>}
                  <span className="text-text-faint/60 text-xs ml-1">{r.country_code}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={resetLocation}
          className="flex items-center gap-2 px-4 py-2 bg-surface-2 border border-border text-text-muted text-sm rounded-md hover:bg-surface"
        >
          <MapPin size={14} /> Reset to GPS location
        </button>
      </section>

      {/* Account */}
      <section className="card p-5">
        <h2 className="font-display text-lg text-text mb-4">Session</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2 bg-surface-2 border border-border text-text-muted text-sm rounded-md hover:bg-surface"
          >
            <Lock size={14} /> Lock & switch user
          </button>
          {isSupabaseConfigured && (
            <button
              onClick={authSignOut}
              className="flex items-center gap-2 px-4 py-2 bg-surface-2 border border-border text-text-muted text-sm rounded-md hover:bg-surface"
            >
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      </section>

      <SetPinModal
        open={pinTarget !== null}
        member={pinTarget}
        onClose={() => setPinTarget(null)}
      />
      <EditMemberModal
        open={editTarget !== null}
        member={editTarget}
        onClose={() => setEditTarget(null)}
      />
      <AddMemberModal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} />
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {/* Version footer */}
      <div className="pt-2 pb-6 text-center">
        <div className="text-xs text-text-faint">Home Plus v{__APP_VERSION__}</div>
        <div className="text-[10px] text-text-faint/60 mt-0.5">Built {__BUILD_DATE__}</div>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  isActive,
  dragProps,
  onEdit,
  onSetPin
}: {
  member: FamilyMember;
  isActive: boolean;
  dragProps: ReturnType<ReturnType<typeof useListDragReorder<FamilyMember>>['getRowProps']> | null;
  onEdit: () => void;
  onSetPin: () => void;
}) {
  const hasLogin = !!member.auth_user_id;
  const { isDragging, isOver, ...rowHandlers } = dragProps ?? { isDragging: false, isOver: false };
  return (
    <div
      {...(dragProps ? rowHandlers : {})}
      className={
        'flex items-center gap-3 p-3 rounded-md bg-surface-2/40 hover:bg-surface-2/70 transition-colors ' +
        (isDragging ? 'opacity-40 ' : '') +
        (isOver ? 'ring-2 ring-accent ' : '')
      }
    >
      {dragProps && <DragHandle />}
      <Avatar member={member} size={44} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-medium text-text">{member.name}</span>
          {isActive && (
            <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
              You
            </span>
          )}
          {hasLogin ? (
            <span className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold bg-green-500/10 px-1.5 py-0.5 rounded">
              Login
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-text-faint font-semibold bg-surface-2 px-1.5 py-0.5 rounded">
              PIN only
            </span>
          )}
        </div>
        {member.email ? (
          <div className="text-xs text-text-muted truncate font-mono">{member.email}</div>
        ) : null}
        <div className="text-xs text-text-faint capitalize flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: MEMBER_COLORS[member.color].base }}
          />
          {member.role}
        </div>
      </div>
      <button
        onClick={onSetPin}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-border hover:bg-surface-2 text-text-muted whitespace-nowrap"
        title={member.pin_hash ? 'Change or remove PIN' : 'Set a PIN'}
      >
        {member.pin_hash ? (
          <><Lock size={12} /> PIN set</>
        ) : (
          <><LockOpen size={12} /> No PIN</>
        )}
      </button>
      <button
        onClick={onEdit}
        className="w-7 h-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-text-faint hover:text-text shrink-0"
        title="Edit member"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

function CupboardEditor() {
  const { kitchenSettings, updateKitchenSettings } = useFamily();
  const [newItem, setNewItem] = useState('');

  const add = () => {
    const item = newItem.trim().toLowerCase();
    if (!item || kitchenSettings.cupboard.includes(item)) { setNewItem(''); return; }
    updateKitchenSettings({ cupboard: [...kitchenSettings.cupboard, item] });
    setNewItem('');
  };
  const remove = (item: string) =>
    updateKitchenSettings({ cupboard: kitchenSettings.cupboard.filter((c) => c !== item) });

  return (
    <>
      <div className="flex gap-2 mb-3">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="e.g. olive oil, salt, garlic"
          className="flex-1 min-w-0 px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
        />
        <button
          onClick={add}
          className="px-3 py-2 bg-accent text-white text-sm font-medium rounded-md hover:opacity-90 shrink-0"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {kitchenSettings.cupboard.length === 0 ? (
          <span className="text-xs text-text-faint">No cupboard items yet.</span>
        ) : (
          kitchenSettings.cupboard.map((item) => (
            <span
              key={item}
              className="flex items-center gap-1 px-2 py-0.5 bg-surface-2 rounded-full text-xs text-text"
            >
              {item}
              <button
                onClick={() => remove(item)}
                className="text-text-faint hover:text-red-500 transition"
              >
                <X size={10} />
              </button>
            </span>
          ))
        )}
      </div>
    </>
  );
}

function ShopDaysEditor() {
  const { kitchenSettings, updateKitchenSettings } = useFamily();
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-text-faint block mb-1">Main shop day</label>
        <select
          value={kitchenSettings.primary_shop_day ?? ''}
          onChange={(e) => updateKitchenSettings({ primary_shop_day: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
        >
          <option value="">None</option>
          {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
        <input
          type="checkbox"
          checked={kitchenSettings.mid_week_shop_enabled}
          onChange={(e) => updateKitchenSettings({ mid_week_shop_enabled: e.target.checked })}
          className="accent-accent w-4 h-4"
        />
        Enable mid-week shop
      </label>
      {kitchenSettings.mid_week_shop_enabled && (
        <div>
          <label className="text-xs text-text-faint block mb-1">Mid-week shop day</label>
          <select
            value={kitchenSettings.mid_week_shop_day ?? ''}
            onChange={(e) => updateKitchenSettings({ mid_week_shop_day: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-text text-sm focus:outline-none focus:border-accent"
          >
            <option value="">None</option>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
