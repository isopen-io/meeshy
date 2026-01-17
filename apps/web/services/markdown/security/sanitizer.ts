/**
 * Markdown Parser - HTML Sanitization
 *
 * Prevents XSS attacks through HTML escaping and URL sanitization
 */

import { MAX_URL_LENGTH } from '../rules/constants';
import {
  SAFE_PROTOCOLS_PATTERN,
  RELATIVE_URL_PATTERN,
  DANGEROUS_PROTOCOLS_PATTERN,
  MEESHY_URL_FORMAT_PATTERN
} from '../rules/patterns';

/**
 * Escape HTML characters to prevent XSS
 * CVE Fix: Prevents injection of malicious HTML/JS
 *
 * @param text - Text to escape
 * @returns HTML-safe text
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
 *
 * @param url - URL to sanitize
 * @returns Safe URL or empty string if invalid
 *
 * @example
 * sanitizeUrl('https://example.com') // 'https://example.com'
 * sanitizeUrl('javascript:alert(1)') // ''
 * sanitizeUrl('m+ABC123') // 'm+ABC123'
 */
export const sanitizeUrl = (url: string | undefined): string => {
  if (!url) return '';

  // Limit URL length to prevent DoS - js-early-exit pattern
  if (url.length > MAX_URL_LENGTH) {
    return '';
  }

  const trimmedUrl = url.trim();

  // Allow relative URLs - js-early-exit pattern
  if (RELATIVE_URL_PATTERN.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Allow safe protocols - js-early-exit pattern
  if (SAFE_PROTOCOLS_PATTERN.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Check for m+TOKEN format (Meeshy tracking URLs) - js-early-exit pattern
  if (MEESHY_URL_FORMAT_PATTERN.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Block dangerous protocols - js-early-exit pattern
  if (DANGEROUS_PROTOCOLS_PATTERN.test(trimmedUrl)) {
    return '';
  }

  // Default: escape and return
  return escapeHtml(trimmedUrl);
};
