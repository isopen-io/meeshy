/**
 * Tests for hooks/use-contacts-actions.ts
 */

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => 'test-token'),
    getCurrentUser: jest.fn(() => ({
      id: 'current-user',
      displayName: 'Me',
      username: 'me',
    })),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((ep: string) => `http://localhost:3000/api/v1${ep}`),
}));

import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useContactsActions } from '@/hooks/use-contacts-actions';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { User } from '@/types';

const mockGetAuthToken = authManager.getAuthToken as jest.MockedFunction<typeof authManager.getAuthToken>;
const mockGetCurrentUser = authManager.getCurrentUser as jest.MockedFunction<typeof authManager.getCurrentUser>;
const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;
const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockFetch = jest.fn();
global.fetch = mockFetch;

const t = (key: string) => key;
const getUserDisplayName = (user: User) => user.displayName || user.username || '';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    ...overrides,
  } as User);

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

const failJson = (data: unknown) =>
  Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve(data) });

beforeEach(() => {
  jest.resetAllMocks();
  mockGetAuthToken.mockReturnValue('test-token');
  mockGetCurrentUser.mockReturnValue({ id: 'me', displayName: 'Me', username: 'me' } as User);
  mockBuildApiUrl.mockImplementation((ep: string) => `http://localhost:3000/api/v1${ep}`);
  mockUseRouter.mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);
});

// ─── startConversation ────────────────────────────────────────────────────────

describe('startConversation', () => {
  it('shows error toast when userId is empty', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('', [makeUser()]);
    });

    expect(toast.error).toHaveBeenCalledWith('errors.invalidUser');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error toast when userId is whitespace', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('   ', [makeUser()]);
    });

    expect(toast.error).toHaveBeenCalledWith('errors.invalidUser');
  });

  it('returns early when contact not found in displayedUsers', async () => {
    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('unknown-id', [makeUser({ id: 'user-1' })]);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('redirects to /login when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('user-1', [makeUser({ id: 'user-1' })]);
    });

    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates conversation and navigates on success', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({ success: true, data: { id: 'conv-123' } })
    );

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('user-1', [makeUser({ id: 'user-1' })]);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('success.conversationCreated');
    expect(mockPush).toHaveBeenCalledWith('/conversations/conv-123');
  });

  it('sends correct participantIds and type in request body', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({ success: true, data: { id: 'conv-xyz' } })
    );

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('user-1', [makeUser({ id: 'user-1' })]);
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.type).toBe('direct');
    expect(body.participantIds).toContain('user-1');
  });

  it('shows error toast when API returns ok:false', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce(
      failJson({ error: 'Already exists' })
    );

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('user-1', [makeUser({ id: 'user-1' })]);
    });

    expect(toast.error).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows error toast when API returns success:false', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce(
      okJson({ success: false, error: 'Bad request' })
    );

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('user-1', [makeUser({ id: 'user-1' })]);
    });

    expect(toast.error).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows error toast on network exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.startConversation('user-1', [makeUser({ id: 'user-1' })]);
    });

    expect(toast.error).toHaveBeenCalledWith('Network error');
    consoleSpy.mockRestore();
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

  it('shows success toast on accept', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });

    expect(toast.success).toHaveBeenCalledWith('success.friendRequestAccepted');
  });

  it('shows success toast on reject', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'reject');
    });

    expect(toast.success).toHaveBeenCalledWith('success.friendRequestRejected');
  });

  it('sends accepted status in body when accepting', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.status).toBe('accepted');
  });

  it('calls onRefresh after accept', async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() =>
      useContactsActions(t, getUserDisplayName, onRefresh)
    );

    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });

    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValueOnce(failJson({ error: 'Not found' }));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it('shows error toast on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.handleFriendRequest('req-1', 'accept');
    });

    expect(toast.error).toHaveBeenCalledWith('errors.updateError');
    consoleSpy.mockRestore();
  });
});

// ─── sendFriendRequest ────────────────────────────────────────────────────────

describe('sendFriendRequest', () => {
  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.sendFriendRequest('user-2');
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows success toast on success', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.sendFriendRequest('user-2');
    });

    expect(toast.success).toHaveBeenCalledWith('success.friendRequestSent');
  });

  it('sends receiverId in request body', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.sendFriendRequest('user-2');
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.receiverId).toBe('user-2');
  });

  it('calls onSuccess callback on success', async () => {
    const onSuccess = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.sendFriendRequest('user-2', onSuccess);
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValueOnce(failJson({ error: 'Already friends' }));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.sendFriendRequest('user-2');
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it('shows error toast on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network'));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.sendFriendRequest('user-2');
    });

    expect(toast.error).toHaveBeenCalledWith('errors.sendError');
    consoleSpy.mockRestore();
  });
});

// ─── cancelFriendRequest ──────────────────────────────────────────────────────

describe('cancelFriendRequest', () => {
  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.cancelFriendRequest('req-1');
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows success toast on success', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.cancelFriendRequest('req-1');
    });

    expect(toast.success).toHaveBeenCalledWith('success.friendRequestCancelled');
  });

  it('sends DELETE request to correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.cancelFriendRequest('req-42');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/friend-requests/req-42'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('calls onSuccess callback on success', async () => {
    const onSuccess = jest.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(okJson({}));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.cancelFriendRequest('req-1', onSuccess);
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValueOnce(failJson({ error: 'Not found' }));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.cancelFriendRequest('req-1');
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it('shows error toast on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network'));

    const { result } = renderHook(() => useContactsActions(t, getUserDisplayName));

    await act(async () => {
      await result.current.cancelFriendRequest('req-1');
    });

    expect(toast.error).toHaveBeenCalledWith('errors.updateError');
    consoleSpy.mockRestore();
  });
});
