/// <reference types="vite/client" />

declare const __BUILD_DATE__: string;
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // Absolute origin for the serverless /api routes. Must be set in the prod
  // (iOS) build (e.g. https://home-plus-lyart.vercel.app) because bare /api
  // paths resolve to capacitor://localhost inside WKWebView. Unset in local
  // dev so requests stay relative and hit the Vite proxy.
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
