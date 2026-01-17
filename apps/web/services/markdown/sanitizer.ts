/**
 * HTML Sanitization Module
 * - HTML escaping to prevent XSS
 * - URL sanitization with protocol whitelist
 * - Security validations
 */

import { MAX_URL_LENGTH, PATTERNS } from './constants';

/**
 * Escape HTML characters to prevent XSS
 * CVE Fix: Prevents injection of malicious HTML/JS
 */
export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => map[char]);
};

/**
 * Sanitize URL to prevent XSS and other attacks
 * CVE Fix: Whitelist only safe protocols
 */
export const sanitizeUrl = (url: string | undefined): string => {
  if (!url) return '';

  // Limit URL length to prevent DoS
  if (url.length > MAX_URL_LENGTH) {
    return '';
  }

  const trimmedUrl = url.trim();

  // Allow relative URLs
  if (PATTERNS.relativeUrl.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Allow safe protocols
  if (PATTERNS.safeProtocols.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Check for m+TOKEN format (Meeshy tracking URLs)
  if (PATTERNS.meeshyToken.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Block dangerous protocols
  if (PATTERNS.dangerousProtocols.test(trimmedUrl)) {
    return '';
  }

  // Default: escape and return
  return escapeHtml(trimmedUrl);
};

/**
 * Convert Meeshy tracking URLs (m+TOKEN) to markdown links
 * Must be called BEFORE markdown parsing
 */
export const processMeeshyUrls = (text: string): string => {
  return text.replace(PATTERNS.meeshyUrl, (match) => {
    return `[${match}](${match})`;
  });
};
