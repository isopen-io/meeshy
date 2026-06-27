/**
 * Tests for hooks/use-landing-auth.ts
 */

const mockUseUser = jest.fn();
const mockUseIsAuthChecking = jest.fn();

jest.mock('@/stores', () => ({
  useUser: () => mockUseUser(),
  useIsAuthChecking: () => mockUseIsAuthChecking(),
}));

const mockLogin = jest.fn();

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

const mockIsCurrentUserAnonymous = jest.fn<boolean, []>();

jest.mock('@/utils/auth', () => ({
  isCurrentUserAnonymous: () => mockIsCurrentUserAnonymous(),
}));

const mockGetAuthToken = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useLandingAuth } from '@/hooks/use-landing-auth';

const FAKE_USER = { id: 'user-1', username: 'alice' };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockIsCurrentUserAnonymous.mockReturnValue(false);
  mockGetAuthToken.mockReturnValue(null);
  mockUseUser.mockReturnValue(null);
  mockUseIsAuthChecking.mockReturnValue(false);
});

// ─── checking state ───────────────────────────────────────────────────────────

describe('checking state', () => {
  it('returns mode=checking when auth is still being checked', () => {
    mockUseIsAuthChecking.mockReturnValue(true);
    const { result } = renderHook(() => useLandingAuth());
    expect(result.current.state.mode).toBe('checking');
  });

  it('always exposes authMode and setAuthMode during checking', () => {
    mockUseIsAuthChecking.mockReturnValue(true);
    const { result } = renderHook(() => useLandingAuth());
    expect(result.current.authMode).toBe('welcome');
    expect(typeof result.current.setAuthMode).toBe('function');
  });

  it('exposes the login function during checking', () => {
    mockUseIsAuthChecking.mockReturnValue(true);
    const { result } = renderHook(() => useLandingAuth());
    expect(result.current.login).toBe(mockLogin);
  });
});

// ─── authenticated state ──────────────────────────────────────────────────────

describe('authenticated state', () => {
  it('returns mode=authenticated when user and token are present', () => {
    mockUseUser.mockReturnValue(FAKE_USER);
    mockGetAuthToken.mockReturnValue('jwt-token');
    const { result } = renderHook(() => useLandingAuth());
    expect(result.current.state.mode).toBe('authenticated');
  });

  it('includes user object in authenticated state', () => {
    mockUseUser.mockReturnValue(FAKE_USER);
    mockGetAuthToken.mockReturnValue('jwt-token');
    const { result } = renderHook(() => useLandingAuth());
    if (result.current.state.mode === 'authenticated') {
      expect(result.current.state.user).toEqual(FAKE_USER);
    }
  });

  it('clears anonymous localStorage keys when user is anonymous but has auth token', () => {
    mockUseUser.mockReturnValue(FAKE_USER);
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockIsCurrentUserAnonymous.mockReturnValue(true);
    localStorage.setItem('anonymous_session_token', 'tok');
    localStorage.setItem('anonymous_participant', 'part');
    localStorage.setItem('anonymous_current_share_link', 'link');
    localStorage.setItem('anonymous_current_link_id', 'lid');
    localStorage.setItem('anonymous_just_joined', '1');

    renderHook(() => useLandingAuth());

    expect(localStorage.getItem('anonymous_session_token')).toBeNull();
    expect(localStorage.getItem('anonymous_participant')).toBeNull();
    expect(localStorage.getItem('anonymous_current_share_link')).toBeNull();
    expect(localStorage.getItem('anonymous_current_link_id')).toBeNull();
    expect(localStorage.getItem('anonymous_just_joined')).toBeNull();
  });

  it('does not return authenticated mode when token is absent even if user is present', () => {
    mockUseUser.mockReturnValue(FAKE_USER);
    mockGetAuthToken.mockReturnValue(null);
    const { result } = renderHook(() => useLandingAuth());
    expect(result.current.state.mode).toBe('unauthenticated');
  });
});

// ─── unauthenticated state ────────────────────────────────────────────────────

describe('unauthenticated state', () => {
  it('returns mode=unauthenticated when no user', () => {
    const { result } = renderHook(() => useLandingAuth());
    expect(result.current.state.mode).toBe('unauthenticated');
  });

  it('anonymousChatLink is null when no link is stored', () => {
    const { result } = renderHook(() => useLandingAuth());
    if (result.current.state.mode === 'unauthenticated') {
      expect(result.current.state.anonymousChatLink).toBeNull();
    }
  });

  it('sets anonymousChatLink from localStorage when user is anonymous', () => {
    mockUseUser.mockReturnValue(FAKE_USER);
    mockIsCurrentUserAnonymous.mockReturnValue(true);
    // No auth token so falls to unauthenticated after effect runs
    localStorage.setItem('anonymous_current_share_link', 'share-abc');

    const { result } = renderHook(() => useLandingAuth());
    // Because authToken is null, mode is unauthenticated, but the effect
    // sets anonymousChatLink. Due to React rendering, we check the effect ran:
    // The link is set when both user exists AND isAnonymous is true.
    // Since authToken is null → falls through to unauthenticated
    // The effect still fires and reads localStorage
    if (result.current.state.mode === 'unauthenticated') {
      expect(result.current.state.anonymousChatLink).toBe('/chat/share-abc');
    }
  });
});

// ─── authMode management ──────────────────────────────────────────────────────

describe('authMode', () => {
  it('starts as welcome', () => {
    const { result } = renderHook(() => useLandingAuth());
    expect(result.current.authMode).toBe('welcome');
  });

  it('can be updated via setAuthMode', () => {
    const { result } = renderHook(() => useLandingAuth());
    act(() => {
      result.current.setAuthMode('login');
    });
    expect(result.current.authMode).toBe('login');
  });
});

// ─── affiliate token effect ───────────────────────────────────────────────────

describe('affiliate token from cookie', () => {
  it('stores affiliate token from cookie into localStorage', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'meeshy_affiliate_token=aff-xyz; other=val',
    });

    renderHook(() => useLandingAuth());

    expect(localStorage.getItem('meeshy_affiliate_token')).toBe('aff-xyz');

    // Reset cookie
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  it('does not set affiliate token when cookie is absent', () => {
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });

    renderHook(() => useLandingAuth());

    expect(localStorage.getItem('meeshy_affiliate_token')).toBeNull();
  });
});
