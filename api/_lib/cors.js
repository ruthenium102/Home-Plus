// Reflected CORS allow-list for the Vercel API functions (S5).
// These endpoints authenticate via Bearer tokens (not cookies), so a '*'
// origin wasn't credential-leaking — but a tight allow-list is cheap
// insurance against a future cookie-auth footgun and matches the send-invite
// Edge Function's approach.
const ALLOWED_ORIGINS = [
  'https://home-plus-lyart.vercel.app', // prod web
  'capacitor://localhost', // iOS WKWebView app origin
  'http://localhost:5173', // vite dev server
];

export function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers?.origin;
  res.setHeader(
    'Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  );
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
