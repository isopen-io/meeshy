/**
 * Tests for utils/route-utils.ts
 */

import { isPublicRoute, isSharedChatRoute, PUBLIC_ROUTES } from '@/utils/route-utils';

// ─── PUBLIC_ROUTES ────────────────────────────────────────────────────────────

describe('PUBLIC_ROUTES', () => {
  it('includes the root path', () => {
    expect(PUBLIC_ROUTES).toContain('/');
  });

  it('includes /login', () => {
    expect(PUBLIC_ROUTES).toContain('/login');
  });

  it('includes /register', () => {
    expect(PUBLIC_ROUTES).toContain('/register');
  });
});

// ─── isPublicRoute ─────────────────────────────────────────────────────────────

describe('isPublicRoute', () => {
  it('returns true for root path', () => {
    expect(isPublicRoute('/')).toBe(true);
  });

  it('returns true for /login', () => {
    expect(isPublicRoute('/login')).toBe(true);
  });

  it('returns true for /register', () => {
    expect(isPublicRoute('/register')).toBe(true);
  });

  it('returns true for /privacy', () => {
    expect(isPublicRoute('/privacy')).toBe(true);
  });

  it('returns true for /terms', () => {
    expect(isPublicRoute('/terms')).toBe(true);
  });

  it('returns true for /forgot-password', () => {
    expect(isPublicRoute('/forgot-password')).toBe(true);
  });

  it('returns true for /v2 routes', () => {
    expect(isPublicRoute('/v2/anything')).toBe(true);
  });

  it('returns true for /auth/ sub-routes', () => {
    expect(isPublicRoute('/auth/verify-email')).toBe(true);
  });

  it('returns true for tracking routes /l/', () => {
    expect(isPublicRoute('/l/abc123')).toBe(true);
  });

  it('returns true for /links/tracked/ routes', () => {
    expect(isPublicRoute('/links/tracked/xyz')).toBe(true);
  });

  it('returns true for affiliate routes', () => {
    expect(isPublicRoute('/signup/affiliate/token')).toBe(true);
  });

  it('returns true for join routes', () => {
    expect(isPublicRoute('/join/abc')).toBe(true);
  });

  it('returns false for /conversations (protected)', () => {
    expect(isPublicRoute('/conversations')).toBe(false);
  });

  it('returns false for /dashboard (protected)', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('strips trailing slash before checking', () => {
    expect(isPublicRoute('/login/')).toBe(true);
  });

  it('preserves trailing slash for root', () => {
    expect(isPublicRoute('/')).toBe(true);
  });

  it('returns true for empty string (no pathname)', () => {
    expect(isPublicRoute('')).toBe(true);
  });
});

// ─── isSharedChatRoute ────────────────────────────────────────────────────────

describe('isSharedChatRoute', () => {
  it('returns true for /chat/ paths', () => {
    expect(isSharedChatRoute('/chat/link-abc')).toBe(true);
  });

  it('returns false for /conversations/ paths', () => {
    expect(isSharedChatRoute('/conversations/123')).toBe(false);
  });

  it('returns false for root path', () => {
    expect(isSharedChatRoute('/')).toBe(false);
  });

  it('returns false for /login', () => {
    expect(isSharedChatRoute('/login')).toBe(false);
  });
});
