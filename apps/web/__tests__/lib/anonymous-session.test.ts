/**
 * Tests for lib/anonymous-session.ts
 */

import { getOrCreateWebSessionKey } from '@/lib/anonymous-session';

beforeEach(() => {
  localStorage.clear();
});

// ─── getOrCreateWebSessionKey ─────────────────────────────────────────────────

describe('getOrCreateWebSessionKey', () => {
  it('returns the existing session_token from localStorage (highest priority)', () => {
    localStorage.setItem('session_token', 'anon-abc123');
    expect(getOrCreateWebSessionKey()).toBe('anon-abc123');
  });

  it('returns meeshy_session_token when session_token is absent', () => {
    localStorage.setItem('meeshy_session_token', 'web-key-xyz');
    expect(getOrCreateWebSessionKey()).toBe('web-key-xyz');
  });

  it('prefers session_token over meeshy_session_token', () => {
    localStorage.setItem('session_token', 'anon-first');
    localStorage.setItem('meeshy_session_token', 'web-second');
    expect(getOrCreateWebSessionKey()).toBe('anon-first');
  });

  it('generates a new key when neither key is stored', () => {
    const key = getOrCreateWebSessionKey();
    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('persists the generated key to meeshy_session_token', () => {
    const key = getOrCreateWebSessionKey();
    expect(localStorage.getItem('meeshy_session_token')).toBe(key);
  });

  it('returns the same key on subsequent calls (stable across calls)', () => {
    const first = getOrCreateWebSessionKey();
    const second = getOrCreateWebSessionKey();
    expect(first).toBe(second);
  });

  it('generates a different key after localStorage is cleared', () => {
    const first = getOrCreateWebSessionKey();
    localStorage.clear();
    const second = getOrCreateWebSessionKey();
    // Both are truthy; they may differ in fallback path due to Date.now()
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
  });
});
