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
        <div className="text-[10px] text-text-faint/50 mt-0.5">v{__APP_VERSION__}</div>
      </div>

      <div className="flex items-center gap-3">
        {/* Weather widget */}
        <div className="text-right pr-1">
          {locationStatus === 'idle' ? (
            <button
              onClick={requestLocation}
              className="flex items-center gap-1 text-xs text-text-faint hover:text-accent transition-colors"
              title="Enable location for weather"
            >
              <MapPin size={11} />
              <span className="hidden sm:inline">Enable weather</span>
            </button>
          ) : locationStatus === 'requesting' ? (
            <div className="text-xs text-text-faint">Locating…</div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-1 leading-none">
                {WeatherIcon && <WeatherIcon size={15} className="text-text-muted" />}
                <span className="text-xl font-medium text-text">{tempStr}</span>
              </div>
              <div className="text-xs text-text-faint mt-0.5 leading-tight">
                {locationName || 'Location set'}
                {code !== null && <span className="hidden sm:inline"> · {weatherLabel(code)}</span>}
              </div>
            </>
          )}
        </div>

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
