/**
 * Tests for hooks/use-auth-guard.ts
 */

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn(() => ({
  isAuthenticated: false,
  isChecking: true,
  user: null,
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthGuard } from '@/hooks/use-auth-guard';

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ isAuthenticated: false, isChecking: true, user: null });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('returns isChecking = true while auth is checking', () => {
    const { result } = renderHook(() => useAuthGuard());
    expect(result.current.isChecking).toBe(true);
  });

  it('returns isAuthenticated from useAuth', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isChecking: false, user: null });
    const { result } = renderHook(() => useAuthGuard());
    expect(result.current.isAuthenticated).toBe(true);
  });
});

// ─── redirect when unauthenticated ───────────────────────────────────────────

describe('redirect when unauthenticated', () => {
  it('redirects to /login by default when not authenticated', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isChecking: false, user: null });
    renderHook(() => useAuthGuard());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
  });

  it('redirects to custom path when provided', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isChecking: false, user: null });
    renderHook(() => useAuthGuard({ redirectTo: '/auth/signin' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/signin'));
  });

  it('does not redirect when requireAuth = false', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isChecking: false, user: null });
    renderHook(() => useAuthGuard({ requireAuth: false }));
    await waitFor(() => expect(mockPush).not.toHaveBeenCalled());
  });
});

// ─── callbacks ────────────────────────────────────────────────────────────────

describe('callbacks', () => {
  it('calls onAuthFailure when unauthenticated', async () => {
    const onAuthFailure = jest.fn();
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isChecking: false, user: null });
    renderHook(() => useAuthGuard({ onAuthFailure }));
    await waitFor(() => expect(onAuthFailure).toHaveBeenCalled());
  });

  it('calls onAuthSuccess when authenticated', async () => {
    const onAuthSuccess = jest.fn();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isChecking: false, user: { id: 'u1' } });
    renderHook(() => useAuthGuard({ onAuthSuccess }));
    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalled());
  });

  it('does not call onAuthSuccess when not authenticated', async () => {
    const onAuthSuccess = jest.fn();
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isChecking: false, user: null });
    renderHook(() => useAuthGuard({ onAuthSuccess }));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(onAuthSuccess).not.toHaveBeenCalled();
  });
});

// ─── checkAuth ────────────────────────────────────────────────────────────────

describe('checkAuth', () => {
  it('can be called without throwing', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isChecking: false, user: null });
    const { result } = renderHook(() => useAuthGuard());
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(() => act(() => { result.current.checkAuth(); })).not.toThrow();
  });
});

// ─── isChecking clears after check ───────────────────────────────────────────

describe('isChecking state', () => {
  it('becomes false after auth check completes', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isChecking: false, user: null });
    const { result } = renderHook(() => useAuthGuard());
    await waitFor(() => expect(result.current.isChecking).toBe(false));
  });

  it('stays true while isChecking = true from useAuth', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isChecking: true, user: null });
    const { result } = renderHook(() => useAuthGuard());
    expect(result.current.isChecking).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
