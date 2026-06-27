/**
 * Tests for lib/utils/link-parser.ts
 */

jest.mock('@/lib/config', () => ({ buildApiUrl: (path: string) => `http://localhost:3000${path}` }));
jest.mock('@/services/auth-manager.service', () => ({
  authManager: { getAuthToken: jest.fn(() => null) },
}));

import {
  parseMessageLinks,
  hasLinks,
  isTrackingLink,
  extractTrackingToken,
} from '@/lib/utils/link-parser';

// ─── parseMessageLinks ────────────────────────────────────────────────────────

describe('parseMessageLinks', () => {
  it('returns single text part for plain text', () => {
    const parts = parseMessageLinks('Hello world');
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('text');
    expect(parts[0].content).toBe('Hello world');
  });

  it('parses a URL in the middle of text', () => {
    const parts = parseMessageLinks('Visit https://example.com now');
    const urlPart = parts.find(p => p.type === 'url');
    expect(urlPart).toBeDefined();
    expect(urlPart!.content).toBe('https://example.com');
    expect(urlPart!.originalUrl).toBe('https://example.com');
  });

  it('splits text before and after a URL', () => {
    const parts = parseMessageLinks('pre https://example.com post');
    expect(parts.find(p => p.content === 'pre ')).toBeDefined();
    expect(parts.find(p => p.type === 'url')).toBeDefined();
    expect(parts.find(p => p.content === ' post')).toBeDefined();
  });

  it('recognizes mshy shortlinks (m+token)', () => {
    const parts = parseMessageLinks('Check m+abc123 here');
    const mshy = parts.find(p => p.type === 'mshy-link');
    expect(mshy).toBeDefined();
    expect(mshy!.token).toBe('abc123');
  });

  it('recognizes tracking links (/l/token)', () => {
    const parts = parseMessageLinks('Open https://meeshy.me/l/tok123 now');
    const tracking = parts.find(p => p.type === 'tracking-link');
    expect(tracking).toBeDefined();
    expect(tracking!.token).toBe('tok123');
  });

  it('returns text-only part for empty string', () => {
    const parts = parseMessageLinks('');
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('text');
  });

  it('assigns correct start/end positions', () => {
    const msg = 'https://example.com';
    const parts = parseMessageLinks(msg);
    expect(parts[0].start).toBe(0);
    expect(parts[0].end).toBe(msg.length);
  });

  it('parses multiple URLs', () => {
    const parts = parseMessageLinks('a: https://one.com b: https://two.com');
    const urls = parts.filter(p => p.type === 'url');
    expect(urls).toHaveLength(2);
  });
});

// ─── hasLinks ─────────────────────────────────────────────────────────────────

describe('hasLinks', () => {
  it('returns false for plain text', () => {
    expect(hasLinks('Hello world')).toBe(false);
  });

  it('returns true when message contains a URL', () => {
    expect(hasLinks('Visit https://example.com today')).toBe(true);
  });

  it('returns true for http URLs', () => {
    expect(hasLinks('http://example.com')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(hasLinks('')).toBe(false);
  });
});

// ─── isTrackingLink ───────────────────────────────────────────────────────────

describe('isTrackingLink', () => {
  it('returns true for tracking URL matching /l/<token>', () => {
    expect(isTrackingLink('https://meeshy.me/l/abc123')).toBe(true);
  });

  it('returns true for any domain with /l/<token> path', () => {
    expect(isTrackingLink('https://example.com/l/tok456')).toBe(true);
  });

  it('returns false for plain URL without /l/ segment', () => {
    expect(isTrackingLink('https://example.com/page')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTrackingLink('')).toBe(false);
  });
});

// ─── extractTrackingToken ─────────────────────────────────────────────────────

describe('extractTrackingToken', () => {
  it('extracts token from tracking URL', () => {
    expect(extractTrackingToken('https://meeshy.me/l/abc123')).toBe('abc123');
  });

  it('extracts token from any domain', () => {
    expect(extractTrackingToken('https://example.com/l/xyz789')).toBe('xyz789');
  });

  it('returns null for non-tracking URL', () => {
    expect(extractTrackingToken('https://example.com/page')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTrackingToken('')).toBeNull();
  });
});
