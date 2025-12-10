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

  // Feature policy (disable unused features)
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
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
 * Export security headers configuration
 * Use in next.config.js:
 *
 * const { securityHeaders } = require('./next.config.security');
 *
 * module.exports = {
 *   async headers() {
 *     return [
 *       {
 *         source: '/:path*',
 *         headers: securityHeaders
 *       }
 *     ];
 *   }
 * };
 */
module.exports = {
  securityHeaders,
  ContentSecurityPolicy
};
