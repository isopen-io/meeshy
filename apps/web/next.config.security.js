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
 * Content Security Policy
 * Prevents XSS, clickjacking, and other code injection attacks
 */
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.socket.io;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data:;
  connect-src 'self' wss://${process.env.NEXT_PUBLIC_API_DOMAIN || 'localhost:3001'} https://${process.env.NEXT_PUBLIC_API_DOMAIN || 'localhost:3001'};
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
 * Firebase call, an image host) — and this file's `connect-src` already read
 * `NEXT_PUBLIC_API_DOMAIN`, an env var that does not exist anywhere in this
 * repo (production sets `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`, see
 * `docker-compose.prod.yml`), so it would have resolved to the `localhost:3001`
 * fallback in every real environment and blocked the app's own API/WS traffic.
 * Wiring CSP in needs a real allowlist audit (gateway, translator, static
 * asset host, Firebase/FCM domains, image remote patterns) verified against a
 * running environment — tracked separately (#3628 follow-up). Until then,
 * only the non-CSP hardening headers below are wired into `next.config.ts`.
 */
const nonCspSecurityHeaders = securityHeaders.filter(
  (header) => header.key !== 'Content-Security-Policy'
);

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
  ContentSecurityPolicy
};
