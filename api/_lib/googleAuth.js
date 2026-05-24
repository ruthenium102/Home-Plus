// OAuth 2.0 helpers for Google Calendar. We only ever request the calendar
// scope — no Gmail, no profile beyond email (returned implicitly with openid).
//
// Env vars expected:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REDIRECT_URI   e.g. https://homeplus.app/api/google/callback

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
];

export function getOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth env vars missing. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI in Vercel.',
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state) {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // 'consent' forces Google to re-issue a refresh_token even if the user has
    // previously authorized the app — otherwise repeat connects silently
    // succeed without giving us a refresh token to store.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return await res.json();
}

export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getOAuthConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  return await res.json();
}

// Revoke a refresh or access token. Best-effort — Google returns 200 on
// success, 400 if the token is already revoked. We swallow non-200 since
// the user's intent is "disconnect" either way.
export async function revokeToken(token) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  } catch {
    // ignore
  }
}

// Decode the id_token (JWT) to extract the user's Google email. We don't
// verify the signature here because we just received the token over TLS
// directly from Google in the code exchange — verification is only needed
// when accepting tokens from untrusted sources.
export function emailFromIdToken(idToken) {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}
