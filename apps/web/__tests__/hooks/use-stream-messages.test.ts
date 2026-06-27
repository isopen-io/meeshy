/**
 * Tests for hooks/use-stream-messages.ts
 */

const mockEditMessage = jest.fn();
const mockDeleteMessage = jest.fn();
jest.mock('@/services/message.service', () => ({
  messageService: {
    editMessage: (...args: unknown[]) => mockEditMessage(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  },
}));

const mockSetReplyingTo = jest.fn();
jest.mock('@/stores/reply-store', () => ({
  useReplyStore: {
    getState: () => ({ setReplyingTo: mockSetReplyingTo }),
  },
}));

jest.mock('@meeshy/shared/types/role-types', () => ({
  getEffectiveRole: (globalRole: string, conversationRole?: string) =>
    (conversationRole || globalRole).toUpperCase(),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useStreamMessages } from '@/hooks/use-stream-messages';
import type { User, Message } from '@meeshy/shared/types';
import { createRef } from 'react';

const makeUser = (): User => ({ id: 'u1', username: 'alice', role: 'USER' } as unknown as User);

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'conv-1',
  user: makeUser(),
  messages: [] as Message[],
  hasMore: false,
  selectedInputLanguage: 'fr',
  refreshMessages: jest.fn().mockResolvedValue(undefined),
  loadMore: jest.fn(),
  messageComposerRef: createRef<HTMLInputElement>(),
  t: (key: string) => `t:${key}`,
  tCommon: (key: string) => `tc:${key}`,
  conversationRole: undefined,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── handleEditMessage ────────────────────────────────────────────────────────

describe('handleEditMessage', () => {
  it('calls messageService.editMessage with conversationId and messageId', async () => {
    mockEditMessage.mockResolvedValue({});
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => {
      await result.current.handleEditMessage('msg-1', 'Updated text', 'en');
    });
    expect(mockEditMessage).toHaveBeenCalledWith('conv-1', 'msg-1', {
      content: 'Updated text',
      originalLanguage: 'en',
    });
  });

  it('calls refreshMessages after successful edit', async () => {
    mockEditMessage.mockResolvedValue({});
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => { await result.current.handleEditMessage('msg-1', 'text', 'en'); });
    expect(props.refreshMessages).toHaveBeenCalled();
  });

  it('shows success toast after edit', async () => {
    mockEditMessage.mockResolvedValue({});
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => { await result.current.handleEditMessage('msg-1', 'text', 'en'); });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('shows error toast and rethrows on failure', async () => {
    mockEditMessage.mockRejectedValue(new Error('edit failed'));
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await expect(
      act(async () => { await result.current.handleEditMessage('msg-1', 'text', 'en'); })
    ).rejects.toThrow('edit failed');
    expect(mockToastError).toHaveBeenCalled();
  });
});

// ─── handleDeleteMessage ──────────────────────────────────────────────────────

describe('handleDeleteMessage', () => {
  it('calls messageService.deleteMessage with conversationId and messageId', async () => {
    mockDeleteMessage.mockResolvedValue({});
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => { await result.current.handleDeleteMessage('msg-2'); });
    expect(mockDeleteMessage).toHaveBeenCalledWith('conv-1', 'msg-2');
  });

  it('calls refreshMessages after successful delete', async () => {
    mockDeleteMessage.mockResolvedValue({});
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => { await result.current.handleDeleteMessage('msg-2'); });
    expect(props.refreshMessages).toHaveBeenCalled();
  });

  it('shows success toast after delete', async () => {
    mockDeleteMessage.mockResolvedValue({});
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => { await result.current.handleDeleteMessage('msg-2'); });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('shows error toast and rethrows on failure', async () => {
    mockDeleteMessage.mockRejectedValue(new Error('delete failed'));
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await expect(
      act(async () => { await result.current.handleDeleteMessage('msg-2'); })
    ).rejects.toThrow('delete failed');
    expect(mockToastError).toHaveBeenCalled();
  });
});

// ─── handleReplyMessage ───────────────────────────────────────────────────────

describe('handleReplyMessage', () => {
  it('calls setReplyingTo with message data', () => {
    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    const message = {
      id: 'msg-3',
      content: 'Reply to this',
      originalLanguage: 'fr',
      sender: { id: 'u2' },
      createdAt: new Date(),
      translations: [],
      attachments: [],
    };
    act(() => { result.current.handleReplyMessage(message); });
    expect(mockSetReplyingTo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-3', content: 'Reply to this' })
    );
  });
});

// ─── handleNavigateToMessage ──────────────────────────────────────────────────

describe('handleNavigateToMessage', () => {
  it('scrolls to element when it exists in the DOM', async () => {
    const el = document.createElement('div');
    el.id = 'message-msg-4';
    el.scrollIntoView = jest.fn();
    document.body.appendChild(el);

    const props = makeProps();
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => { await result.current.handleNavigateToMessage('msg-4'); });
    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
    document.body.removeChild(el);
  });

  it('shows error toast when message not in DOM and hasMore=false', async () => {
    const props = makeProps({ hasMore: false, messages: [] });
    const { result } = renderHook(() => useStreamMessages(props));
    await act(async () => { await result.current.handleNavigateToMessage('missing-msg'); });
    expect(mockToastError).toHaveBeenCalled();
  });
});

// ─── getUserModerationRole ────────────────────────────────────────────────────

describe('getUserModerationRole', () => {
  it('returns conversationRole (uppercased) when provided', () => {
    const props = makeProps({ conversationRole: 'moderator' });
    const { result } = renderHook(() => useStreamMessages(props));
    expect(result.current.getUserModerationRole()).toBe('MODERATOR');
  });

  it('falls back to user.role when no conversationRole', () => {
    const props = makeProps({ conversationRole: undefined });
    const { result } = renderHook(() => useStreamMessages(props));
    expect(result.current.getUserModerationRole()).toBe('USER');
  });
});
