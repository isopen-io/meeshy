/**
 * XSS Protection Utility
 * Sanitizes user-generated content to prevent XSS attacks
 *
 * Security Features:
 * - HTML sanitization with DOMPurify
 * - URL validation for external links
 * - Attribute escaping for HTML attributes
 * - Script tag removal
 * - Event handler removal (onclick, onerror, etc.)
 *
 * @author Meeshy Security Team
 * @version 1.0.0
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitization configuration
 */
const SANITIZE_CONFIG = {
  // Allowed HTML tags for rich text (minimal set)
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span'],

  // Allowed attributes
  ALLOWED_ATTR: ['href', 'title', 'class'],

  // Allowed URL protocols
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,

  // Maximum lengths
  MAX_TEXT_LENGTH: 10000,
  MAX_URL_LENGTH: 2048
};

/**
 * Sanitize plain text (strip ALL HTML)
 * Use for: notification titles, usernames, short text
 *
 * @param input - Raw text input
 * @returns Sanitized text with all HTML removed
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return '';

  // Strip ALL HTML tags and attributes
  const sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false
  });

  // Remove control characters and zero-width chars
  const cleaned = sanitized
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control chars
    .trim();

  // Enforce max length
  if (cleaned.length > SANITIZE_CONFIG.MAX_TEXT_LENGTH) {
    return cleaned.substring(0, SANITIZE_CONFIG.MAX_TEXT_LENGTH) + '...';
  }

  return cleaned;
}

/**
 * Sanitize HTML content (allows safe subset)
 * Use for: message content, rich text
 *
 * @param input - HTML content
 * @returns Sanitized HTML with only allowed tags
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: SANITIZE_CONFIG.ALLOWED_TAGS,
    ALLOWED_ATTR: SANITIZE_CONFIG.ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: SANITIZE_CONFIG.ALLOWED_URI_REGEXP,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    // Security hooks
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
}

/**
 * Escape HTML attribute values
 * Use for: dynamic HTML attributes
 *
 * @param input - Attribute value
 * @returns Escaped attribute value
 */
export function escapeAttribute(input: string | null | undefined): string {
  if (!input) return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and sanitize URL
 * Use for: external links, image sources
 *
 * @param input - URL string
 * @param allowedProtocols - Allowed protocols (default: https, http, mailto)
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeUrl(
  input: string | null | undefined,
  allowedProtocols: string[] = ['https:', 'http:', 'mailto:']
): string | null {
  if (!input) return null;

  // Remove whitespace
  const trimmed = input.trim();

  // Enforce max length
  if (trimmed.length > SANITIZE_CONFIG.MAX_URL_LENGTH) {
    console.warn('[XSS Protection] URL too long, rejected');
    return null;
  }

  try {
    const url = new URL(trimmed);

    // Check protocol
    if (!allowedProtocols.includes(url.protocol)) {
      console.warn(`[XSS Protection] Invalid protocol: ${url.protocol}`);
      return null;
    }

    // Block javascript: protocol (defense in depth)
    if (url.protocol === 'javascript:') {
      console.error('[XSS Protection] BLOCKED javascript: protocol');
      return null;
    }

    // Block data: URLs (can contain scripts)
    if (url.protocol === 'data:') {
      console.warn('[XSS Protection] Blocked data: URL');
      return null;
    }

    return url.toString();
  } catch (error) {
    console.warn('[XSS Protection] Invalid URL format:', error);
    return null;
  }
}

/**
 * Sanitize username/identifier
 * Use for: usernames, IDs, tags
 *
 * @param input - Username string
 * @param maxLength - Maximum length (default: 50)
 * @returns Sanitized username (alphanumeric + underscore + hyphen only)
 */
export function sanitizeUsername(
  input: string | null | undefined,
  maxLength: number = 50
): string {
  if (!input) return '';

  // Only allow: letters, numbers, underscore, hyphen, period
  const sanitized = input.replace(/[^a-zA-Z0-9_.-]/g, '');

  // Enforce max length
  return sanitized.substring(0, maxLength);
}

/**
 * Sanitize JSON data
 * Remove dangerous properties and nested scripts
 *
 * @param input - JSON object
 * @returns Sanitized object
 */
export function sanitizeJson(input: any): any {
  if (typeof input !== 'object' || input === null) {
    return typeof input === 'string' ? sanitizeText(input) : input;
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeJson(item));
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(input)) {
    // Block dangerous keys
    if (key.startsWith('__') || key.startsWith('$') || key === 'constructor' || key === 'prototype') {
      console.warn(`[XSS Protection] Blocked dangerous key: ${key}`);
      continue;
    }

    // Recursively sanitize
    if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeJson(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Truncate text safely (without breaking words)
 *
 * @param input - Text to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add (default: '...')
 * @returns Truncated text
 */
export function truncateText(
  input: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (!input || input.length <= maxLength) {
    return input;
  }

  // Find last space before max length
  const truncated = input.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

/**
 * Validate email address
 *
 * @param email - Email string
 * @returns true if valid email format
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Sanitize notification object
 * Apply appropriate sanitization to each field
 *
 * @param notification - Notification object
 * @returns Sanitized notification
 */
export function sanitizeNotification(notification: any): any {
  if (!notification) return null;

  return {
    ...notification,
    title: sanitizeText(notification.title),
    content: sanitizeText(notification.content),
    messagePreview: sanitizeText(notification.messagePreview),
    senderUsername: sanitizeUsername(notification.senderUsername),
    senderAvatar: sanitizeUrl(notification.senderAvatar, ['https:', 'http:']),

    // Sanitize nested context object
    context: notification.context ? {
      conversationId: sanitizeText(notification.context.conversationId),
      conversationTitle: sanitizeText(notification.context.conversationTitle),
      messageId: sanitizeText(notification.context.messageId),
      userId: sanitizeText(notification.context.userId)
    } : undefined,

    // Sanitize data JSON
    data: notification.data ? sanitizeJson(notification.data) : undefined
  };
}

/**
 * Test if string contains potential XSS
 * This is a heuristic check, not a complete validation
 *
 * @param input - String to test
 * @returns true if potential XSS detected
 */
export function containsXss(input: string | null | undefined): boolean {
  if (!input) return false;

  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onclick=/i,
    /onload=/i,
    /onmouseover=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /eval\(/i,
    /expression\(/i,
    /vbscript:/i,
    /data:text\/html/i
  ];

  return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Create Content Security Policy nonce
 * Use for inline scripts/styles
 */
export function generateCSPNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Validate and sanitize file name
 * Use for: uploaded files, attachments
 *
 * @param fileName - File name
 * @returns Sanitized file name
 */
export function sanitizeFileName(fileName: string | null | undefined): string {
  if (!fileName) return '';

  // Remove path traversal attempts
  const baseName = fileName.replace(/\.\./g, '').replace(/[/\\]/g, '');

  // Only allow: letters, numbers, underscore, hyphen, period
  const sanitized = baseName.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Enforce max length
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    const ext = sanitized.split('.').pop() || '';
    const nameWithoutExt = sanitized.substring(0, maxLength - ext.length - 1);
    return `${nameWithoutExt}.${ext}`;
  }

  return sanitized;
}

/**
 * Export default sanitization function
 * Alias for sanitizeText (most common use case)
 */
export default sanitizeText;
