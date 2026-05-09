import { format } from 'date-fns';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  MapPin
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useWeather, weatherLabel, weatherIconName } from '@/hooks/useWeather';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';

const ICON_MAP: Record<string, LucideIcon> = {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning
};

interface Props {
  onSwitchUser: () => void;
}

export function TopBar({ onSwitchUser }: Props) {
  const { family, activeMember } = useFamily();
  const { temp, code, locationName, loading, error, locationStatus, requestLocation } =
    useWeather();
  const now = new Date();

  const WeatherIcon = code !== null ? (ICON_MAP[weatherIconName(code)] ?? Cloud) : null;
  const tempStr = loading ? '—°' : error ? '?°' : temp !== null ? `${temp}°` : null;

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="text-xs tracking-widest uppercase text-text-faint mb-1">
          {family.name}
        </div>
        <div className="font-display text-2xl sm:text-3xl text-text leading-none">
          {format(now, 'EEEE, d MMM')}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Weather widget */}
        <div className="hidden sm:block text-right pr-1">
          {locationStatus === 'idle' ? (
            <button
              onClick={requestLocation}
              className="flex items-center gap-1 text-xs text-text-faint hover:text-accent transition-colors"
              title="Enable location for weather"
            >
              <MapPin size={11} />
              Tap to enable location
            </button>
          ) : locationStatus === 'requesting' ? (
            <div className="text-xs text-text-faint">Locating…</div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-1 leading-none">
                {WeatherIcon && <WeatherIcon size={15} className="text-text-muted" />}
                <span className="text-xl font-medium text-text">{tempStr}</span>
              </div>
              <div className="text-xs text-text-faint mt-0.5">
                {locationName}{code !== null && ` · ${weatherLabel(code)}`}
              </div>
            </>
          )}
        </div>

        <ThemeToggle />

        {activeMember && (
          <button
            onClick={onSwitchUser}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors"
            title="Switch user"
          >
            <Avatar member={activeMember} size={36} showRing />
          </button>
        )}
      </div>
    </div>
  );
}
