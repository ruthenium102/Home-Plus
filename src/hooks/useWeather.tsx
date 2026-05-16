import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

const LOCATION_KEY = 'hp:location';
const UNIT_KEY = 'hp:weather_unit';
const PERTH = { lat: -31.9505, lng: 115.8605, name: 'Perth' };
const REFRESH_MS = 30 * 60 * 1000; // 30 min between weather refreshes
const GPS_STALE_MS = 7 * 24 * 60 * 60 * 1000; // re-request GPS once a week

export type TempUnit = 'C' | 'F';

interface StoredLocation {
  lat: number;
  lng: number;
  name?: string;     // present when user set a manual city
  ts?: number;       // ms epoch when last GPS-resolved
  manual?: boolean;  // true if user picked a city (don't auto-update)
}

export type LocationStatus = 'idle' | 'requesting' | 'ready' | 'denied';

export interface WeatherState {
  temp: number | null;
  code: number | null;
  locationName: string;
  loading: boolean;
  error: string | null;
  locationStatus: LocationStatus;
  requestLocation: () => void;
  resetLocation: () => void;
  setManualLocation: (lat: number, lng: number, name: string) => void;
  unit: TempUnit;
  setUnit: (u: TempUnit) => void;
}

// ---- WMO weather-code helpers -----------------------------------------------

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 1) return 'Mainly clear';
  if (code <= 2) return 'Partly cloudy';
  if (code <= 3) return 'Overcast';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snowing';
  if (code <= 86) return 'Showers';
  return 'Thunderstorm';
}

/** Returns one of 6 Lucide icon name strings. */
export function weatherIconName(code: number): string {
  if (code === 0) return 'Sun';
  if (code <= 2) return 'CloudSun';
  if (code <= 48) return 'Cloud';
  if (code <= 67) return 'CloudRain';
  if (code <= 86) return 'CloudSnow';
  return 'CloudLightning';
}

// ---- Context ----------------------------------------------------------------

const WeatherContext = createContext<WeatherState | null>(null);

export function WeatherProvider({ children }: { children: ReactNode }) {
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(() => {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return 'idle';
    try { JSON.parse(raw); return 'ready'; } catch { return 'idle'; }
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as StoredLocation;
      return { lat: s.lat, lng: s.lng };
    } catch {
      return null;
    }
  });
  // Name set by user manually — overrides reverse-geocoding result
  const [manualName, setManualName] = useState<string | null>(() => {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as StoredLocation).name ?? null;
    } catch {
      return null;
    }
  });
  // Internal: always store celsius (what the API returns). The exposed
  // `temp` is computed on the active unit each render.
  const [tempC, setTempC] = useState<number | null>(null);
  const [code, setCode] = useState<number | null>(null);
  const [unit, setUnitState] = useState<TempUnit>(() => {
    const u = localStorage.getItem(UNIT_KEY);
    return u === 'F' ? 'F' : 'C';
  });
  const setUnit = useCallback((u: TempUnit) => {
    localStorage.setItem(UNIT_KEY, u);
    setUnitState(u);
  }, []);
  const temp = tempC === null
    ? null
    : unit === 'F'
      ? Math.round(tempC * 9 / 5 + 32)
      : tempC;
  const [locationName, setLocationName] = useState(() => {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return '';
    try { return (JSON.parse(raw) as StoredLocation).name ?? ''; } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWeather = useCallback(async (lat: number, lng: number, nameOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
      ).then((r) => r.json());
      setTempC(Math.round(weatherRes.current.temperature_2m));
      setCode(weatherRes.current.weather_code);

      if (nameOverride) {
        setLocationName(nameOverride);
      } else {
        const geo = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        )
          .then((r) => r.json())
          .catch(() => null);
        const addr = geo?.address as Record<string, string> | undefined;
        const name =
          addr?.city || addr?.town || addr?.village || addr?.county || addr?.state || 'Your location';
        setLocationName(name);
        // Persist resolved name so it shows correctly on next load without re-geocoding
        try {
          const stored = localStorage.getItem(LOCATION_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as StoredLocation;
            if (!parsed.name) {
              localStorage.setItem(LOCATION_KEY, JSON.stringify({ ...parsed, name }));
            }
          }
        } catch { /* ignore */ }
      }
    } catch {
      setError('Weather unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch whenever we get a location, refresh every 30 min
  useEffect(() => {
    if (!coords) return;
    fetchWeather(coords.lat, coords.lng);
    intervalRef.current = setInterval(
      () => fetchWeather(coords.lat, coords.lng),
      REFRESH_MS
    );
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [coords, fetchWeather]);

  const doGeoRequest = useCallback(() => {
    if (!navigator.geolocation) {
      setCoords(PERTH);
      setLocationStatus('denied');
      setLocationName(PERTH.name);
      return;
    }
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: StoredLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: Date.now(),
        };
        localStorage.setItem(LOCATION_KEY, JSON.stringify(c));
        setCoords({ lat: c.lat, lng: c.lng });
        setLocationStatus('ready');
      },
      () => {
        setCoords(PERTH);
        setLocationStatus('denied');
        setLocationName(PERTH.name);
      },
      { timeout: 10000 }
    );
  }, []);

  const requestLocation = useCallback(() => {
    // Allow refresh from a stale or denied state; idempotent if already requesting
    if (locationStatus === 'requesting') return;
    doGeoRequest();
  }, [locationStatus, doGeoRequest]);

  // Auto-refresh GPS once a week if we have a non-manual cached location
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCATION_KEY);
      if (!raw) {
        // No cached location at all → request once on first load
        doGeoRequest();
        return;
      }
      const parsed = JSON.parse(raw) as StoredLocation;
      if (parsed.manual) return; // user picked manually — never auto-refresh
      const age = Date.now() - (parsed.ts ?? 0);
      if (age > GPS_STALE_MS) doGeoRequest();
    } catch {
      // Ignore — leave cached coords in place
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetLocation = useCallback(() => {
    localStorage.removeItem(LOCATION_KEY);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCoords(null);
    setManualName(null);
    setTempC(null);
    setCode(null);
    setLocationName('');
    setError(null);
    doGeoRequest();
  }, [doGeoRequest]);

  const setManualLocation = useCallback((lat: number, lng: number, name: string) => {
    const stored: StoredLocation = { lat, lng, name, manual: true, ts: Date.now() };
    localStorage.setItem(LOCATION_KEY, JSON.stringify(stored));
    setManualName(name);
    setCoords({ lat, lng });
    setLocationStatus('ready');
  }, []);

  const value: WeatherState = {
    temp,
    code,
    locationName,
    loading,
    error,
    locationStatus,
    requestLocation,
    resetLocation,
    setManualLocation,
    unit,
    setUnit,
  };

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}

export function useWeather(): WeatherState {
  const ctx = useContext(WeatherContext);
  if (!ctx) throw new Error('useWeather must be used within WeatherProvider');
  return ctx;
}
