/**
 * Tests for XSS Protection Utility
 * Tests HTML sanitization, URL validation, and XSS prevention
 */

// Jest provides describe, it, expect globally
import {
  sanitizeText,
  sanitizeHtml,
  sanitizeUrl,
  sanitizeUsername,
  sanitizeJson,
  containsXss,
  sanitizeNotification,
  escapeAttribute,
  truncateText,
  isValidEmail,
  sanitizeFileName
} from '../xss-protection';

describe('sanitizeText', () => {
  it('should remove all HTML tags', () => {
    const input = '<script>alert("XSS")</script>Hello<b>World</b>';
    const result = sanitizeText(input);

    expect(result).toBe('HelloWorld');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('should remove event handlers', () => {
    const input = '<img src=x onerror="alert(1)">';
    const result = sanitizeText(input);

    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('should remove control characters', () => {
    const input = 'Hello\x00World\x1F';
    const result = sanitizeText(input);

    expect(result).toBe('HelloWorld');
  });

  it('should remove zero-width characters', () => {
    const input = 'Hello\u200BWorld';
    const result = sanitizeText(input);

    expect(result).toBe('HelloWorld');
  });

  it('should trim whitespace', () => {
    const input = '  Hello World  ';
    const result = sanitizeText(input);

    expect(result).toBe('Hello World');
  });

  it('should truncate very long text', () => {
    const input = 'a'.repeat(15000);
    const result = sanitizeText(input);

    expect(result.length).toBeLessThanOrEqual(10003); // 10000 + '...'
    expect(result).toContain('...');
  });

  it('should return empty string for null/undefined', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });
});

describe('sanitizeHtml', () => {
  it('should allow safe HTML tags', () => {
    const input = '<p>Hello <b>World</b></p>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<p>');
    expect(result).toContain('<b>');
    expect(result).toContain('</p>');
    expect(result).toContain('</b>');
  });

  it('should remove script tags', () => {
    const input = '<p>Safe</p><script>alert("XSS")</script>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<p>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('should remove dangerous tags', () => {
    const dangerous = [
      '<iframe src="evil.com"></iframe>',
      '<object data="evil.com"></object>',
      '<embed src="evil.com">',
      '<form action="evil.com"></form>'
    ];

    dangerous.forEach(input => {
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('<object');
      expect(result).not.toContain('<embed');
      expect(result).not.toContain('<form');
    });
  });

  it('should remove event handlers from allowed tags', () => {
    const input = '<a href="#" onclick="alert(1)">Link</a>';
    const result = sanitizeHtml(input);

    expect(result).toContain('<a');
    expect(result).not.toContain('onclick');
  });

  it('should validate href URLs', () => {
    const input = '<a href="javascript:alert(1)">Bad Link</a>';
    const result = sanitizeHtml(input);

    expect(result).not.toContain('javascript:');
  });
});

describe('sanitizeUrl', () => {
  it('should allow valid HTTPS URLs', () => {
    const url = 'https://example.com/path';
    const result = sanitizeUrl(url);

    expect(result).toBe(url);
  });

  it('should allow valid HTTP URLs', () => {
    const url = 'http://example.com/path';
    const result = sanitizeUrl(url);

    expect(result).toBe(url);
  });

  it('should allow mailto URLs', () => {
    const url = 'mailto:test@example.com';
    const result = sanitizeUrl(url);

    expect(result).toBe(url);
  });

  it('should block javascript: protocol', () => {
    const url = 'javascript:alert(1)';
    const result = sanitizeUrl(url);

    expect(result).toBeNull();
  });

  it('should block data: URLs', () => {
    const url = 'data:text/html,<script>alert(1)</script>';
    const result = sanitizeUrl(url);

    expect(result).toBeNull();
  });

  it('should block file: protocol', () => {
    const url = 'file:///etc/passwd';
    const result = sanitizeUrl(url, ['https:', 'http:', 'mailto:']);

    expect(result).toBeNull();
  });

  it('should reject URLs longer than max length', () => {
    const url = 'https://example.com/' + 'a'.repeat(3000);
    const result = sanitizeUrl(url);

    expect(result).toBeNull();
  });

  it('should return null for invalid URLs', () => {
    const invalid = ['not a url', '://broken', 'ht tp://space.com'];

    invalid.forEach(url => {
      expect(sanitizeUrl(url)).toBeNull();
    });
  });

  it('should return null for null/undefined', () => {
    expect(sanitizeUrl(null)).toBeNull();
    expect(sanitizeUrl(undefined)).toBeNull();
  });
});

describe('sanitizeUsername', () => {
  it('should allow alphanumeric and safe characters', () => {
    const username = 'JohnDoe_123';
    const result = sanitizeUsername(username);

    expect(result).toBe(username);
  });

  it('should remove special characters', () => {
    const username = 'John<script>alert(1)</script>Doe';
    const result = sanitizeUsername(username);

    // Should remove < > ( ) characters but keep alphanumeric
    expect(result).toBe('Johnscriptalert1scriptDoe');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
  });

  it('should enforce max length', () => {
    const username = 'a'.repeat(100);
    const result = sanitizeUsername(username);

    expect(result.length).toBe(50);
  });

  it('should allow hyphens and periods', () => {
    const username = 'john.doe-123';
    const result = sanitizeUsername(username);

    expect(result).toBe(username);
  });
});

describe('sanitizeJson', () => {
  it('should sanitize string values in objects', () => {
    const input = {
      name: '<script>alert(1)</script>John',
      age: 30
    };

    const result = sanitizeJson(input);

    expect(result.name).not.toContain('<script>');
    expect(result.age).toBe(30);
  });

  it('should recursively sanitize nested objects', () => {
    const input = {
      user: {
        name: '<b>John</b>',
        profile: {
          bio: '<script>evil</script>Bio'
        }
      }
    };

    const result = sanitizeJson(input);

    expect(result.user.name).not.toContain('<b>');
    expect(result.user.profile.bio).not.toContain('<script>');
  });

  it('should block dangerous property names', () => {
    const input = {
      $dangerous: 'value',
      safe: 'good'
    };
    // Also add some extra dangerous keys via Object.assign to avoid syntax issues
    Object.defineProperty(input, 'prototype', { value: 'bad', enumerable: true });

    const result = sanitizeJson(input);

    // Should not have $dangerous (starts with $)
    expect(result).not.toHaveProperty('$dangerous');
    // Should not have prototype
    expect(result).not.toHaveProperty('prototype');
    // Should keep safe properties
    expect(result).toHaveProperty('safe');
    expect(result.safe).toBe('good');
  });

  it('should handle arrays', () => {
    const input = ['<script>1</script>', '<b>2</b>', 3];
    const result = sanitizeJson(input);

    expect(result[0]).not.toContain('<script>');
    expect(result[1]).not.toContain('<b>');
    expect(result[2]).toBe(3);
  });
});

describe('containsXss', () => {
  it('should detect script tags', () => {
    expect(containsXss('<script>alert(1)</script>')).toBe(true);
    expect(containsXss('<SCRIPT>alert(1)</SCRIPT>')).toBe(true); // Case insensitive
  });

  it('should detect javascript: protocol', () => {
    expect(containsXss('javascript:alert(1)')).toBe(true);
    expect(containsXss('JAVASCRIPT:alert(1)')).toBe(true);
  });

  it('should detect event handlers', () => {
    expect(containsXss('<img onerror="alert(1)">')).toBe(true);
    expect(containsXss('<div onclick="evil()">')).toBe(true);
    expect(containsXss('<body onload="bad()">')).toBe(true);
  });

  it('should detect dangerous tags', () => {
    expect(containsXss('<iframe src="evil.com">')).toBe(true);
    expect(containsXss('<object data="evil">')).toBe(true);
    expect(containsXss('<embed src="evil">')).toBe(true);
  });

  it('should not flag safe content', () => {
    expect(containsXss('Hello World')).toBe(false);
    expect(containsXss('<p>Safe paragraph</p>')).toBe(false);
  });
});

describe('sanitizeNotification', () => {
  it('should sanitize all text fields', () => {
    const notification = {
      id: 'notif123',
      type: 'new_message',
      title: '<script>XSS</script>Title',
      content: '<b>Bold</b> content',
      messagePreview: 'Preview <script>alert(1)</script>',
      senderUsername: 'John<script>Doe',
      senderAvatar: 'https://example.com/avatar.jpg',
      isRead: false,
      priority: 'normal',
      createdAt: new Date(),
      context: {
        conversationId: 'conv123',
        conversationTitle: '<b>Chat</b>',
        messageId: 'msg456',
        userId: 'user789'
      }
    };

    const result = sanitizeNotification(notification);

    expect(result.title).not.toContain('<script>');
    expect(result.content).not.toContain('<b>');
    expect(result.messagePreview).not.toContain('<script>');
    expect(result.senderUsername).not.toContain('<script>');
    expect(result.context.conversationTitle).not.toContain('<b>');
  });

  it('should validate URLs', () => {
    const notification = {
      senderAvatar: 'javascript:alert(1)',
      // ... other fields
    };

    const result = sanitizeNotification(notification);

    expect(result.senderAvatar).toBeNull(); // Invalid URL blocked
  });

  it('should handle null notification', () => {
    expect(sanitizeNotification(null)).toBeNull();
  });
});

describe('escapeAttribute', () => {
  it('should escape HTML entities', () => {
    const input = '&<>"\'\\';
    const result = escapeAttribute(input);

    // Check that dangerous characters are escaped to HTML entities
    expect(result).toContain('&amp;');  // & -> &amp;
    expect(result).toContain('&lt;');   // < -> &lt;
    expect(result).toContain('&gt;');   // > -> &gt;
    expect(result).toContain('&quot;'); // " -> &quot;
    expect(result).toContain('&#x27;'); // ' -> &#x27;
    // Original unescaped characters should not appear standalone
    expect(result).not.toBe(input);
  });
});

describe('truncateText', () => {
  it('should truncate long text', () => {
    const text = 'This is a very long text that needs to be truncated';
    const result = truncateText(text, 20);

    expect(result.length).toBeLessThanOrEqual(23); // 20 + '...'
    expect(result).toContain('...');
  });

  it('should not truncate short text', () => {
    const text = 'Short';
    const result = truncateText(text, 20);

    expect(result).toBe(text);
    expect(result).not.toContain('...');
  });

  it('should truncate at last space', () => {
    const text = 'Hello World Testing';
    const result = truncateText(text, 12);

    expect(result).toBe('Hello World...');
  });
});

describe('isValidEmail', () => {
  it('should validate correct emails', () => {
    const validEmails = [
      'test@example.com',
      'user.name@example.com',
      'user+tag@example.co.uk'
    ];

    validEmails.forEach(email => {
      expect(isValidEmail(email)).toBe(true);
    });
  });

  it('should reject invalid emails', () => {
    const invalidEmails = [
      'not-an-email',
      '@example.com',
      'user@',
      'user space@example.com',
      ''
    ];

    invalidEmails.forEach(email => {
      expect(isValidEmail(email)).toBe(false);
    });
  });

  it('should reject overly long emails', () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    expect(isValidEmail(longEmail)).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('should remove path traversal attempts', () => {
    const fileName = '../../etc/passwd';
    const result = sanitizeFileName(fileName);

    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  it('should replace special characters', () => {
    const fileName = 'file<script>name.txt';
    const result = sanitizeFileName(fileName);

    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('.txt');
  });

  it('should enforce max length while preserving extension', () => {
    const fileName = 'a'.repeat(300) + '.txt';
    const result = sanitizeFileName(fileName);

    expect(result.length).toBeLessThanOrEqual(255);
    expect(result).toContain('.txt');
  });
});
