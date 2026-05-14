import { useMemo, useState } from 'react';
import {
  Plane,
  Home as HomeIcon,
  GraduationCap,
  Briefcase,
  Coffee,
  MapPin
} from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { rosterRoleAssignments } from '@/lib/rotation';
import { Avatar } from './Avatar';
import { LocationPicker } from './LocationPicker';
import type { FamilyMember } from '@/types';

function locationIcon(loc: string | null) {
  if (!loc) return MapPin;
  const lower = loc.toLowerCase();
  if (lower.includes('til')) return Plane;
  if (lower.includes('home')) return HomeIcon;
  if (lower.includes('school')) return GraduationCap;
  if (lower.includes('work')) return Briefcase;
  if (lower.includes('out')) return Coffee;
  return MapPin;
}

export function MemberStrip() {
  const { members, chores } = useFamily();
  const [picking, setPicking] = useState<FamilyMember | null>(null);
  const roleMap = useMemo(() => rosterRoleAssignments(chores, members), [chores, members]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5">
        {members.map((m) => {
          const Icon = locationIcon(m.current_location);
          const isAway = m.current_location?.toLowerCase().includes('til');
          return (
            <button
              key={m.id}
              onClick={() => setPicking(m)}
              className="card flex items-center gap-3 p-3 hover:bg-surface-2/40 transition-colors text-left"
              title="Tap to update status"
            >
              <Avatar member={m} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{m.name}</div>
                <div className="text-[11px] text-text-faint truncate flex items-center gap-1">
                  <Icon
                    size={10}
                    className={
                      'shrink-0 ' + (isAway ? 'text-accent' : 'text-text-faint')
                    }
                  />
                  {m.current_location || 'No status'}
                </div>
                {(roleMap.get(m.id) ?? []).map((role) => (
                  <span
                    key={role}
                    className="inline-block mt-0.5 mr-1 text-[10px] uppercase tracking-wider bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-semibold"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <LocationPicker
        open={picking !== null}
        member={picking}
        onClose={() => setPicking(null)}
      />
    </>
  );
}
