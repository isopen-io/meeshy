/**
 * Tests for utils/safe-redirect.ts
 */

import { safeExternalUrl, safeInternalPath } from '@/utils/safe-redirect';

// ─── safeExternalUrl ──────────────────────────────────────────────────────────

describe('safeExternalUrl', () => {
  it('accepts a valid https URL', () => {
    expect(safeExternalUrl('https://example.com/page')).toBe('https://example.com/page');
  });

  it('accepts a valid http URL', () => {
    expect(safeExternalUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('rejects javascript: protocol', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: protocol', () => {
    expect(safeExternalUrl('data:text/html,<h1>XSS</h1>')).toBeNull();
  });

  it('rejects file: protocol', () => {
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects a non-string value', () => {
    expect(safeExternalUrl(42)).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl({})).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(safeExternalUrl('')).toBeNull();
  });

  it('rejects an unparseable string', () => {
    expect(safeExternalUrl('not a url')).toBeNull();
  });

  it('rejects relative paths', () => {
    expect(safeExternalUrl('/relative/path')).toBeNull();
  });
});

// ─── safeInternalPath ─────────────────────────────────────────────────────────

describe('safeInternalPath', () => {
  it('accepts a simple path', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard');
  });

  it('accepts root path', () => {
    expect(safeInternalPath('/')).toBe('/');
  });

  it('accepts a nested path', () => {
    expect(safeInternalPath('/settings/profile')).toBe('/settings/profile');
  });

  it('accepts a path with query string', () => {
    expect(safeInternalPath('/search?q=hello')).toBe('/search?q=hello');
  });

  it('rejects an absolute URL', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/');
  });

  it('rejects protocol-relative URL (//)', () => {
    expect(safeInternalPath('//evil.com')).toBe('/');
  });

  it('rejects backslash-prefixed path (/\\)', () => {
    expect(safeInternalPath('/\\evil.com')).toBe('/');
  });

  it('rejects non-slash-prefixed strings', () => {
    expect(safeInternalPath('evil')).toBe('/');
  });

  it('rejects javascript: scheme', () => {
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
  });

  it('rejects a non-string value', () => {
    expect(safeInternalPath(null)).toBe('/');
    expect(safeInternalPath(undefined)).toBe('/');
  });

  it('uses custom fallback when provided', () => {
    expect(safeInternalPath('//bad', '/home')).toBe('/home');
  });
});
