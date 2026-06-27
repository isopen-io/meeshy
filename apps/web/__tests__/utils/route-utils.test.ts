/**
 * Tests for utils/route-utils.ts
 */

import { isPublicRoute, isSharedChatRoute, PUBLIC_ROUTES } from '@/utils/route-utils';

// ─── isPublicRoute ────────────────────────────────────────────────────────────

describe('isPublicRoute', () => {
  it('returns true for each static public route', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(isPublicRoute(route)).toBe(true);
    }
  });

  it('returns true for root /', () => {
    expect(isPublicRoute('/')).toBe(true);
  });

  it('returns true for /login', () => {
    expect(isPublicRoute('/login')).toBe(true);
  });

  it('returns true for trailing slash variant', () => {
    expect(isPublicRoute('/login/')).toBe(true);
  });

  it('returns true for empty string (treated as public)', () => {
    expect(isPublicRoute('')).toBe(true);
  });

  it('returns false for protected route /conversations', () => {
    expect(isPublicRoute('/conversations')).toBe(false);
  });

  it('returns false for protected route /settings', () => {
    expect(isPublicRoute('/settings')).toBe(false);
  });

  it('returns true for /v2 routes (new UI)', () => {
    expect(isPublicRoute('/v2')).toBe(true);
    expect(isPublicRoute('/v2/conversations')).toBe(true);
  });

  it('returns true for /auth/ routes', () => {
    expect(isPublicRoute('/auth/verify-email')).toBe(true);
    expect(isPublicRoute('/auth/callback')).toBe(true);
  });

  it('returns true for /l/ tracking routes', () => {
    expect(isPublicRoute('/l/abc123')).toBe(true);
  });

  it('returns true for /links/tracked/ routes', () => {
    expect(isPublicRoute('/links/tracked/xyz')).toBe(true);
  });

  it('returns true for /signup/affiliate/ routes', () => {
    expect(isPublicRoute('/signup/affiliate/ref123')).toBe(true);
  });

  it('returns true for /join/ routes', () => {
    expect(isPublicRoute('/join/room-invite')).toBe(true);
  });

  it('returns false for /messages (private)', () => {
    expect(isPublicRoute('/messages')).toBe(false);
  });
});

// ─── isSharedChatRoute ────────────────────────────────────────────────────────

describe('isSharedChatRoute', () => {
  it('returns true for /chat/ path', () => {
    expect(isSharedChatRoute('/chat/abc')).toBe(true);
  });

  it('returns false for non-chat path', () => {
    expect(isSharedChatRoute('/conversations/abc')).toBe(false);
  });

  it('returns false for /chats/ (different prefix)', () => {
    expect(isSharedChatRoute('/chats/')).toBe(false);
  });
});
