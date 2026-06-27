/**
 * Tests for hooks/use-anonymous-messages.ts
 */

const mockInitialize = jest.fn();
const mockHasActiveSession = jest.fn<boolean, []>();
const mockLoadMessages = jest.fn();
const mockSendMessage = jest.fn();
const mockRefreshSession = jest.fn();
const mockLeaveSession = jest.fn();

jest.mock('@/services/anonymous-chat.service', () => ({
  anonymousChatService: {
    initialize: (...args: unknown[]) => mockInitialize(...args),
    hasActiveSession: () => mockHasActiveSession(),
    loadMessages: (...args: unknown[]) => mockLoadMessages(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    refreshSession: () => mockRefreshSession(),
    leaveSession: () => mockLeaveSession(),
  },
}));

const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAnonymousMessages } from '@/hooks/use-anonymous-messages';

const makeMsg = (id: string) => ({
  id,
  content: `content-${id}`,
  originalLanguage: 'fr',
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockHasActiveSession.mockReturnValue(false);
  mockLoadMessages.mockResolvedValue({ messages: [], hasMore: false });
  mockSendMessage.mockResolvedValue({ messageId: 'new-msg', id: 'new-msg' });
  mockRefreshSession.mockResolvedValue({ id: 'chat-1' });
  mockLeaveSession.mockResolvedValue(undefined);
});

// ─── initialization ───────────────────────────────────────────────────────────

describe('initialization', () => {
  it('initializes anonymousChatService with the linkId', () => {
    renderHook(() => useAnonymousMessages('link-1'));
    expect(mockInitialize).toHaveBeenCalledWith('link-1');
  });

  it('starts with empty messages', () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.messages).toEqual([]);
  });

  it('starts with isLoading=false', () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.isLoading).toBe(false);
  });

  it('starts with error=null', () => {
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    expect(result.current.error).toBeNull();
  });

  it('auto-loads messages when session is active on mount', async () => {
    mockHasActiveSession.mockReturnValue(true);
    renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(mockLoadMessages).toHaveBeenCalledWith(50, 0));
  });

  it('does not auto-load messages when no active session', () => {
    mockHasActiveSession.mockReturnValue(false);
    renderHook(() => useAnonymousMessages('link-1'));
    expect(mockLoadMessages).not.toHaveBeenCalled();
  });
});

// ─── loadMessages ─────────────────────────────────────────────────────────────

describe('loadMessages', () => {
  it('sets error when no active session', async () => {
    mockHasActiveSession.mockReturnValue(false);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await act(async () => { await result.current.loadMessages(); });
    expect(result.current.error).toBeTruthy();
  });

  it('replaces messages on first load (offset=0)', async () => {
    mockHasActiveSession.mockReturnValue(true);
    const msgs = [makeMsg('m1'), makeMsg('m2')];
    mockLoadMessages.mockResolvedValue({ messages: msgs, hasMore: false });
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
  });

  it('appends messages on paginated load (offset>0)', async () => {
    mockHasActiveSession.mockReturnValue(true);
    mockLoadMessages
      .mockResolvedValueOnce({ messages: [makeMsg('m1')], hasMore: true })
      .mockResolvedValueOnce({ messages: [makeMsg('m2')], hasMore: false });
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => { await result.current.loadMessages(50, 1); });
    expect(result.current.messages).toHaveLength(2);
  });

  it('sets hasMore from response', async () => {
    mockHasActiveSession.mockReturnValue(true);
    mockLoadMessages.mockResolvedValue({ messages: [], hasMore: true });
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
  });

  it('sets error on load failure', async () => {
    mockHasActiveSession.mockReturnValue(true);
    // Override the auto-load so it doesn't fire first
    mockLoadMessages.mockRejectedValue(new Error('load failed'));
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await act(async () => { await result.current.loadMessages(); });
    expect(result.current.error).toBeTruthy();
    expect(mockToastError).toHaveBeenCalled();
  });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('returns false when no active session', async () => {
    mockHasActiveSession.mockReturnValue(false);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    let res: boolean | undefined;
    await act(async () => { res = await result.current.sendMessage('hello'); });
    expect(res).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
  });

  it('returns false when content is empty', async () => {
    mockHasActiveSession.mockReturnValue(true);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    let res: boolean | undefined;
    await act(async () => { res = await result.current.sendMessage('   '); });
    expect(res).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
  });

  it('returns true and adds message to list on success', async () => {
    mockHasActiveSession.mockReturnValue(true);
    mockLoadMessages.mockResolvedValue({ messages: [], hasMore: false });
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let res: boolean | undefined;
    await act(async () => { res = await result.current.sendMessage('Hello', 'fr'); });
    expect(res).toBe(true);
    expect(result.current.messages.some(m => m.content === 'Hello')).toBe(true);
  });

  it('returns false on send error', async () => {
    mockHasActiveSession.mockReturnValue(true);
    mockSendMessage.mockRejectedValue(new Error('send failed'));
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    let res: boolean | undefined;
    await act(async () => { res = await result.current.sendMessage('Hello'); });
    expect(res).toBe(false);
  });
});

// ─── leaveSession ────────────────────────────────────────────────────────────

describe('leaveSession', () => {
  it('clears messages after leaving', async () => {
    mockHasActiveSession.mockReturnValue(true);
    mockLoadMessages.mockResolvedValue({ messages: [makeMsg('m1')], hasMore: false });
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => { await result.current.leaveSession(); });
    expect(result.current.messages).toEqual([]);
  });

  it('clears error after leaving', async () => {
    mockHasActiveSession.mockReturnValue(false);
    const { result } = renderHook(() => useAnonymousMessages('link-1'));
    await act(async () => { await result.current.loadMessages(); });
    await act(async () => { await result.current.leaveSession(); });
    expect(result.current.error).toBeNull();
  });
});
