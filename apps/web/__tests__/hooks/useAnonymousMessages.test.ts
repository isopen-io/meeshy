/**
 * Tests for hooks/use-anonymous-messages.ts
 */

jest.mock('@/services/anonymous-chat.service', () => ({
  anonymousChatService: {
    hasActiveSession: jest.fn(() => false),
    initialize: jest.fn(),
    loadMessages: jest.fn(),
    sendMessage: jest.fn(),
    refreshSession: jest.fn(),
    leaveSession: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAnonymousMessages } from '@/hooks/use-anonymous-messages';
import { anonymousChatService } from '@/services/anonymous-chat.service';
import { toast } from 'sonner';

const mockService = anonymousChatService as jest.Mocked<typeof anonymousChatService>;

const makeMessage = (overrides = {}) => ({
  id: 'msg-1',
  content: 'Hello',
  originalLanguage: 'en',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const makeLoadResult = (messages: unknown[] = [], hasMore = false) => ({
  messages,
  hasMore,
});

beforeEach(() => {
  jest.resetAllMocks();
  mockService.hasActiveSession.mockReturnValue(false);
  mockService.initialize.mockImplementation(() => undefined);
  mockService.loadMessages.mockResolvedValue(makeLoadResult() as any);
  mockService.sendMessage.mockResolvedValue({ id: 'new-msg', messageId: 'new-msg' } as any);
  mockService.refreshSession.mockResolvedValue({ linkId: 'test' } as any);
  mockService.leaveSession.mockResolvedValue(undefined as any);
});

// ─── initialization ───────────────────────────────────────────────────────────

describe('initialization', () => {
  it('calls initialize with linkId on mount', () => {
    renderHook(() => useAnonymousMessages('link-abc'));

    expect(mockService.initialize).toHaveBeenCalledWith('link-abc');
  });

  it('starts with empty messages', () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.messages).toEqual([]);
  });

  it('starts with isLoading false', () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.isLoading).toBe(false);
  });

  it('starts with hasMore true', () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.hasMore).toBe(true);
  });

  it('starts with error null', () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.error).toBeNull();
  });

  it('does not auto-load when no active session', () => {
    mockService.hasActiveSession.mockReturnValue(false);
    renderHook(() => useAnonymousMessages('link-1'));
    expect(mockService.loadMessages).not.toHaveBeenCalled();
  });

  it('auto-loads messages when session is already active', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages.mockResolvedValue(makeLoadResult([makeMessage()]) as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    expect(mockService.loadMessages).toHaveBeenCalledWith(50, 0);
  });

  it('exposes hasActiveSession value', () => {
    mockService.hasActiveSession.mockReturnValue(true);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.hasActiveSession).toBe(true);
  });
});

// ─── loadMessages ─────────────────────────────────────────────────────────────

describe('loadMessages', () => {
  it('sets error when no active session', async () => {
    mockService.hasActiveSession.mockReturnValue(false);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.loadMessages();
    });

    expect(result.current.error).toBe('Aucune session anonyme active');
    expect(mockService.loadMessages).not.toHaveBeenCalled();
  });

  it('replaces messages on offset 0', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    const msgs = [makeMessage({ id: 'm1' }), makeMessage({ id: 'm2' })];
    mockService.loadMessages.mockResolvedValue(makeLoadResult(msgs) as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.loadMessages(50, 0);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].id).toBe('m1');
  });

  it('appends messages on offset > 0 (pagination)', async () => {
    // Start with no session so auto-load doesn't consume mocks
    mockService.hasActiveSession.mockReturnValue(false);

    const firstPage = [makeMessage({ id: 'm1' })];
    const secondPage = [makeMessage({ id: 'm2' })];

    mockService.loadMessages
      .mockResolvedValueOnce(makeLoadResult(firstPage) as any)
      .mockResolvedValueOnce(makeLoadResult(secondPage) as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    // Enable session for explicit calls
    mockService.hasActiveSession.mockReturnValue(true);

    await act(async () => {
      await result.current.loadMessages(50, 0);
    });

    await act(async () => {
      await result.current.loadMessages(50, 1);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('sets hasMore from response', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages.mockResolvedValue(makeLoadResult([], true) as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.loadMessages();
    });

    expect(result.current.hasMore).toBe(true);
  });

  it('sets isLoading during fetch and clears after', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    let resolve!: (v: any) => void;
    mockService.loadMessages.mockReturnValueOnce(new Promise(r => { resolve = r; }));

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    act(() => {
      void result.current.loadMessages();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => {
      resolve(makeLoadResult());
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('sets error and shows toast on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages.mockRejectedValueOnce(new Error('Network fail'));

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.loadMessages();
    });

    expect(result.current.error).toBe('Network fail');
    expect(toast.error).toHaveBeenCalledWith('Erreur lors du chargement des messages');
    consoleSpy.mockRestore();
  });

  it('sets isLoading false after error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.loadMessages();
    });

    expect(result.current.isLoading).toBe(false);
    consoleSpy.mockRestore();
  });

  it('clears error on successful load', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce(makeLoadResult() as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => { await result.current.loadMessages(); });
    expect(result.current.error).not.toBeNull();

    await act(async () => { await result.current.loadMessages(); });
    expect(result.current.error).toBeNull();
    consoleSpy.mockRestore();
  });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('returns false and shows toast when no active session', async () => {
    mockService.hasActiveSession.mockReturnValue(false);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.sendMessage('Hello');
    });

    expect(returnValue).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Session anonyme non active');
    expect(mockService.sendMessage).not.toHaveBeenCalled();
  });

  it('returns false and shows toast for empty content', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.sendMessage('   ');
    });

    expect(returnValue).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Le message ne peut pas être vide');
    expect(mockService.sendMessage).not.toHaveBeenCalled();
  });

  it('adds message to list and returns true on success', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.sendMessage.mockResolvedValueOnce({ messageId: 'sent-1', id: 'sent-1' } as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.sendMessage('Hello world', 'en');
    });

    expect(returnValue).toBe(true);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello world');
    expect(result.current.messages[0].originalLanguage).toBe('en');
  });

  it('defaults originalLanguage to fr', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.sendMessage.mockResolvedValueOnce({ messageId: 'sent-1' } as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(result.current.messages[0].originalLanguage).toBe('fr');
  });

  it('returns false on send exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.sendMessage.mockRejectedValueOnce(new Error('send failed'));

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.sendMessage('Hello');
    });

    expect(returnValue).toBe(false);
    expect(result.current.messages).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});

// ─── refreshSession ───────────────────────────────────────────────────────────

describe('refreshSession', () => {
  it('reloads messages and returns chatData on success', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    const chatData = { linkId: 'link-abc' };
    mockService.refreshSession.mockResolvedValueOnce(chatData as any);
    mockService.loadMessages.mockResolvedValue(makeLoadResult([makeMessage()]) as any);

    const { result } = renderHook(() => useAnonymousMessages('link-abc'));

    // Clear calls from auto-load
    mockService.loadMessages.mockClear();
    mockService.loadMessages.mockResolvedValue(makeLoadResult([makeMessage()]) as any);

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.refreshSession();
    });

    expect(returnValue).toEqual(chatData);
    expect(mockService.loadMessages).toHaveBeenCalledWith(50, 0);
  });

  it('returns null when chatData is null', async () => {
    mockService.refreshSession.mockResolvedValueOnce(null as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.refreshSession();
    });

    expect(returnValue).toBeNull();
    expect(mockService.loadMessages).not.toHaveBeenCalled();
  });

  it('sets error on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockService.refreshSession.mockRejectedValueOnce(new Error('session gone'));

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.refreshSession();
    });

    expect(result.current.error).toBe('Session expirée');
    consoleSpy.mockRestore();
  });
});

// ─── leaveSession ─────────────────────────────────────────────────────────────

describe('leaveSession', () => {
  it('clears messages on leave', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages.mockResolvedValue(makeLoadResult([makeMessage()]) as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    await act(async () => {
      await result.current.leaveSession();
    });

    expect(result.current.messages).toEqual([]);
  });

  it('resets hasMore to true on leave', async () => {
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages.mockResolvedValue(makeLoadResult([], false) as any);

    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    await act(async () => {
      await result.current.leaveSession();
    });

    expect(result.current.hasMore).toBe(true);
  });

  it('clears error on leave', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockService.hasActiveSession.mockReturnValue(true);
    mockService.loadMessages.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    mockService.leaveSession.mockResolvedValueOnce(undefined as any);
    await act(async () => {
      await result.current.leaveSession();
    });

    expect(result.current.error).toBeNull();
    consoleSpy.mockRestore();
  });

  it('does not throw on leave error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockService.leaveSession.mockRejectedValueOnce(new Error('leave failed'));

    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await expect(
      act(async () => { await result.current.leaveSession(); })
    ).resolves.not.toThrow();

    consoleSpy.mockRestore();
  });

  it('calls leaveSession on service', async () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));

    await act(async () => {
      await result.current.leaveSession();
    });

    expect(mockService.leaveSession).toHaveBeenCalled();
  });
});
