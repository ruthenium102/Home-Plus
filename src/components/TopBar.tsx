import { format } from 'date-fns';
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFamily } from '@/context/FamilyContext';
import { useToday } from '@/hooks/useToday';
import { useWeather, weatherLabel, weatherIconName } from '@/hooks/useWeather';
import { Avatar } from './Avatar';
import { SyncIndicator } from './SyncIndicator';
import { VoiceButton } from './VoiceButton';

const ICON_MAP: Record<string, LucideIcon> = {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
};

interface Props {
  onSwitchUser: () => void;
}

export function TopBar({ onSwitchUser }: Props) {
  const { family, activeMember } = useFamily();
  const { temp, code, locationName, loading, error, locationStatus, requestLocation, unit } =
    useWeather();
  // Live date — a bare new Date() only refreshes when something re-renders,
  // so the header showed yesterday on a device left open past midnight.
  const now = useToday();

  const WeatherIcon = code !== null ? (ICON_MAP[weatherIconName(code)] ?? Cloud) : null;
  const tempStr = loading ? '—°' : error ? '?°' : temp !== null ? `${temp}°${unit}` : null;

  return (
    <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
      <div className="min-w-0">
        <div className="text-[10px] sm:text-xs tracking-widest uppercase text-text-faint mb-0.5 sm:mb-1 truncate">
          {family.name}
        </div>
        <div className="font-display text-xl sm:text-3xl text-text leading-none">
          {format(now, 'EEE, d MMM')}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="text-[10px] text-text-faint/50">v{__APP_VERSION__}</div>
          <SyncIndicator />
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <VoiceButton />

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
                <span className="text-base sm:text-xl font-medium text-text">{tempStr}</span>
              </div>
              <div className="hidden sm:block text-xs text-text-faint mt-0.5 leading-tight">
                {locationName || 'Location set'}
                {code !== null && <span> · {weatherLabel(code)}</span>}
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
