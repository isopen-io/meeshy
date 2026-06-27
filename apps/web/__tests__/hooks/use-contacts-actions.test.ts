/**
 * Tests for hooks/use-contacts-actions.ts
 */

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockGetAuthToken = jest.fn();
const mockGetCurrentUser = jest.fn();
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getCurrentUser: () => mockGetCurrentUser(),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act } from '@testing-library/react';
import { useContactsActions } from '@/hooks/use-contacts-actions';
import type { User } from '@/types';

const t = (key: string) => `t:${key}`;
const getUserDisplayName = (user: User) => user.username || user.id;

const makeUser = (id: string): User => ({ id, username: `user_${id}` } as User);

const jsonResponse = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(data) } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue('jwt-token');
  mockGetCurrentUser.mockReturnValue({ id: 'me', username: 'alice', displayName: 'Alice' });
  mockFetch.mockResolvedValue(jsonResponse({ success: true, data: { id: 'conv-99' } }));
});

// ─── startConversation ────────────────────────────────────────────────────────

describe('startConversation', () => {
  it('shows error when userId is empty', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.startConversation('', [makeUser('u1')]);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does nothing when user is not in displayedUsers', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.startConversation('u-missing', [makeUser('u1')]);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('redirects to /login when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.startConversation('u1', [makeUser('u1')]);
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/login');
  });

  it('POSTs to /conversations with correct body', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.startConversation('u1', [makeUser('u1')]);
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/conversations'),
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe('direct');
    expect(body.participantIds).toContain('u1');
  });

  it('redirects to conversation page on success', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.startConversation('u1', [makeUser('u1')]);
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/conversations/conv-99');
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Server error' }, false, 500));
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.startConversation('u1', [makeUser('u1')]);
    });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('shows error toast on network exception', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.startConversation('u1', [makeUser('u1')]);
    });
    expect(mockToastError).toHaveBeenCalled();
  });
});

// ─── handleFriendRequest ──────────────────────────────────────────────────────

describe('handleFriendRequest', () => {
  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends PATCH with accepted status on accept', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('accepted');
  });

  it('sends PATCH with rejected status on reject', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'reject');
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('rejected');
  });

  it('calls onRefresh callback after successful accept', async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName, onRefresh));
    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows success toast on accept', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});

// ─── sendFriendRequest ────────────────────────────────────────────────────────

describe('sendFriendRequest', () => {
  it('POSTs to /friend-requests with receiverId', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => { await result.current.sendFriendRequest('u1'); });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.receiverId).toBe('u1');
  });

  it('shows success toast on success', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => { await result.current.sendFriendRequest('u1'); });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('calls onSuccess callback on success', async () => {
    const onSuccess = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => { await result.current.sendFriendRequest('u1', onSuccess); });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => { await result.current.sendFriendRequest('u1'); });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── cancelFriendRequest ──────────────────────────────────────────────────────

describe('cancelFriendRequest', () => {
  it('sends DELETE to /friend-requests/:id', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => { await result.current.cancelFriendRequest('req-1'); });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/friend-requests/req-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('shows success toast on success', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => { await result.current.cancelFriendRequest('req-1'); });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('calls onSuccess callback on success', async () => {
    const onSuccess = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));
    await act(async () => { await result.current.cancelFriendRequest('req-1', onSuccess); });
    expect(onSuccess).toHaveBeenCalled();
  });
});
