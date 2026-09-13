/**
 * Next.js Security Configuration
 * Content Security Policy and Security Headers
 *
 * This file contains security headers to be merged into next.config.js
 *
 * @version 1.0.0
 * @author Meeshy Security Team
 */

/**
 * Extracts "scheme://host[:port]" from a full URL, dropping any path/query
 * (e.g. `NEXT_PUBLIC_TRANSLATION_URL=https://ml.meeshy.me/translate` in
 * prod — CSP source expressions want the origin, not the path). Returns
 * `null` on an unset or malformed value so callers can fall back.
 */
function originOf(url) {
  if (!url) return null;
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}`;
  } catch {
    return null;
  }
}

// Google/Firebase domains used by `firebase/app` + `firebase/messaging`
// (see apps/web/firebase-config.ts, utils/fcm-manager.ts) — the project ID
// varies by env (NEXT_PUBLIC_FIREBASE_*), but the API/CDN hosts do not.
const GOOGLE_API_ORIGIN = 'https://*.googleapis.com';
const GOOGLE_STATIC_ORIGIN = 'https://www.gstatic.com';

/**
 * The service origins this app calls over `fetch`/WebSocket: gateway (API +
 * WS), translator, static assets. Every compose file (dev, local, prod —
 * `infrastructure/docker/compose/*.yml`) sets `NEXT_PUBLIC_API_URL` /
 * `NEXT_PUBLIC_WS_URL` / `NEXT_PUBLIC_TRANSLATION_URL` /
 * `NEXT_PUBLIC_STATIC_URL` to the exact origin of that deployment. Reading
 * them here means the CSP always matches what the browser actually calls,
 * with no domain-pattern guessing — unlike the previous `NEXT_PUBLIC_API_DOMAIN`,
 * which is not set by any compose file and would have resolved to the
 * `localhost:3001` fallback in every real environment (#5728).
 * Defaults below cover a bare `next dev` / tmux "meeshy" run with no
 * compose file and no `.env` (translator :8000, gateway :3000 — see root
 * CLAUDE.md "Local Services").
 */
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:3000';
const wsOrigin = originOf(process.env.NEXT_PUBLIC_WS_URL) || 'ws://localhost:3000';
const translationOrigin = originOf(process.env.NEXT_PUBLIC_TRANSLATION_URL) || 'http://localhost:8000';
const staticOrigin = originOf(process.env.NEXT_PUBLIC_STATIC_URL);

const connectSrcOrigins = [
  "'self'",
  apiOrigin,
  wsOrigin,
  translationOrigin,
  ...(staticOrigin ? [staticOrigin] : []),
  GOOGLE_API_ORIGIN,
].join(' ');

/**
 * Content Security Policy
 * Prevents XSS, clickjacking, and other code injection attacks
 */
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.socket.io ${GOOGLE_STATIC_ORIGIN};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data:;
  connect-src ${connectSrcOrigins};
  media-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.trim().replace(/\s{2,}/g, ' ');

/**
 * Security Headers
 * Comprehensive security headers following OWASP recommendations
 */
const securityHeaders = [
  // Content Security Policy
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy
  },

  // Prevent clickjacking attacks
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },

  // Prevent MIME type sniffing
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },

  // Control referrer information
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },

  // Feature policy — camera/microphone/geolocation stay ALLOWED for the app's
  // own origin: Meeshy is a calling + voice-message + live-location product
  // (services/webrtc-service.ts, hooks/use-voice-recording.ts,
  // lib/geolocation.ts). `camera=()` / `microphone=()` (empty allowlist) would
  // deny the feature to EVERY context, including same-origin — that would
  // have silently broken calls, voice recording and location sharing in
  // production the moment this header shipped.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()'
  },

  // XSS Protection (legacy but still useful)
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },

  // Force HTTPS (production only)
  ...(process.env.NODE_ENV === 'production' ? [{
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  }] : []),

  // Prevent DNS prefetching
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'off'
  },

  // Download options (IE8+ legacy)
  {
    key: 'X-Download-Options',
    value: 'noopen'
  }
];

/**
 * `securityHeaders` minus Content-Security-Policy.
 *
 * CSP is an ALLOWLIST: shipping it wrong doesn't warn anyone, it silently
 * blocks whatever it forgot (a WebSocket to the real gateway domain, a
 * Firebase call, an image host). Wired unconditionally into `next.config.ts`.
 */
const nonCspSecurityHeaders = securityHeaders.filter(
  (header) => header.key !== 'Content-Security-Policy'
);

/**
 * CSP served as `Content-Security-Policy-Report-Only` — logs violations
 * instead of blocking (#5728). The allowlist above is now built from the
 * real per-deployment env vars rather than a nonexistent one, but it has
 * only been verified by reading code, never against a running staging
 * environment (connexion, appel, notification push, upload — see #5728
 * critère de fin). Report-only is the safe first step this repo's own issue
 * names: promoting it to the blocking `Content-Security-Policy` header
 * belongs to whoever can watch the report endpoint / browser console on a
 * real environment first.
 */
const reportOnlyCspHeader = [
  {
    key: 'Content-Security-Policy-Report-Only',
    value: ContentSecurityPolicy,
  },
];

/**
 * Export security headers configuration
 * Use in next.config.js:
 *
 * const { nonCspSecurityHeaders } = require('./next.config.security');
 *
 * module.exports = {
 *   async headers() {
 *     return [
 *       {
 *         source: '/:path*',
 *         headers: nonCspSecurityHeaders
 *       }
 *     ];
 *   }
 * };
 */
module.exports = {
  securityHeaders,
  nonCspSecurityHeaders,
  reportOnlyCspHeader,
  ContentSecurityPolicy
};
