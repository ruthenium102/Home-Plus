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
const PERTH = { lat: -31.9505, lng: 115.8605, name: 'Perth' };
const REFRESH_MS = 30 * 60 * 1000; // 30 min

interface Coords {
  lat: number;
  lng: number;
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
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(() =>
    localStorage.getItem(LOCATION_KEY) ? 'ready' : 'idle'
  );
  const [coords, setCoords] = useState<Coords | null>(() => {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Coords;
    } catch {
      return null;
    }
  });
  const [temp, setTemp] = useState<number | null>(null);
  const [code, setCode] = useState<number | null>(null);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    try {
      const [weather, geo] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
        ).then((r) => r.json()),
        fetch(
          `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lng}`
        )
          .then((r) => r.json())
          .catch(() => null)
      ]);
      setTemp(Math.round(weather.current.temperature_2m));
      setCode(weather.current.weather_code);
      const place = (geo?.results as Array<{ name?: string; admin1?: string }> | undefined)?.[0];
      setLocationName(place?.name || place?.admin1 || 'Your location');
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
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        localStorage.setItem(LOCATION_KEY, JSON.stringify(c));
        setCoords(c);
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
    if (locationStatus !== 'idle') return;
    doGeoRequest();
  }, [locationStatus, doGeoRequest]);

  const resetLocation = useCallback(() => {
    localStorage.removeItem(LOCATION_KEY);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCoords(null);
    setTemp(null);
    setCode(null);
    setLocationName('');
    setError(null);
    // Immediately re-ask (status transitions idle→requesting inside doGeoRequest)
    doGeoRequest();
  }, [doGeoRequest]);

  const value: WeatherState = {
    temp,
    code,
    locationName,
    loading,
    error,
    locationStatus,
    requestLocation,
    resetLocation
  };

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}

export function useWeather(): WeatherState {
  const ctx = useContext(WeatherContext);
  if (!ctx) throw new Error('useWeather must be used within WeatherProvider');
  return ctx;
}
