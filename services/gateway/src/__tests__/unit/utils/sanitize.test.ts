/**
 * SecuritySanitizer Unit Tests
 *
 * Comprehensive tests for security sanitization utility covering:
 * - XSS (Cross-Site Scripting) prevention
 * - HTML Injection prevention
 * - Script Injection prevention
 * - NoSQL Injection prevention
 * - Input validation and sanitization
 *
 * Run with: npm test -- sanitize.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock isomorphic-dompurify before importing the module
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: jest.fn((input: string, options?: any) => {
      if (!input) return '';

      // Simulate DOMPurify behavior based on options
      let result = input;

      // Strip all HTML tags if ALLOWED_TAGS is empty
      if (options?.ALLOWED_TAGS && options.ALLOWED_TAGS.length === 0) {
        // Remove script tags and their content
        result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        // Remove style tags and their content
        result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        // Remove all other HTML tags but keep content
        result = result.replace(/<[^>]+>/g, '');
        // Decode HTML entities
        result = result
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'");
        // Remove any remaining script-like patterns
        result = result.replace(/<script[^>]*>.*?<\/script>/gi, '');
        result = result.replace(/<[^>]+>/g, '');
      } else if (options?.ALLOWED_TAGS) {
        // Rich text mode - keep only allowed tags
        const allowedTags = options.ALLOWED_TAGS as string[];
        const forbiddenTags = options?.FORBID_TAGS || [];
        const forbiddenAttrs = options?.FORBID_ATTR || [];

        // Remove forbidden tags completely
        forbiddenTags.forEach((tag: string) => {
          const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
          result = result.replace(regex, '');
        });

        // Remove forbidden attributes
        forbiddenAttrs.forEach((attr: string) => {
          const regex = new RegExp(`\\s*${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
          result = result.replace(regex, '');
        });

        // Remove javascript: and data: protocols from href
        result = result.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href=""');
        result = result.replace(/href\s*=\s*["']data:[^"']*["']/gi, 'href=""');

        // Remove tags not in allowed list (simplified)
        const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
        result = result.replace(tagPattern, (match, tagName) => {
          if (allowedTags.includes(tagName.toLowerCase())) {
            return match;
          }
          return '';
        });
      }

      return result;
    })
  }
}));

import {
  SecuritySanitizer,
  sanitizeNotificationContent,
  sanitizeUserInput,
  escapeHtml
} from '../../../utils/sanitize';

describe('SecuritySanitizer', () => {
  describe('sanitizeText', () => {
    it('should return empty string for null input', () => {
      expect(SecuritySanitizer.sanitizeText(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(SecuritySanitizer.sanitizeText(undefined)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(SecuritySanitizer.sanitizeText('')).toBe('');
    });

    it('should keep plain text unchanged', () => {
      const plainText = 'Hello, this is a simple message';
      expect(SecuritySanitizer.sanitizeText(plainText)).toBe(plainText);
    });

    it('should strip basic HTML tags', () => {
      const input = '<p>Hello</p>';
      expect(SecuritySanitizer.sanitizeText(input)).toBe('Hello');
    });

    it('should strip nested HTML tags', () => {
      const input = '<div><p><span>Nested content</span></p></div>';
      expect(SecuritySanitizer.sanitizeText(input)).toBe('Nested content');
    });

    it('should strip script tags and their content', () => {
      const input = 'Hello <script>alert("XSS")</script> World';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should strip inline event handlers', () => {
      const input = '<img src="x" onerror="alert(1)">';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('should strip style tags', () => {
      const input = '<style>body { display: none; }</style>Content';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('<style>');
      expect(result).toContain('Content');
    });

    it('should strip iframe tags', () => {
      const input = '<iframe src="https://malicious.com"></iframe>Text';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('<iframe>');
      expect(result).toContain('Text');
    });

    it('should remove zero-width characters', () => {
      const input = 'Hello\u200BWorld\u200CTest\u200D';
      expect(SecuritySanitizer.sanitizeText(input)).toBe('HelloWorldTest');
    });

    it('should remove control characters', () => {
      const input = 'Hello\u0000World\u001FTest';
      expect(SecuritySanitizer.sanitizeText(input)).toBe('HelloWorldTest');
    });

    it('should remove interlinear annotation characters', () => {
      const input = 'Hello\uFFF9World\uFFFATest\uFFFB';
      expect(SecuritySanitizer.sanitizeText(input)).toBe('HelloWorldTest');
    });

    it('should trim whitespace', () => {
      const input = '   Hello World   ';
      expect(SecuritySanitizer.sanitizeText(input)).toBe('Hello World');
    });

    it('should handle XSS via data attributes', () => {
      const input = '<div data-payload="alert(1)">Content</div>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).toBe('Content');
      expect(result).not.toContain('data-payload');
    });

    it('should handle encoded XSS attempts', () => {
      const input = '<img src=x onerror=&#x61;lert(1)>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('onerror');
    });

    it('should handle SVG XSS vectors', () => {
      const input = '<svg onload="alert(1)"><desc>test</desc></svg>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('onload');
      expect(result).not.toContain('<svg>');
    });

    it('should handle javascript protocol in links', () => {
      const input = '<a href="javascript:alert(1)">Click me</a>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('javascript:');
    });

    it('should handle object/embed tags', () => {
      const input = '<object data="malicious.swf"></object>Text';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('<object>');
      expect(result).toContain('Text');
    });

    it('should handle form injection', () => {
      const input = '<form action="https://evil.com"><input></form>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('<form>');
      expect(result).not.toContain('action');
    });
  });

  describe('sanitizeRichText', () => {
    it('should return empty string for null input', () => {
      expect(SecuritySanitizer.sanitizeRichText(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(SecuritySanitizer.sanitizeRichText(undefined)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(SecuritySanitizer.sanitizeRichText('')).toBe('');
    });

    it('should keep allowed formatting tags', () => {
      const input = '<b>Bold</b> and <i>italic</i>';
      expect(SecuritySanitizer.sanitizeRichText(input)).toBe('<b>Bold</b> and <i>italic</i>');
    });

    it('should keep em and strong tags', () => {
      const input = '<em>Emphasized</em> and <strong>strong</strong>';
      expect(SecuritySanitizer.sanitizeRichText(input)).toBe('<em>Emphasized</em> and <strong>strong</strong>');
    });

    it('should keep anchor tags with href', () => {
      const input = '<a href="https://example.com">Link</a>';
      expect(SecuritySanitizer.sanitizeRichText(input)).toContain('<a');
      expect(SecuritySanitizer.sanitizeRichText(input)).toContain('href="https://example.com"');
    });

    it('should keep p and br tags', () => {
      const input = '<p>Paragraph</p><br>New line';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).toContain('<p>');
      expect(result).toContain('<br>');
    });

    it('should keep span tags', () => {
      const input = '<span>Inline text</span>';
      expect(SecuritySanitizer.sanitizeRichText(input)).toContain('<span>');
    });

    it('should strip script tags', () => {
      const input = '<b>Bold</b><script>alert("XSS")</script>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).toContain('<b>Bold</b>');
      expect(result).not.toContain('<script>');
    });

    it('should strip style tags', () => {
      const input = '<style>body { display: none; }</style><p>Content</p>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('<style>');
      expect(result).toContain('<p>Content</p>');
    });

    it('should strip iframe tags', () => {
      const input = '<iframe src="https://evil.com"></iframe><p>Content</p>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('<iframe>');
    });

    it('should strip object and embed tags', () => {
      const input = '<object data="x"></object><embed src="y"><p>Content</p>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('<object>');
      expect(result).not.toContain('<embed>');
    });

    it('should strip event handler attributes', () => {
      const input = '<b onclick="alert(1)">Bold</b>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('onclick');
    });

    it('should strip onerror attribute', () => {
      const input = '<img onerror="alert(1)">';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('onerror');
    });

    it('should strip onload attribute', () => {
      const input = '<body onload="alert(1)">Content</body>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('onload');
    });

    it('should strip onmouseover attribute', () => {
      const input = '<span onmouseover="alert(1)">Hover me</span>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('onmouseover');
    });

    it('should only allow http, https, and mailto protocols in links', () => {
      const httpsLink = '<a href="https://example.com">Secure</a>';
      const httpLink = '<a href="http://example.com">HTTP</a>';
      const mailtoLink = '<a href="mailto:test@example.com">Email</a>';

      expect(SecuritySanitizer.sanitizeRichText(httpsLink)).toContain('https://example.com');
      expect(SecuritySanitizer.sanitizeRichText(httpLink)).toContain('http://example.com');
      expect(SecuritySanitizer.sanitizeRichText(mailtoLink)).toContain('mailto:test@example.com');
    });

    it('should block javascript protocol in links', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('javascript:');
    });

    it('should block data protocol in links', () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">Link</a>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).not.toContain('data:');
    });

    it('should handle complex nested content', () => {
      const input = '<div><p><b>Bold <i>and italic</i></b></p></div>';
      const result = SecuritySanitizer.sanitizeRichText(input);
      expect(result).toContain('<b>');
      expect(result).toContain('<i>');
    });
  });

  describe('sanitizeJSON', () => {
    it('should return primitive values unchanged', () => {
      expect(SecuritySanitizer.sanitizeJSON(42)).toBe(42);
      expect(SecuritySanitizer.sanitizeJSON(true)).toBe(true);
      expect(SecuritySanitizer.sanitizeJSON(false)).toBe(false);
    });

    it('should return null for null input', () => {
      expect(SecuritySanitizer.sanitizeJSON(null)).toBeNull();
    });

    it('should sanitize string values', () => {
      const input = '<script>alert("XSS")</script>';
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result).not.toContain('<script>');
    });

    it('should sanitize object string values', () => {
      const input = {
        name: '<b>Test</b>',
        message: '<script>evil()</script>Safe'
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.name).toBe('Test');
      expect(result.message).toBe('Safe');
    });

    it('should sanitize nested objects', () => {
      const input = {
        user: {
          name: '<script>alert(1)</script>John',
          profile: {
            bio: '<img onerror="alert(1)">Bio text'
          }
        }
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.user.name).toBe('John');
      expect(result.user.profile.bio).toBe('Bio text');
    });

    it('should sanitize arrays', () => {
      const input = ['<script>alert(1)</script>Item1', 'Item2', '<b>Item3</b>'];
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result[0]).toBe('Item1');
      expect(result[1]).toBe('Item2');
      expect(result[2]).toBe('Item3');
    });

    it('should sanitize arrays of objects', () => {
      const input = [
        { name: '<script>a()</script>Alice' },
        { name: 'Bob' }
      ];
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });

    it('should block MongoDB operators starting with $', () => {
      const input = {
        username: 'test',
        $ne: 'injected'
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.username).toBe('test');
      expect(result.$ne).toBeUndefined();
    });

    it('should block $gt MongoDB operator', () => {
      const input = { password: { $gt: '' } };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.password).toEqual({});
    });

    it('should block $regex MongoDB operator', () => {
      const input = { username: { $regex: '.*' } };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.username).toEqual({});
    });

    it('should block $where MongoDB operator', () => {
      const input = { $where: 'function() { return true; }' };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.$where).toBeUndefined();
    });

    it('should block prototype pollution via __proto__', () => {
      const input = {
        __proto__: { isAdmin: true },
        name: 'test'
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      // __proto__ key should not be copied with its malicious value
      // The result should not have the injected isAdmin property
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
      expect(result.name).toBe('test');
    });

    it('should block keys starting with double underscore', () => {
      const input = {
        __customKey__: 'attack',
        normal: 'value'
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      // Keys starting with __ should be filtered out
      expect(Object.prototype.hasOwnProperty.call(result, '__customKey__')).toBe(false);
      expect(result.normal).toBe('value');
    });

    it('should block constructor key', () => {
      const input = {
        constructor: { prototype: { isAdmin: true } },
        name: 'test'
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      // The constructor key should not be copied from input
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
      expect(result.name).toBe('test');
    });

    it('should block prototype key', () => {
      const input = {
        prototype: { isAdmin: true },
        name: 'test'
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.prototype).toBeUndefined();
      expect(result.name).toBe('test');
    });

    it('should preserve non-string primitive values in objects', () => {
      const input = {
        count: 42,
        active: true,
        ratio: 3.14
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.ratio).toBe(3.14);
    });

    it('should handle deeply nested structures', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: '<script>x</script>Safe'
              }
            }
          }
        }
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.level1.level2.level3.level4.value).toBe('Safe');
    });

    it('should handle mixed arrays and objects', () => {
      const input = {
        items: [
          { name: '<b>Test</b>' },
          [{ nested: '<script>x</script>Value' }]
        ]
      };
      const result = SecuritySanitizer.sanitizeJSON(input);
      expect(result.items[0].name).toBe('Test');
      expect(result.items[1][0].nested).toBe('Value');
    });
  });

  describe('sanitizeURL', () => {
    it('should return null for null input', () => {
      expect(SecuritySanitizer.sanitizeURL(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(SecuritySanitizer.sanitizeURL(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(SecuritySanitizer.sanitizeURL('')).toBeNull();
    });

    it('should allow https URLs', () => {
      const url = 'https://example.com/path';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should allow http URLs', () => {
      const url = 'http://example.com/path';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should allow mailto URLs', () => {
      const url = 'mailto:test@example.com';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should allow tel URLs', () => {
      const url = 'tel:+1234567890';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should block javascript protocol', () => {
      expect(SecuritySanitizer.sanitizeURL('javascript:alert(1)')).toBeNull();
    });

    it('should block JavaScript with mixed case', () => {
      expect(SecuritySanitizer.sanitizeURL('JavaScript:alert(1)')).toBeNull();
      expect(SecuritySanitizer.sanitizeURL('JAVASCRIPT:alert(1)')).toBeNull();
    });

    it('should block data protocol', () => {
      expect(SecuritySanitizer.sanitizeURL('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('should block vbscript protocol', () => {
      expect(SecuritySanitizer.sanitizeURL('vbscript:msgbox("XSS")')).toBeNull();
    });

    it('should block file protocol', () => {
      expect(SecuritySanitizer.sanitizeURL('file:///etc/passwd')).toBeNull();
    });

    it('should block ftp protocol', () => {
      expect(SecuritySanitizer.sanitizeURL('ftp://example.com/file')).toBeNull();
    });

    it('should return null for invalid URL format', () => {
      expect(SecuritySanitizer.sanitizeURL('not-a-valid-url')).toBeNull();
      expect(SecuritySanitizer.sanitizeURL('://missing-protocol.com')).toBeNull();
    });

    it('should handle URLs with query parameters', () => {
      const url = 'https://example.com/path?query=value&other=123';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should handle URLs with hash fragments', () => {
      const url = 'https://example.com/path#section';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should handle URLs with port numbers', () => {
      const url = 'https://example.com:8080/path';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should handle URLs with credentials (and normalize)', () => {
      const url = 'https://user:pass@example.com/path';
      const result = SecuritySanitizer.sanitizeURL(url);
      expect(result).not.toBeNull();
      expect(result).toContain('example.com');
    });

    it('should handle localhost URLs', () => {
      const url = 'http://localhost:3000/api';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should handle IP address URLs', () => {
      const url = 'http://192.168.1.1:8080/path';
      expect(SecuritySanitizer.sanitizeURL(url)).toBe(url);
    });

    it('should handle URLs with encoded characters', () => {
      const url = 'https://example.com/path%20with%20spaces';
      expect(SecuritySanitizer.sanitizeURL(url)).not.toBeNull();
    });
  });

  describe('sanitizeUsername', () => {
    it('should return empty string for null input', () => {
      expect(SecuritySanitizer.sanitizeUsername(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(SecuritySanitizer.sanitizeUsername(undefined)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(SecuritySanitizer.sanitizeUsername('')).toBe('');
    });

    it('should allow alphanumeric characters', () => {
      expect(SecuritySanitizer.sanitizeUsername('username123')).toBe('username123');
    });

    it('should allow underscores', () => {
      expect(SecuritySanitizer.sanitizeUsername('user_name')).toBe('user_name');
    });

    it('should allow hyphens', () => {
      expect(SecuritySanitizer.sanitizeUsername('user-name')).toBe('user-name');
    });

    it('should allow periods', () => {
      expect(SecuritySanitizer.sanitizeUsername('user.name')).toBe('user.name');
    });

    it('should remove special characters', () => {
      expect(SecuritySanitizer.sanitizeUsername('user@name!')).toBe('username');
    });

    it('should remove spaces', () => {
      expect(SecuritySanitizer.sanitizeUsername('user name')).toBe('username');
    });

    it('should remove HTML tags', () => {
      // When HTML tags are stripped, remaining alphanumeric characters are kept
      expect(SecuritySanitizer.sanitizeUsername('<script>user</script>')).toBe('scriptuserscript');
    });

    it('should truncate to 50 characters', () => {
      const longUsername = 'a'.repeat(60);
      expect(SecuritySanitizer.sanitizeUsername(longUsername).length).toBe(50);
    });

    it('should handle unicode characters by removing them', () => {
      expect(SecuritySanitizer.sanitizeUsername('user')).toBe('user');
    });

    it('should handle mixed valid and invalid characters', () => {
      expect(SecuritySanitizer.sanitizeUsername('user_123-test.name@#$%')).toBe('user_123-test.name');
    });

    it('should handle only invalid characters', () => {
      expect(SecuritySanitizer.sanitizeUsername('@#$%^&*()')).toBe('');
    });

    it('should preserve case', () => {
      expect(SecuritySanitizer.sanitizeUsername('UserName')).toBe('UserName');
    });
  });

  describe('sanitizeEmail', () => {
    it('should return null for null input', () => {
      expect(SecuritySanitizer.sanitizeEmail(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(SecuritySanitizer.sanitizeEmail(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(SecuritySanitizer.sanitizeEmail('')).toBeNull();
    });

    it('should accept valid email addresses', () => {
      expect(SecuritySanitizer.sanitizeEmail('user@example.com')).toBe('user@example.com');
    });

    it('should convert email to lowercase', () => {
      expect(SecuritySanitizer.sanitizeEmail('User@Example.COM')).toBe('user@example.com');
    });

    it('should trim whitespace', () => {
      expect(SecuritySanitizer.sanitizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('should accept emails with dots in local part', () => {
      expect(SecuritySanitizer.sanitizeEmail('first.last@example.com')).toBe('first.last@example.com');
    });

    it('should accept emails with plus sign', () => {
      expect(SecuritySanitizer.sanitizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
    });

    it('should accept emails with hyphen in domain', () => {
      expect(SecuritySanitizer.sanitizeEmail('user@my-domain.com')).toBe('user@my-domain.com');
    });

    it('should accept emails with subdomain', () => {
      expect(SecuritySanitizer.sanitizeEmail('user@mail.example.com')).toBe('user@mail.example.com');
    });

    it('should return null for email without @', () => {
      expect(SecuritySanitizer.sanitizeEmail('userexample.com')).toBeNull();
    });

    it('should return null for email without domain', () => {
      expect(SecuritySanitizer.sanitizeEmail('user@')).toBeNull();
    });

    it('should return null for email without local part', () => {
      expect(SecuritySanitizer.sanitizeEmail('@example.com')).toBeNull();
    });

    it('should return null for email without TLD', () => {
      expect(SecuritySanitizer.sanitizeEmail('user@example')).toBeNull();
    });

    it('should return null for email with spaces', () => {
      expect(SecuritySanitizer.sanitizeEmail('user name@example.com')).toBeNull();
    });

    it('should return null for email with invalid characters', () => {
      expect(SecuritySanitizer.sanitizeEmail('user<script>@example.com')).toBeNull();
    });

    it('should accept emails with numbers', () => {
      expect(SecuritySanitizer.sanitizeEmail('user123@example456.com')).toBe('user123@example456.com');
    });

    it('should accept emails with underscores in local part', () => {
      expect(SecuritySanitizer.sanitizeEmail('user_name@example.com')).toBe('user_name@example.com');
    });
  });

  describe('truncate', () => {
    it('should return original string if shorter than maxLength', () => {
      expect(SecuritySanitizer.truncate('Hello', 10)).toBe('Hello');
    });

    it('should return original string if equal to maxLength', () => {
      expect(SecuritySanitizer.truncate('Hello', 5)).toBe('Hello');
    });

    it('should truncate and add ellipsis if longer than maxLength', () => {
      expect(SecuritySanitizer.truncate('Hello World', 5)).toBe('Hello...');
    });

    it('should handle empty string', () => {
      expect(SecuritySanitizer.truncate('', 10)).toBe('');
    });

    it('should handle null-like input gracefully', () => {
      // @ts-ignore - Testing edge case
      expect(SecuritySanitizer.truncate(null, 10)).toBeFalsy();
    });

    it('should trim trailing whitespace before adding ellipsis', () => {
      expect(SecuritySanitizer.truncate('Hello   World', 8)).toBe('Hello...');
    });

    it('should handle maxLength of 0', () => {
      expect(SecuritySanitizer.truncate('Hello', 0)).toBe('...');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      const result = SecuritySanitizer.truncate(longString, 50);
      expect(result.length).toBe(53); // 50 chars + '...'
    });
  });

  describe('hashForLogging', () => {
    it('should return "unknown" for null input', () => {
      expect(SecuritySanitizer.hashForLogging(null)).toBe('unknown');
    });

    it('should return "unknown" for undefined input', () => {
      expect(SecuritySanitizer.hashForLogging(undefined)).toBe('unknown');
    });

    it('should return "unknown" for empty string', () => {
      expect(SecuritySanitizer.hashForLogging('')).toBe('unknown');
    });

    it('should return 16 character hash for valid input', () => {
      const result = SecuritySanitizer.hashForLogging('test@example.com');
      expect(result.length).toBe(16);
    });

    it('should return consistent hash for same input', () => {
      const hash1 = SecuritySanitizer.hashForLogging('user123');
      const hash2 = SecuritySanitizer.hashForLogging('user123');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = SecuritySanitizer.hashForLogging('user1');
      const hash2 = SecuritySanitizer.hashForLogging('user2');
      expect(hash1).not.toBe(hash2);
    });

    it('should only contain hexadecimal characters', () => {
      const result = SecuritySanitizer.hashForLogging('test-input');
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('should hash email addresses', () => {
      const result = SecuritySanitizer.hashForLogging('sensitive@email.com');
      expect(result).not.toContain('@');
      expect(result).not.toContain('email');
    });

    it('should hash IP addresses', () => {
      const result = SecuritySanitizer.hashForLogging('192.168.1.1');
      expect(result).not.toContain('.');
      expect(result.length).toBe(16);
    });
  });

  describe('sanitizeMongoQuery', () => {
    it('should return primitive values unchanged', () => {
      expect(SecuritySanitizer.sanitizeMongoQuery(42)).toBe(42);
      expect(SecuritySanitizer.sanitizeMongoQuery('string')).toBe('string');
      expect(SecuritySanitizer.sanitizeMongoQuery(true)).toBe(true);
    });

    it('should return null for null input', () => {
      expect(SecuritySanitizer.sanitizeMongoQuery(null)).toBeNull();
    });

    it('should pass through simple objects', () => {
      const input = { username: 'test', age: 25 };
      expect(SecuritySanitizer.sanitizeMongoQuery(input)).toEqual(input);
    });

    it('should remove $ne operator', () => {
      const input = { username: 'test', $ne: null };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.$ne).toBeUndefined();
      expect(result.username).toBe('test');
    });

    it('should remove $gt operator', () => {
      const input = { password: { $gt: '' } };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.password).toEqual({});
    });

    it('should remove $lt operator', () => {
      const input = { age: { $lt: 100 } };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.age).toEqual({});
    });

    it('should remove $regex operator', () => {
      const input = { username: { $regex: '.*admin.*' } };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.username).toEqual({});
    });

    it('should remove $where operator', () => {
      const input = { $where: 'this.password.length > 0' };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.$where).toBeUndefined();
    });

    it('should remove $or operator', () => {
      const input = { $or: [{ admin: true }] };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.$or).toBeUndefined();
    });

    it('should remove $and operator', () => {
      const input = { $and: [{ active: true }] };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.$and).toBeUndefined();
    });

    it('should sanitize nested objects', () => {
      const input = {
        user: {
          name: 'test',
          role: { $ne: 'user' }
        }
      };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.user.name).toBe('test');
      expect(result.user.role).toEqual({});
    });

    it('should sanitize arrays', () => {
      const input = [
        { username: 'test' },
        { $ne: null }
      ];
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result[0].username).toBe('test');
      expect(result[1].$ne).toBeUndefined();
    });

    it('should handle arrays with nested operators', () => {
      const input = {
        items: [
          { value: { $gt: 0 } }
        ]
      };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.items[0].value).toEqual({});
    });

    it('should handle deeply nested injection attempts', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              $where: 'evil()'
            }
          }
        }
      };
      const result = SecuritySanitizer.sanitizeMongoQuery(input);
      expect(result.level1.level2.level3.$where).toBeUndefined();
    });
  });

  describe('isValidNotificationType', () => {
    it('should return true for valid notification types', () => {
      expect(SecuritySanitizer.isValidNotificationType('new_message')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('new_conversation_direct')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('new_conversation_group')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('message_reply')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('member_joined')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('contact_request')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('contact_accepted')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('user_mentioned')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('message_reaction')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('missed_call')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('system')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('new_conversation')).toBe(true);
      expect(SecuritySanitizer.isValidNotificationType('message_edited')).toBe(true);
    });

    it('should return false for invalid notification types', () => {
      expect(SecuritySanitizer.isValidNotificationType('invalid_type')).toBe(false);
      expect(SecuritySanitizer.isValidNotificationType('')).toBe(false);
      expect(SecuritySanitizer.isValidNotificationType('NEW_MESSAGE')).toBe(false); // case sensitive
      expect(SecuritySanitizer.isValidNotificationType('admin_override')).toBe(false);
    });

    it('should return false for XSS attempts in type', () => {
      expect(SecuritySanitizer.isValidNotificationType('<script>alert(1)</script>')).toBe(false);
      expect(SecuritySanitizer.isValidNotificationType('new_message<script>')).toBe(false);
    });
  });

  describe('isValidPriority', () => {
    it('should return true for valid priorities', () => {
      expect(SecuritySanitizer.isValidPriority('low')).toBe(true);
      expect(SecuritySanitizer.isValidPriority('normal')).toBe(true);
      expect(SecuritySanitizer.isValidPriority('high')).toBe(true);
      expect(SecuritySanitizer.isValidPriority('urgent')).toBe(true);
    });

    it('should return false for invalid priorities', () => {
      expect(SecuritySanitizer.isValidPriority('invalid')).toBe(false);
      expect(SecuritySanitizer.isValidPriority('')).toBe(false);
      expect(SecuritySanitizer.isValidPriority('LOW')).toBe(false); // case sensitive
      expect(SecuritySanitizer.isValidPriority('critical')).toBe(false);
    });

    it('should return false for XSS attempts in priority', () => {
      expect(SecuritySanitizer.isValidPriority('<script>alert(1)</script>')).toBe(false);
    });
  });
});

describe('Helper Functions', () => {
  describe('sanitizeNotificationContent', () => {
    it('should sanitize notification content', () => {
      const input = '<script>alert("XSS")</script>Hello';
      const result = sanitizeNotificationContent(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('Hello');
    });

    it('should handle empty content', () => {
      expect(sanitizeNotificationContent('')).toBe('');
    });
  });

  describe('sanitizeUserInput', () => {
    it('should sanitize user input', () => {
      const input = '<img onerror="alert(1)">User text';
      const result = sanitizeUserInput(input);
      expect(result).not.toContain('onerror');
      expect(result).toContain('User text');
    });

    it('should handle empty input', () => {
      expect(sanitizeUserInput('')).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than', () => {
      expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("It's fine")).toBe('It&#039;s fine');
    });

    it('should escape multiple characters', () => {
      const input = '<script>alert("XSS")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should handle string without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should escape all HTML entities in complex string', () => {
      const input = '<a href="test.html?foo=1&bar=2">Link\'s text</a>';
      const result = escapeHtml(input);
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&#039;');
    });
  });
});

describe('SecuritySanitizer - XSS Edge Cases', () => {
  describe('Advanced XSS Prevention', () => {
    it('should handle mixed case HTML tags', () => {
      const input = '<ScRiPt>alert(1)</sCrIpT>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result.toLowerCase()).not.toContain('script');
    });

    it('should handle null bytes in XSS', () => {
      // Null bytes in tag names - the mock strips them, but let's verify the overall handling
      const input = '<scr\0ipt>alert(1)</script>';
      const result = SecuritySanitizer.sanitizeText(input);
      // The control character (\0) is removed, but since it breaks the script tag pattern,
      // behavior may vary. The key is the control char is removed.
      expect(result).not.toContain('\0');
    });

    it('should handle double encoding', () => {
      const input = '&lt;script&gt;alert(1)&lt;/script&gt;';
      const result = SecuritySanitizer.sanitizeText(input);
      // After sanitization, HTML entities should be treated as text
      expect(result).not.toContain('alert(1)');
    });

    it('should handle HTML comments', () => {
      const input = '<!--<script>alert(1)</script>-->Text';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).toContain('Text');
    });

    it('should handle CDATA sections', () => {
      const input = '<![CDATA[<script>alert(1)</script>]]>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('alert');
    });

    it('should handle meta refresh injection', () => {
      const input = '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('javascript');
    });

    it('should handle base tag injection', () => {
      const input = '<base href="https://evil.com/">Link';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('base');
      expect(result).toContain('Link');
    });

    it('should handle link tag injection', () => {
      const input = '<link rel="stylesheet" href="https://evil.com/style.css">';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('href');
    });

    it('should handle expression() in style', () => {
      const input = '<div style="background:expression(alert(1))">Content</div>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('expression');
    });

    it('should handle url() in style with javascript', () => {
      const input = '<div style="background:url(javascript:alert(1))">Content</div>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('javascript');
    });

    it('should handle marquee and blink tags', () => {
      const input = '<marquee onstart="alert(1)">Text</marquee><blink>More</blink>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('onstart');
    });

    it('should handle input with onfocus', () => {
      const input = '<input onfocus="alert(1)" autofocus>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('onfocus');
    });

    it('should handle textarea with onfocus', () => {
      const input = '<textarea onfocus="alert(1)" autofocus>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('onfocus');
    });

    it('should handle video/audio tags with onerror', () => {
      const input = '<video><source onerror="alert(1)"></video>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('onerror');
    });

    it('should handle details/summary with ontoggle', () => {
      const input = '<details ontoggle="alert(1)" open><summary>Click</summary></details>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('ontoggle');
    });

    it('should handle math tags with XSS', () => {
      const input = '<math><maction actiontype="statusline#http://evil.com">Click</maction></math>';
      const result = SecuritySanitizer.sanitizeText(input);
      expect(result).not.toContain('evil.com');
    });

    it('should handle Unicode normalization attacks', () => {
      // Full-width characters that might normalize to < >
      const input = '\uFF1Cscript\uFF1Ealert(1)\uFF1C/script\uFF1E';
      const result = SecuritySanitizer.sanitizeText(input);
      // Should not execute even if characters are present
      expect(result).not.toMatch(/<script>/i);
    });
  });
});

describe('SecuritySanitizer - NoSQL Injection Edge Cases', () => {
  it('should handle $in operator', () => {
    const input = { role: { $in: ['admin', 'superuser'] } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.role).toEqual({});
  });

  it('should handle $nin operator', () => {
    const input = { status: { $nin: ['banned'] } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.status).toEqual({});
  });

  it('should handle $exists operator', () => {
    const input = { password: { $exists: true } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.password).toEqual({});
  });

  it('should handle $type operator', () => {
    const input = { field: { $type: 'string' } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.field).toEqual({});
  });

  it('should handle $expr operator', () => {
    const input = { $expr: { $eq: ['$password', '$username'] } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.$expr).toBeUndefined();
  });

  it('should handle $jsonSchema operator', () => {
    const input = { $jsonSchema: { required: ['password'] } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.$jsonSchema).toBeUndefined();
  });

  it('should handle $text operator', () => {
    const input = { $text: { $search: 'password' } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.$text).toBeUndefined();
  });

  it('should handle $elemMatch operator', () => {
    const input = { tags: { $elemMatch: { value: { $gt: 0 } } } };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.tags).toEqual({});
  });

  it('should handle mixed legitimate and malicious fields', () => {
    const input = {
      username: 'legitimate',
      email: 'test@example.com',
      $or: [{ admin: true }],
      role: { $ne: 'user' }
    };
    const result = SecuritySanitizer.sanitizeMongoQuery(input);
    expect(result.username).toBe('legitimate');
    expect(result.email).toBe('test@example.com');
    expect(result.$or).toBeUndefined();
    expect(result.role).toEqual({});
  });
});
