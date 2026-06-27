/**
 * Tests for utils/xss-protection.ts
 */

import {
  sanitizeText,
  sanitizeHtml,
  escapeAttribute,
  sanitizeUrl,
  sanitizeUsername,
  sanitizeJson,
  truncateText,
  isValidEmail,
  containsXss,
  sanitizeFileName,
  sanitizeNotification,
} from '@/utils/xss-protection';

// ─── sanitizeText ─────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
  it('returns empty string for null', () => {
    expect(sanitizeText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(sanitizeText(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('preserves plain text', () => {
    expect(sanitizeText('Hello world')).toBe('Hello world');
  });

  it('strips HTML tags', () => {
    expect(sanitizeText('<b>bold</b>')).toBe('bold');
  });

  it('removes zero-width characters', () => {
    expect(sanitizeText('hello​world')).toBe('helloworld');
  });

  it('preserves newlines and tabs', () => {
    const input = 'line1\nline2\ttabbed';
    expect(sanitizeText(input)).toBe(input);
  });

  it('truncates text exceeding 10000 chars', () => {
    const long = 'a'.repeat(10001);
    const result = sanitizeText(long);
    expect(result).toHaveLength(10003); // 10000 + '...'
    expect(result.endsWith('...')).toBe(true);
  });
});

// ─── sanitizeHtml ─────────────────────────────────────────────────────────────

describe('sanitizeHtml', () => {
  it('returns empty string for null', () => {
    expect(sanitizeHtml(null)).toBe('');
  });

  it('removes script tags and their content', () => {
    const result = sanitizeHtml('<p>safe</p><script>alert("xss")</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('safe');
  });

  it('removes iframe tags', () => {
    const result = sanitizeHtml('<iframe src="evil.com"></iframe>');
    expect(result).not.toContain('<iframe');
  });

  it('removes event handler attributes', () => {
    const result = sanitizeHtml('<a onclick="evil()">click</a>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('click');
  });

  it('removes javascript: protocol from attributes', () => {
    const result = sanitizeHtml('<a href="javascript:alert()">link</a>');
    expect(result).not.toContain('javascript:');
  });
});

// ─── escapeAttribute ──────────────────────────────────────────────────────────

describe('escapeAttribute', () => {
  it('returns empty string for null', () => {
    expect(escapeAttribute(null)).toBe('');
  });

  it('escapes ampersands', () => {
    expect(escapeAttribute('a&b')).toBe('a&amp;b');
  });

  it('escapes double quotes', () => {
    expect(escapeAttribute('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeAttribute("it's")).toBe('it&#x27;s');
  });

  it('escapes angle brackets', () => {
    expect(escapeAttribute('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes forward slash', () => {
    expect(escapeAttribute('a/b')).toBe('a&#x2F;b');
  });

  it('leaves safe text unchanged', () => {
    expect(escapeAttribute('hello world 123')).toBe('hello world 123');
  });
});

// ─── sanitizeUrl ──────────────────────────────────────────────────────────────

describe('sanitizeUrl', () => {
  it('returns null for null input', () => {
    expect(sanitizeUrl(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeUrl('')).toBeNull();
  });

  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert("xss")')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<script>alert()</script>')).toBeNull();
  });

  it('rejects ftp: protocol (not in default allowed list)', () => {
    expect(sanitizeUrl('ftp://files.example.com')).toBeNull();
  });

  it('rejects URLs exceeding max length', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2048);
    expect(sanitizeUrl(longUrl)).toBeNull();
  });

  it('allows custom protocols via allowedProtocols param', () => {
    const result = sanitizeUrl('ftp://files.example.com', ['ftp:']);
    expect(result).toBe('ftp://files.example.com/');
  });
});

// ─── sanitizeUsername ─────────────────────────────────────────────────────────

describe('sanitizeUsername', () => {
  it('returns empty string for null', () => {
    expect(sanitizeUsername(null)).toBe('');
  });

  it('allows alphanumeric, underscore, hyphen, period', () => {
    expect(sanitizeUsername('alice_99.dev')).toBe('alice_99.dev');
  });

  it('strips disallowed characters', () => {
    expect(sanitizeUsername('ali<>ce!')).toBe('alice');
  });

  it('truncates to default max length of 50', () => {
    const result = sanitizeUsername('a'.repeat(60));
    expect(result).toHaveLength(50);
  });

  it('truncates to custom max length', () => {
    const result = sanitizeUsername('abcdefghij', 5);
    expect(result).toBe('abcde');
  });
});

// ─── sanitizeJson ─────────────────────────────────────────────────────────────

describe('sanitizeJson', () => {
  it('sanitizes string values recursively', () => {
    const input = { name: '<b>Alice</b>', age: 30 };
    const result = sanitizeJson(input);
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('handles arrays', () => {
    const result = sanitizeJson(['<b>one</b>', '<i>two</i>']);
    expect(result[0]).toBe('one');
    expect(result[1]).toBe('two');
  });

  it('blocks keys starting with $ or __', () => {
    const result = sanitizeJson({ $secret: 'hack', name: 'Alice' });
    expect(Object.hasOwn(result, '$secret')).toBe(false);
    expect(result.name).toBe('Alice');
  });

  it('passes through non-string primitive values', () => {
    expect(sanitizeJson(42)).toBe(42);
    expect(sanitizeJson(null)).toBeNull();
  });

  it('sanitizes nested objects', () => {
    const input = { user: { name: '<script>hack</script>' } };
    const result = sanitizeJson(input);
    expect(result.user.name).not.toContain('<script');
  });
});

// ─── truncateText ─────────────────────────────────────────────────────────────

describe('truncateText', () => {
  it('returns short text unchanged', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
  });

  it('truncates at word boundary', () => {
    const result = truncateText('Hello world foo', 8);
    expect(result).toBe('Hello...');
  });

  it('truncates with custom suffix', () => {
    const result = truncateText('Hello world', 7, ' [+]');
    expect(result).toBe('Hello [+]');
  });

  it('hard truncates when no space found', () => {
    const result = truncateText('Helloworld', 5);
    expect(result).toBe('Hello...');
  });

  it('returns empty string as-is', () => {
    expect(truncateText('', 10)).toBe('');
  });
});

// ─── isValidEmail ─────────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('returns false for null', () => {
    expect(isValidEmail(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('returns true for valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('returns false when missing @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('returns false when missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });
});

// ─── containsXss ──────────────────────────────────────────────────────────────

describe('containsXss', () => {
  it('returns false for null', () => {
    expect(containsXss(null)).toBe(false);
  });

  it('returns false for safe text', () => {
    expect(containsXss('Hello world')).toBe(false);
  });

  it('detects script tags', () => {
    expect(containsXss('<script>alert()</script>')).toBe(true);
  });

  it('detects javascript: protocol', () => {
    expect(containsXss('javascript:alert()')).toBe(true);
  });

  it('detects event handlers', () => {
    expect(containsXss('onerror=alert()')).toBe(true);
  });

  it('detects iframe tags', () => {
    expect(containsXss('<iframe src="evil.com">')).toBe(true);
  });

  it('detects eval()', () => {
    expect(containsXss('eval(code)')).toBe(true);
  });
});

// ─── sanitizeFileName ─────────────────────────────────────────────────────────

describe('sanitizeFileName', () => {
  it('returns empty string for null', () => {
    expect(sanitizeFileName(null)).toBe('');
  });

  it('leaves safe filenames unchanged', () => {
    expect(sanitizeFileName('document.pdf')).toBe('document.pdf');
  });

  it('strips path traversal sequences', () => {
    const result = sanitizeFileName('../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFileName('my document.pdf')).toBe('my_document.pdf');
  });

  it('preserves alphanumeric, underscore, hyphen, period', () => {
    expect(sanitizeFileName('my-file_v2.1.txt')).toBe('my-file_v2.1.txt');
  });
});

// ─── sanitizeNotification ─────────────────────────────────────────────────────

describe('sanitizeNotification', () => {
  it('returns null for null input', () => {
    expect(sanitizeNotification(null)).toBeNull();
  });

  it('sanitizes title and content fields', () => {
    const notification = {
      title: '<b>New message</b>',
      content: '<script>hack</script>Hello',
      messagePreview: 'preview',
      senderUsername: 'alice<99>',
      senderAvatar: 'https://example.com/avatar.jpg',
    };
    const result = sanitizeNotification(notification);
    expect(result.title).toBe('New message');
    expect(result.content).not.toContain('<script');
    expect(result.senderUsername).toBe('alice99');
    expect(result.senderAvatar).toBe('https://example.com/avatar.jpg');
  });

  it('sanitizes nested context object', () => {
    const notification = {
      title: 'Test',
      context: {
        conversationId: '<b>id</b>',
        conversationTitle: '<i>title</i>',
      },
    };
    const result = sanitizeNotification(notification);
    expect(result.context.conversationId).toBe('id');
    expect(result.context.conversationTitle).toBe('title');
  });
});
