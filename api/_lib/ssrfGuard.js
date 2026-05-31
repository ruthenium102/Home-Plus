// SSRF guard for server-side URL fetches (used by /api/import-recipe).
//
// Defends against requests to internal / link-local / metadata addresses by:
//   1. allowing only http(s) URLs with no embedded credentials,
//   2. resolving the hostname via DNS and rejecting if ANY resolved address
//      falls in a private/reserved range (this also normalises decimal/octal/
//      hex IP literals through the OS resolver),
//   3. following redirects manually and re-validating every hop.
//
// Residual risk: there is a TOCTOU window between the DNS check and the actual
// socket connect (classic DNS-rebinding). Fully closing it requires pinning the
// validated IP into the connection via a custom agent. This guard blocks the
// realistic attacks (direct internal IPs, 169.254.169.254 metadata, and
// redirect-to-internal) and raises the bar substantially.

import dns from 'node:dns/promises';
import net from 'node:net';

export class SsrfError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SsrfError';
  }
}

function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    n = (n << 8) + octet;
  }
  return n >>> 0;
}

function inV4Range(n, base, bits) {
  const baseLong = ipv4ToLong(base);
  if (baseLong === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (n & mask) === (baseLong & mask);
}

function isPrivateIPv4(ip) {
  const n = ipv4ToLong(ip);
  if (n === null) return true; // unparseable -> treat as unsafe
  return (
    inV4Range(n, '0.0.0.0', 8) || // "this" network
    inV4Range(n, '10.0.0.0', 8) || // private
    inV4Range(n, '100.64.0.0', 10) || // CGNAT
    inV4Range(n, '127.0.0.0', 8) || // loopback
    inV4Range(n, '169.254.0.0', 16) || // link-local incl. 169.254.169.254 metadata
    inV4Range(n, '172.16.0.0', 12) || // private
    inV4Range(n, '192.0.0.0', 24) || // IETF protocol assignments
    inV4Range(n, '192.168.0.0', 16) || // private
    inV4Range(n, '198.18.0.0', 15) || // benchmarking
    inV4Range(n, '224.0.0.0', 4) || // multicast
    inV4Range(n, '240.0.0.0', 4) // reserved
  );
}

function isPrivateIPv6(ip) {
  const addr = ip.toLowerCase().split('%')[0]; // strip zone id
  if (addr === '::1' || addr === '::') return true;
  const v4mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);
  const first = addr.split(':')[0];
  if (/^f[cd]/.test(first)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  if (/^ff/.test(first)) return true; // ff00::/8 multicast
  return false;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown family -> unsafe
}

// Validate a single URL: protocol, no credentials, and all resolved addresses
// must be public. Returns the parsed URL on success, throws SsrfError otherwise.
export async function assertSafeUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL');
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new SsrfError('Only http and https URLs are allowed');
  }
  if (u.username || u.password) {
    throw new SsrfError('Credentials in URL are not allowed');
  }
  const hostname = u.hostname.replace(/^\[/, '').replace(/\]$/, ''); // unwrap [ipv6]
  if (!hostname) throw new SsrfError('URL has no host');

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfError('Could not resolve host');
  }
  if (!addresses.length) throw new SsrfError('Could not resolve host');
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new SsrfError('URL resolves to a disallowed (internal) address');
    }
  }
  return u;
}

// fetch() with SSRF validation on the initial URL and on every redirect hop.
export async function safeFetch(rawUrl, options = {}, maxRedirects = 5) {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(current);
    const res = await fetch(current, { ...options, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError('Too many redirects');
}
