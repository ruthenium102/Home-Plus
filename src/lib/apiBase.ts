// Resolve an absolute-path API route (e.g. "/api/voice-intake") to a fetchable
// URL.
//
// On the web (Vercel) and in local dev the app is served from the same origin
// as the /api routes, so a relative path works and hits the Vite proxy in dev.
// Inside the iOS WKWebView the app is served from capacitor://localhost, so a
// bare /api/... path would resolve to capacitor://localhost/api/... and 404.
//
// VITE_API_BASE can override the origin at build time, but the native build
// must NEVER ship with a relative base — account deletion and every other
// /api call would silently break on device (App Review rejection material).
// So when the env var is unset and we're running natively, fall back to the
// deployed origin instead of trusting the build pipeline to remember it.
import { Capacitor } from '@capacitor/core';

const PROD_ORIGIN = 'https://home-plus-lyart.vercel.app';

const configured = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const API_BASE = configured || (Capacitor.isNativePlatform() ? PROD_ORIGIN : '');

/** Prefix an absolute "/api/..." path with the API origin when required. */
export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}
