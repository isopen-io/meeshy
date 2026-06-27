/**
 * Tests for hooks/use-stream-messages.ts
 */

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@/services/message.service', () => ({
  messageService: {
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
  },
}));

jest.mock('@/stores/reply-store', () => ({
  useReplyStore: {
    getState: jest.fn(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useStreamMessages } from '@/hooks/use-stream-messages';
import { messageService } from '@/services/message.service';
import { useReplyStore } from '@/stores/reply-store';
import { toast } from 'sonner';

const mockEditMessage = messageService.editMessage as jest.MockedFunction<typeof messageService.editMessage>;
const mockDeleteMessage = messageService.deleteMessage as jest.MockedFunction<typeof messageService.deleteMessage>;
const mockSetReplyingTo = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  mockEditMessage.mockResolvedValue({} as any);
  mockDeleteMessage.mockResolvedValue({} as any);
  (useReplyStore.getState as jest.Mock).mockReturnValue({ setReplyingTo: mockSetReplyingTo });
});

const makeUser = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'user-1', role: 'USER', ...overrides } as any);

const makeMessage = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'msg-1', content: 'Hello', originalLanguage: 'en', ...overrides } as any);

const makeOptions = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'conv-1',
  user: makeUser(),
  messages: [],
  hasMore: false,
  selectedInputLanguage: 'fr',
  refreshMessages: jest.fn().mockResolvedValue(undefined),
  loadMore: jest.fn(),
  messageComposerRef: { current: null } as any,
  t: (key: string) => key,
  tCommon: (key: string) => key,
  ...overrides,
});

// ─── handleEditMessage ────────────────────────────────────────────────────────

describe('handleEditMessage', () => {
  it('calls messageService.editMessage with correct args', async () => {
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    await act(async () => {
      await result.current.handleEditMessage('msg-1', 'Updated content', 'en');
    });

    expect(mockEditMessage).toHaveBeenCalledWith('conv-1', 'msg-1', {
      content: 'Updated content',
      originalLanguage: 'en',
    });
  });

  it('calls refreshMessages after edit', async () => {
    const refreshMessages = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStreamMessages(makeOptions({ refreshMessages })));

    await act(async () => {
      await result.current.handleEditMessage('msg-1', 'New', 'fr');
    });

    expect(refreshMessages).toHaveBeenCalled();
  });

  it('shows success toast on edit', async () => {
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    await act(async () => {
      await result.current.handleEditMessage('msg-1', 'New', 'fr');
    });

    expect(toast.success).toHaveBeenCalled();
  });

  it('shows error toast and re-throws on edit failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockEditMessage.mockRejectedValueOnce(new Error('edit failed'));
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    await expect(
      act(async () => {
        await result.current.handleEditMessage('msg-1', 'New', 'fr');
      })
    ).rejects.toThrow('edit failed');

    expect(toast.error).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── handleDeleteMessage ──────────────────────────────────────────────────────

describe('handleDeleteMessage', () => {
  it('calls messageService.deleteMessage with correct args', async () => {
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    await act(async () => {
      await result.current.handleDeleteMessage('msg-42');
    });

    expect(mockDeleteMessage).toHaveBeenCalledWith('conv-1', 'msg-42');
  });

  it('calls refreshMessages after delete', async () => {
    const refreshMessages = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStreamMessages(makeOptions({ refreshMessages })));

    await act(async () => {
      await result.current.handleDeleteMessage('msg-1');
    });

    expect(refreshMessages).toHaveBeenCalled();
  });

  it('shows success toast on delete', async () => {
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    await act(async () => {
      await result.current.handleDeleteMessage('msg-1');
    });

    expect(toast.success).toHaveBeenCalled();
  });

  it('shows error toast and re-throws on delete failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDeleteMessage.mockRejectedValueOnce(new Error('delete failed'));
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    await expect(
      act(async () => {
        await result.current.handleDeleteMessage('msg-1');
      })
    ).rejects.toThrow('delete failed');

    expect(toast.error).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── handleReplyMessage ───────────────────────────────────────────────────────

describe('handleReplyMessage', () => {
  it('calls setReplyingTo with message data', () => {
    const message = makeMessage({ id: 'reply-1', content: 'Hello' });
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    act(() => {
      result.current.handleReplyMessage(message);
    });

    expect(mockSetReplyingTo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reply-1',
        content: 'Hello',
      })
    );
  });

  it('focuses messageComposerRef if present', () => {
    const mockFocus = jest.fn();
    const messageComposerRef = { current: { focus: mockFocus } } as any;
    const { result } = renderHook(() => useStreamMessages(makeOptions({ messageComposerRef })));

    act(() => {
      result.current.handleReplyMessage(makeMessage());
    });

    expect(mockFocus).toHaveBeenCalled();
  });

  it('does not throw when messageComposerRef.current is null', () => {
    const { result } = renderHook(() =>
      useStreamMessages(makeOptions({ messageComposerRef: { current: null } }))
    );

    expect(() => {
      act(() => { result.current.handleReplyMessage(makeMessage()); });
    }).not.toThrow();
  });
});

// ─── getUserModerationRole ────────────────────────────────────────────────────

describe('getUserModerationRole', () => {
  it('returns a string role', () => {
    const { result } = renderHook(() =>
      useStreamMessages(makeOptions({ user: makeUser({ role: 'USER' }) }))
    );

    const role = result.current.getUserModerationRole();
    expect(typeof role).toBe('string');
  });

  it('elevated conversationRole wins over lower global role', () => {
    const { result } = renderHook(() =>
      useStreamMessages(makeOptions({
        user: makeUser({ role: 'USER' }),
        conversationRole: 'ADMIN',
      }))
    );

    const role = result.current.getUserModerationRole();
    expect(role).toBe('ADMIN');
  });

  it('global ADMIN role wins over no conversationRole', () => {
    const { result } = renderHook(() =>
      useStreamMessages(makeOptions({
        user: makeUser({ role: 'BIGBOSS' }),
      }))
    );

    const role = result.current.getUserModerationRole();
    expect(role).toBe('BIGBOSS');
  });
});

// ─── handleNavigateToMessage ──────────────────────────────────────────────────

describe('handleNavigateToMessage', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('scrolls to existing DOM element', async () => {
    const el = document.createElement('div');
    el.id = 'message-msg-dom';
    document.body.appendChild(el);
    const scrollSpy = jest.spyOn(el, 'scrollIntoView').mockImplementation(() => {});

    jest.useFakeTimers();
    const { result } = renderHook(() => useStreamMessages(makeOptions()));

    await act(async () => {
      const p = result.current.handleNavigateToMessage('msg-dom');
      jest.runAllTimers();
      await p;
    });

    expect(scrollSpy).toHaveBeenCalled();
  });

  it('shows messageNotFound toast when element not in DOM and hasMore=false', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useStreamMessages(makeOptions({ hasMore: false, messages: [] }))
    );

    await act(async () => {
      const p = result.current.handleNavigateToMessage('nonexistent-msg');
      jest.runAllTimers();
      await p;
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it('shows loadingOlderMessages toast when message not found but hasMore=true', async () => {
    jest.useFakeTimers();
    const loadMore = jest.fn();
    const { result } = renderHook(() =>
      useStreamMessages(makeOptions({ hasMore: true, loadMore, messages: [] }))
    );

    // Start navigation — do not await (it has internal timers)
    act(() => {
      result.current.handleNavigateToMessage('missing-msg');
    });

    // toast.info with loadingOlderMessages is called synchronously before timers
    expect(toast.info).toHaveBeenCalled();
  });
});
