// Resolve an absolute-path API route (e.g. "/api/voice-intake") to a fetchable
// URL.
//
// On the web (Vercel) and in local dev the app is served from the same origin
// as the /api routes, so a relative path works and hits the Vite proxy in dev.
// Inside the iOS WKWebView the app is served from capacitor://localhost, so a
// bare /api/... path would resolve to capacitor://localhost/api/... and 404.
// The prod (iOS) build therefore sets VITE_API_BASE to the deployed origin
// (https://home-plus-lyart.vercel.app) and we prefix every API call with it.
//
// When VITE_API_BASE is unset (local dev / same-origin web) we leave the path
// relative so nothing changes.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

/** Prefix an absolute "/api/..." path with VITE_API_BASE when configured. */
export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}
