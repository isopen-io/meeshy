/**
 * Security Sanitization Utility
 *
 * Provides comprehensive input sanitization to prevent:
 * - XSS (Cross-Site Scripting)
 * - HTML Injection
 * - Script Injection
 * - NoSQL Injection
 *
 * @module sanitize
 */

import DOMPurify from 'isomorphic-dompurify';
import { createHash } from 'crypto';

export class SecuritySanitizer {
  /**
   * Sanitize plain text content - strips ALL HTML tags and dangerous characters
   * Use for: notification titles, content, message previews, usernames
   *
   * @param input - Raw user input
   * @returns Sanitized safe text
   */
  static sanitizeText(input: string | null | undefined): string {
    if (!input) return '';

    // Strip ALL HTML tags and attributes using DOMPurify
    const sanitized = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],        // No HTML allowed
      ALLOWED_ATTR: [],        // No attributes allowed
      KEEP_CONTENT: true,      // Keep text content
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      FORCE_BODY: false
    });

    // Additional protection: remove zero-width characters and control chars
    return sanitized
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars (invisible)
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control chars
      .replace(/[\uFFF9-\uFFFB]/g, '') // Interlinear annotation chars
      .trim();
  }

  /**
   * Sanitize rich text content - allows safe HTML subset for formatted text
   * Use for: message content with formatting (if needed in future)
   *
   * @param input - Rich text input
   * @returns Sanitized HTML with only safe tags
   */
  static sanitizeRichText(input: string | null | undefined): string {
    if (!input) return '';

    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
      KEEP_CONTENT: true,
      // Force rel="noopener noreferrer" on all links
      ADD_ATTR: ['target'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    });
  }

  /**
   * Sanitize JSON data object - removes dangerous properties and nested HTML
   * Use for: notification data field, metadata objects
   *
   * @param input - JSON object with potential unsafe data
   * @returns Sanitized object
   */
  static sanitizeJSON(input: any): any {
    if (typeof input !== 'object' || input === null) {
      if (typeof input === 'string') {
        return this.sanitizeText(input);
      }
      return input;
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeJSON(item));
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(input)) {
      // Block dangerous keys (MongoDB operators, prototype pollution)
      if (key.startsWith('__') || key.startsWith('$') || key === 'constructor' || key === 'prototype') {
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeJSON(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate and sanitize URLs - only allows safe protocols
   * Use for: senderAvatar, file URLs, external links
   *
   * @param input - URL string
   * @returns Sanitized URL or null if invalid/dangerous
   */
  static sanitizeURL(input: string | null | undefined): string | null {
    if (!input) return null;

    try {
      const url = new URL(input);

      // Only allow safe protocols
      const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
      if (!allowedProtocols.includes(url.protocol)) {
        return null;
      }

      // Block javascript: protocol explicitly (paranoid check)
      if (url.protocol.toLowerCase().includes('javascript')) {
        return null;
      }

      // Block data: URLs (can contain XSS)
      if (url.protocol === 'data:') {
        return null;
      }

      return url.toString();
    } catch (error) {
      // Invalid URL format
      return null;
    }
  }

  /**
   * Sanitize username/identifier - only alphanumeric, underscore, hyphen
   * Use for: usernames, conversation identifiers
   *
   * @param input - Username string
   * @returns Sanitized username
   */
  static sanitizeUsername(input: string | null | undefined): string {
    if (!input) return '';

    // Only allow alphanumeric, underscore, hyphen, and period
    return input
      .replace(/[^a-zA-Z0-9_.-]/g, '')
      .substring(0, 50) // Max 50 chars
      .trim();
  }

  /**
   * Sanitize email address
   * Use for: email inputs
   *
   * @param input - Email string
   * @returns Sanitized email or null if invalid
   */
  static sanitizeEmail(input: string | null | undefined): string | null {
    if (!input) return null;

    // Basic email validation regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const sanitized = input.trim().toLowerCase();

    if (!emailRegex.test(sanitized)) {
      return null;
    }

    return sanitized;
  }

  /**
   * Truncate string safely to max length
   * Use for: limiting content length
   *
   * @param input - String to truncate
   * @param maxLength - Maximum length
   * @returns Truncated string with ellipsis if needed
   */
  static truncate(input: string, maxLength: number): string {
    if (!input || input.length <= maxLength) {
      return input;
    }

    return input.substring(0, maxLength).trim() + '...';
  }

  /**
   * Hash sensitive data for logging (PII protection)
   * Use for: logging userId, email, IP addresses
   *
   * @param input - Sensitive data to hash
   * @returns First 16 chars of SHA-256 hash
   */
  static hashForLogging(input: string | null | undefined): string {
    if (!input) return 'unknown';

    return createHash('sha256')
      .update(input)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Sanitize MongoDB query object - removes operators to prevent injection
   * Use for: middleware to sanitize request.query and request.body
   *
   * @param obj - Query object
   * @returns Sanitized query without MongoDB operators
   */
  static sanitizeMongoQuery(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeMongoQuery(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Block MongoDB operators ($ne, $gt, $regex, $where, etc.)
      if (key.startsWith('$')) {
        continue;
      }

      // Recursively sanitize nested objects
      sanitized[key] = typeof value === 'object' && value !== null
        ? this.sanitizeMongoQuery(value)
        : value;
    }

    return sanitized;
  }

  /**
   * Validate notification type against whitelist
   *
   * @param type - Notification type string
   * @returns true if valid, false otherwise
   */
  static isValidNotificationType(type: string): boolean {
    const validTypes = [
      'new_message',
      'new_conversation_direct',
      'new_conversation_group',
      'message_reply',
      'member_joined',
      'contact_request',
      'contact_accepted',
      'friend_request',
      'friend_accepted',
      'user_mentioned',
      'message_reaction',
      'missed_call',
      'system',
      'new_conversation',
      'message_edited',
      'translation_ready',
    ];

    return validTypes.includes(type);
  }

  /**
   * Validate notification priority against whitelist
   *
   * @param priority - Priority string
   * @returns true if valid, false otherwise
   */
  static isValidPriority(priority: string): boolean {
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    return validPriorities.includes(priority);
  }
}

/**
 * Helper function for quick text sanitization
 */
export function sanitizeNotificationContent(content: string): string {
  return SecuritySanitizer.sanitizeText(content);
}

/**
 * Helper function for user input sanitization
 */
export function sanitizeUserInput(input: string): string {
  return SecuritySanitizer.sanitizeText(input);
}

/**
 * Helper function to escape HTML entities
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
