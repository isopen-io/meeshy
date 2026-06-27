/**
 * Tests for utils/safe-redirect.ts
 */

import { safeExternalUrl, safeInternalPath } from '@/utils/safe-redirect';

// ─── safeExternalUrl ──────────────────────────────────────────────────────────

describe('safeExternalUrl', () => {
  it('returns null for null input', () => {
    expect(safeExternalUrl(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(safeExternalUrl(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(safeExternalUrl('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(safeExternalUrl(42)).toBeNull();
  });

  it('returns the URL for a valid http URL', () => {
    const url = 'http://example.com/page';
    expect(safeExternalUrl(url)).toBe(new URL(url).toString());
  });

  it('returns the URL for a valid https URL', () => {
    const url = 'https://example.com/path?q=1';
    expect(safeExternalUrl(url)).toBe(new URL(url).toString());
  });

  it('returns null for javascript: scheme', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
  });

  it('returns null for data: scheme', () => {
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('returns null for file: scheme', () => {
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
  });

  it('returns null for a relative path', () => {
    expect(safeExternalUrl('/relative/path')).toBeNull();
  });

  it('returns null for an invalid URL string', () => {
    expect(safeExternalUrl('not a url')).toBeNull();
  });

  it('accepts http URL with port number', () => {
    expect(safeExternalUrl('http://localhost:3000/page')).toBeTruthy();
  });
});

// ─── safeInternalPath ─────────────────────────────────────────────────────────

describe('safeInternalPath', () => {
  it('returns fallback for null input', () => {
    expect(safeInternalPath(null)).toBe('/');
  });

  it('returns fallback for undefined input', () => {
    expect(safeInternalPath(undefined)).toBe('/');
  });

  it('returns fallback for empty string', () => {
    expect(safeInternalPath('')).toBe('/');
  });

  it('returns fallback for non-string input', () => {
    expect(safeInternalPath(42)).toBe('/');
  });

  it('accepts a simple path', () => {
    expect(safeInternalPath('/conversations')).toBe('/conversations');
  });

  it('accepts root path', () => {
    expect(safeInternalPath('/')).toBe('/');
  });

  it('accepts a path with query string', () => {
    expect(safeInternalPath('/login?next=/home')).toBe('/login?next=/home');
  });

  it('returns fallback for absolute http URL', () => {
    expect(safeInternalPath('https://attacker.com')).toBe('/');
  });

  it('returns fallback for protocol-relative URL', () => {
    expect(safeInternalPath('//evil.com')).toBe('/');
  });

  it('returns fallback for backslash-prefixed path', () => {
    expect(safeInternalPath('/\\evil.com')).toBe('/');
  });

  it('returns fallback for javascript: scheme', () => {
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
  });

  it('returns fallback for path not starting with /', () => {
    expect(safeInternalPath('evil.com')).toBe('/');
  });

  it('uses custom fallback when provided', () => {
    expect(safeInternalPath('', '/dashboard')).toBe('/dashboard');
  });

  it('returns custom fallback for invalid path', () => {
    expect(safeInternalPath('https://evil.com', '/home')).toBe('/home');
  });
});
