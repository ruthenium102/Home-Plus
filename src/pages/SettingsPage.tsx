import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Lock, LockOpen, MapPin, Search, X, UserPlus, LogOut } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useTheme } from '@/context/ThemeContext';
import { useWeather } from '@/hooks/useWeather';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { SetPinModal } from '@/components/SetPinModal';
import { InviteModal } from '@/components/InviteModal';
import { COLOR_OPTIONS, MEMBER_COLORS } from '@/lib/colors';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { ThemeMode, MemberColor, FamilyMember } from '@/types';

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code: string;
  admin1?: string;
}

export function SettingsPage() {
  const { members, family, isDemoMode, updateMember, signOut, activeMember } =
    useFamily();
  const { mode, setMode } = useTheme();
  const { temp, locationName, locationStatus, resetLocation, setManualLocation } = useWeather();
  const { authSignOut } = useAuth();
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
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
          {isParent && isSupabaseConfigured && (
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent border border-accent/30 rounded-md hover:bg-accent/10 transition-colors font-medium"
            >
              <UserPlus size={13} /> Invite
            </button>
          )}
        </div>
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isActive={activeMember?.id === m.id}
              onChangeColor={(c) => updateMember(m.id, { color: c })}
              onSetPin={() => setPinTarget(m)}
            />
          ))}
        </div>
      </section>

      {/* My Day */}
      <section className="card p-5">
        <h2 className="font-display text-lg text-text mb-1">My Day</h2>
        <p className="text-xs text-text-faint mb-4">
          Visual daily planner. Enable per family member.
        </p>
        <div className="space-y-2">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-2/60 cursor-pointer transition-colors"
            >
              <Avatar member={m} size={32} />
              <span className="flex-1 text-sm text-text">{m.name}</span>
              <input
                type="checkbox"
                checked={m.my_day_enabled}
                onChange={(e) => updateMember(m.id, { my_day_enabled: e.target.checked })}
                className="accent-accent w-4 h-4"
              />
            </label>
          ))}
        </div>
      </section>

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
            <div className="text-text">{temp !== null ? `${temp}°` : '—'}</div>
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
            <div className="absolute left-0 right-0 top-full mt-1 z-20 card overflow-hidden shadow-lg border border-border">
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
  onChangeColor,
  onSetPin
}: {
  member: FamilyMember;
  isActive: boolean;
  onChangeColor: (c: MemberColor) => void;
  onSetPin: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md hover:bg-surface-2 transition-colors">
      <Avatar member={member} size={44} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-medium text-text">{member.name}</span>
          {isActive && (
            <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
              You
            </span>
          )}
        </div>
        <div className="text-xs text-text-faint capitalize mb-2">
          {member.role}
          {member.birthday && ` · b. ${member.birthday}`}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => onChangeColor(c)}
              title={c}
              className={
                'w-5 h-5 rounded-full transition-transform ' +
                (member.color === c ? 'ring-2 ring-text-muted scale-110' : '')
              }
              style={{ background: MEMBER_COLORS[c].base }}
            />
          ))}
        </div>
      </div>
      <button
        onClick={onSetPin}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-border hover:bg-surface-2 text-text-muted whitespace-nowrap"
        title={member.pin_hash ? 'Change or remove PIN' : 'Set a PIN'}
      >
        {member.pin_hash ? (
          <>
            <Lock size={12} /> PIN set
          </>
        ) : (
          <>
            <LockOpen size={12} /> No PIN
          </>
        )}
      </button>
    </div>
  );
}
