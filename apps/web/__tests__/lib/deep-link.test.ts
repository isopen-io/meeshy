/**
 * Tests for the tracking-link deep-link helpers (`lib/deep-link.ts`).
 *
 * These pure functions decide how a resolved tracking target routes:
 * native-app custom scheme, internal web route, or external URL — plus
 * the expired-link rule. They are the load-bearing logic of `/l/[token]`.
 */

import {
  buildAppOpenUrl,
  buildWebFallbackTarget,
  isAppOpenTarget,
  isResolutionExpired,
  normalizeTargetType,
  type TrackingTargetType,
} from '@/lib/deep-link';

describe('normalizeTargetType', () => {
  it('normalizes known types case-insensitively', () => {
    expect(normalizeTargetType('post')).toBe('POST');
    expect(normalizeTargetType('Reel')).toBe('REEL');
    expect(normalizeTargetType('  story  ')).toBe('STORY');
    expect(normalizeTargetType('CONVERSATION')).toBe('CONVERSATION');
    expect(normalizeTargetType('profile')).toBe('PROFILE');
    expect(normalizeTargetType('external')).toBe('EXTERNAL');
  });

  it('returns null for unknown or non-string input', () => {
    expect(normalizeTargetType('comment')).toBeNull();
    expect(normalizeTargetType('')).toBeNull();
    expect(normalizeTargetType(undefined)).toBeNull();
    expect(normalizeTargetType(null)).toBeNull();
    expect(normalizeTargetType(42)).toBeNull();
  });
});

describe('isAppOpenTarget', () => {
  it('is true only for post-family targets', () => {
    expect(isAppOpenTarget('REEL')).toBe(true);
    expect(isAppOpenTarget('POST')).toBe(true);
    expect(isAppOpenTarget('STORY')).toBe(true);
  });

  it('is false for conversation / profile / external', () => {
    expect(isAppOpenTarget('CONVERSATION')).toBe(false);
    expect(isAppOpenTarget('PROFILE')).toBe(false);
    expect(isAppOpenTarget('EXTERNAL')).toBe(false);
  });
});

describe('buildAppOpenUrl', () => {
  it('mints meeshy://p/<id> for posts and reels', () => {
    expect(buildAppOpenUrl('POST', 'abc123')).toBe('meeshy://p/abc123');
    expect(buildAppOpenUrl('REEL', 'abc123')).toBe('meeshy://p/abc123');
  });

  it('mints meeshy://s/<id> for stories', () => {
    expect(buildAppOpenUrl('STORY', 'abc123')).toBe('meeshy://s/abc123');
  });

  it('url-encodes the id', () => {
    expect(buildAppOpenUrl('POST', 'a b/c')).toBe('meeshy://p/a%20b%2Fc');
  });

  it('returns null for non-app targets', () => {
    expect(buildAppOpenUrl('CONVERSATION', 'abc')).toBeNull();
    expect(buildAppOpenUrl('PROFILE', 'abc')).toBeNull();
    expect(buildAppOpenUrl('EXTERNAL', 'abc')).toBeNull();
  });

  it('returns null when id is missing', () => {
    expect(buildAppOpenUrl('POST', null)).toBeNull();
    expect(buildAppOpenUrl('POST', undefined)).toBeNull();
    expect(buildAppOpenUrl('POST', '')).toBeNull();
  });
});

describe('buildWebFallbackTarget', () => {
  it('routes each post type to its real v1 page', () => {
    expect(buildWebFallbackTarget('POST', 'p1', null)).toBe('/post/p1');
    expect(buildWebFallbackTarget('REEL', 'r1', null)).toBe('/reel/r1');
    expect(buildWebFallbackTarget('STORY', 's1', null)).toBe('/story/s1');
    expect(buildWebFallbackTarget('STATUS', 'm1', null)).toBe('/mood/m1');
  });

  it('routes conversation to /conversations/<id>', () => {
    expect(buildWebFallbackTarget('CONVERSATION', 'c1', null)).toBe('/conversations/c1');
  });

  it('routes profile to /u/<id>', () => {
    expect(buildWebFallbackTarget('PROFILE', 'u1', null)).toBe('/u/u1');
  });

  it('returns originalUrl for external targets', () => {
    expect(buildWebFallbackTarget('EXTERNAL', null, 'https://example.com')).toBe(
      'https://example.com'
    );
  });

  it('returns null for external without originalUrl', () => {
    expect(buildWebFallbackTarget('EXTERNAL', null, null)).toBeNull();
    expect(buildWebFallbackTarget('EXTERNAL', null, '')).toBeNull();
  });

  it('returns null for typed targets without an id', () => {
    expect(buildWebFallbackTarget('POST', null, null)).toBeNull();
    expect(buildWebFallbackTarget('CONVERSATION', null, null)).toBeNull();
    expect(buildWebFallbackTarget('PROFILE', undefined, null)).toBeNull();
  });

  it('url-encodes the id', () => {
    expect(buildWebFallbackTarget('CONVERSATION', 'a/b', null)).toBe('/conversations/a%2Fb');
  });
});

describe('isResolutionExpired', () => {
  it('is true when isActive is explicitly false', () => {
    expect(isResolutionExpired({ isActive: false })).toBe(true);
  });

  it('is false when isActive is true or absent', () => {
    expect(isResolutionExpired({ isActive: true })).toBe(false);
    expect(isResolutionExpired({})).toBe(false);
  });

  it('is true when expiresAt is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isResolutionExpired({ isActive: true, expiresAt: past })).toBe(true);
  });

  it('is false when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isResolutionExpired({ isActive: true, expiresAt: future })).toBe(false);
  });

  it('ignores malformed expiresAt', () => {
    expect(isResolutionExpired({ isActive: true, expiresAt: 'not-a-date' })).toBe(false);
    expect(isResolutionExpired({ isActive: true, expiresAt: '' })).toBe(false);
  });
});

describe('routing exhaustiveness', () => {
  const allTypes: TrackingTargetType[] = [
    'REEL',
    'POST',
    'STORY',
    'CONVERSATION',
    'PROFILE',
    'EXTERNAL',
  ];

  it('every target type produces a deterministic route given valid data', () => {
    for (const t of allTypes) {
      const web = buildWebFallbackTarget(t, 'id1', 'https://example.com');
      expect(web).not.toBeNull();
    }
  });
});
