/**
 * Tests for hooks/use-conversation-join.ts
 */

const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastInfo = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

const mockGetAuthToken = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useConversationJoin } from '@/hooks/use-conversation-join';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window.location once at module level — jsdom doesn't allow re-defining it
delete (window as any).location;
(window as any).location = { href: '' };

const jsonResponse = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response);

const FORM = {
  firstName: 'Alice',
  lastName: 'Smith',
  username: 'alice_s001',
  email: '',
  birthday: '',
  language: 'fr',
};

const noop = jest.fn();
const generateUsername = jest.fn(() => 'alice_smith123');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockGetAuthToken.mockReturnValue(null);
  window.location.href = '';
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isJoining starts as false', () => {
    const { result } = renderHook(() => useConversationJoin('link-1'));
    expect(result.current.isJoining).toBe(false);
  });
});

// ─── joinAnonymously validation ───────────────────────────────────────────────

describe('joinAnonymously — validation', () => {
  it('shows error when firstName is empty', async () => {
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously({ ...FORM, firstName: '' }, noop, generateUsername);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error when lastName is empty', async () => {
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously({ ...FORM, lastName: '' }, noop, generateUsername);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error when requireNickname and username is empty', async () => {
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously({ ...FORM, username: '' }, noop, generateUsername, true);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error when requireEmail and email is empty', async () => {
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously({ ...FORM, email: '' }, noop, generateUsername, false, true);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error when requireBirthday and birthday is empty', async () => {
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously({ ...FORM, birthday: '' }, noop, generateUsername, false, false, true);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('proceeds when all required fields are present', async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useConversationJoin('link-1'));
    act(() => {
      result.current.joinAnonymously(FORM, noop, generateUsername);
    });
    expect(mockFetch).toHaveBeenCalled();
  });
});

// ─── joinAnonymously success ──────────────────────────────────────────────────

describe('joinAnonymously — success', () => {
  it('calls onSuccess with participant, sessionToken, and linkId', async () => {
    const participant = { username: 'alice_s001' };
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { participant, sessionToken: 'tok-1', conversationShareLinkId: 'share-1' } })
    );
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, onSuccess, generateUsername);
    });
    expect(onSuccess).toHaveBeenCalledWith(participant, 'tok-1', 'share-1');
  });

  it('falls back to linkId when conversationShareLinkId is missing', async () => {
    const participant = { username: 'alice_s001' };
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { participant, sessionToken: 'tok-1' } })
    );
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, onSuccess, generateUsername);
    });
    expect(onSuccess).toHaveBeenCalledWith(participant, 'tok-1', 'link-1');
  });

  it('saves linkId to localStorage', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { participant: {}, sessionToken: 'tok' } })
    );
    const { result } = renderHook(() => useConversationJoin('link-42'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, noop, generateUsername);
    });
    expect(localStorage.getItem('anonymous_current_link_id')).toBe('link-42');
  });

  it('shows welcome toast on success', async () => {
    const participant = { username: 'alice_s001' };
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { participant, sessionToken: 'tok' } })
    );
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, noop, generateUsername);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('alice_s001'));
  });

  it('isJoining returns to false after success', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { participant: {}, sessionToken: 'tok' } })
    );
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, noop, generateUsername);
    });
    expect(result.current.isJoining).toBe(false);
  });

  it('uses generateUsername when username field is blank', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { participant: {}, sessionToken: 'tok' } })
    );
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously({ ...FORM, username: '' }, noop, generateUsername);
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.username).toBe('alice_smith123'); // from generateUsername mock
  });
});

// ─── joinAnonymously failure ──────────────────────────────────────────────────

describe('joinAnonymously — failure', () => {
  it('shows error toast on API failure', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: false, message: 'Server error' }, false, 500));
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, noop, generateUsername);
    });
    expect(mockToastError).toHaveBeenCalledWith('Server error');
  });

  it('shows suggestedNickname toast on 409 conflict', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: false, message: 'Taken', suggestedNickname: 'alice_s002' }, false, 409)
    );
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, noop, generateUsername);
    });
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('alice_s002'));
  });

  it('shows default error on network exception', async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error('net')));
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAnonymously(FORM, noop, generateUsername);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.isJoining).toBe(false);
  });
});

// ─── joinAsAuthenticated ──────────────────────────────────────────────────────

describe('joinAsAuthenticated', () => {
  it('redirects to /chat/:linkId when already anonymous with sessionToken', async () => {
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAsAuthenticated(true, 'session-tok');
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/chat/link-1');
  });

  it('POSTs to conversations/join when authToken is present', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { conversationId: 'conv-99' } })
    );
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAsAuthenticated(false, null);
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/join/link-1'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('redirects to conversation page on success', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { conversationId: 'conv-99' } })
    );
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAsAuthenticated(false, null);
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/conversations/conv-99');
  });

  it('shows error when conversationId is missing from response', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockReturnValue(jsonResponse({ success: true, data: {} }));
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAsAuthenticated(false, null);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('shows error toast when HTTP response is not ok', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockReturnValue(jsonResponse({ message: 'Forbidden' }, false, 403));
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAsAuthenticated(false, null);
    });
    expect(mockToastError).toHaveBeenCalledWith('Forbidden');
  });

  it('isJoining returns to false after completion', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { conversationId: 'c1' } })
    );
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAsAuthenticated(false, null);
    });
    expect(result.current.isJoining).toBe(false);
  });

  it('shows error on network exception', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockReturnValue(Promise.reject(new Error('network')));
    const { result } = renderHook(() => useConversationJoin('link-1'));
    await act(async () => {
      await result.current.joinAsAuthenticated(false, null);
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.isJoining).toBe(false);
  });
});
