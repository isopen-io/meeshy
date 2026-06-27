/**
 * Tests for hooks/use-stream-socket.ts
 */

const mockSendMessage = jest.fn();
const mockStartTyping = jest.fn();
const mockStopTyping = jest.fn();
const mockReconnect = jest.fn();
const mockGetDiagnostics = jest.fn(() => ({}));
const mockConnectionStatus = { isConnected: true, hasSocket: true };

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: jest.fn(() => ({
    sendMessage: mockSendMessage,
    connectionStatus: mockConnectionStatus,
    startTyping: mockStartTyping,
    stopTyping: mockStopTyping,
    reconnect: mockReconnect,
    getDiagnostics: mockGetDiagnostics,
  })),
}));

const mockOnConversationJoined = jest.fn(() => jest.fn());
const mockGetCurrentConversationId = jest.fn(() => null);
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onConversationJoined: (...args: unknown[]) => mockOnConversationJoined(...args),
    getCurrentConversationId: () => mockGetCurrentConversationId(),
  },
}));

jest.mock('@meeshy/shared/types', () => ({
  getLanguageFlag: (lang: string) => `flag:${lang}`,
}));

import { renderHook, act } from '@testing-library/react';
import { useStreamSocket } from '@/hooks/use-stream-socket';
import type { User, Message } from '@meeshy/shared/types';

const makeUser = (id = 'u1'): User => ({
  id,
  username: `user_${id}`,
  role: 'USER',
  systemLanguage: 'fr',
} as unknown as User);

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'conv-1',
  user: makeUser(),
  activeUsers: [],
  isLoadingTranslations: false,
  onNewMessage: jest.fn(),
  onMessageEdited: jest.fn(),
  onMessageDeleted: jest.fn(),
  onTranslation: jest.fn(),
  onActiveUsersUpdate: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentConversationId.mockReturnValue(null);
  mockOnConversationJoined.mockReturnValue(jest.fn());
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('typingUsers starts empty', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.typingUsers).toEqual([]);
  });

  it('messageLanguageStats starts empty', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.messageLanguageStats).toEqual([]);
  });

  it('activeLanguageStats starts empty', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.activeLanguageStats).toEqual([]);
  });

  it('normalizedConversationId starts null', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.normalizedConversationId).toBeNull();
  });

  it('exposes connectionStatus from useSocketIOMessaging', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.connectionStatus).toBe(mockConnectionStatus);
  });
});

// ─── exposed actions ──────────────────────────────────────────────────────────

describe('exposed actions', () => {
  it('exposes sendMessage from useSocketIOMessaging', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.sendMessage).toBe(mockSendMessage);
  });

  it('exposes startTyping from useSocketIOMessaging', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.startTyping).toBe(mockStartTyping);
  });

  it('exposes stopTyping from useSocketIOMessaging', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.stopTyping).toBe(mockStopTyping);
  });

  it('exposes reconnect from useSocketIOMessaging', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.reconnect).toBe(mockReconnect);
  });

  it('exposes getDiagnostics from useSocketIOMessaging', () => {
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.getDiagnostics).toBe(mockGetDiagnostics);
  });
});

// ─── normalizedConversationId ────────────────────────────────────────────────

describe('normalizedConversationId', () => {
  it('picks up existing normalizedId from service on mount', () => {
    mockGetCurrentConversationId.mockReturnValue('conv-normalized-1');
    const { result } = renderHook(() => useStreamSocket(makeProps()));
    expect(result.current.normalizedConversationId).toBe('conv-normalized-1');
  });

  it('updates normalizedConversationId when conversation:joined fires', () => {
    let joinedCallback: (data: { conversationId: string; userId: string }) => void;
    mockOnConversationJoined.mockImplementation((cb: any) => {
      joinedCallback = cb;
      return jest.fn();
    });

    const { result } = renderHook(() => useStreamSocket(makeProps()));
    act(() => { joinedCallback!({ conversationId: 'conv-norm-2', userId: 'u1' }); });
    expect(result.current.normalizedConversationId).toBe('conv-norm-2');
  });

  it('unsubscribes from conversation:joined on unmount', () => {
    const unsubscribe = jest.fn();
    mockOnConversationJoined.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useStreamSocket(makeProps()));
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

// ─── useSocketIOMessaging receives correct options ────────────────────────────

describe('useSocketIOMessaging options', () => {
  it('passes conversationId and currentUser to useSocketIOMessaging', () => {
    const { useSocketIOMessaging } = require('@/hooks/use-socketio-messaging');
    const props = makeProps({ conversationId: 'conv-test' });
    renderHook(() => useStreamSocket(props));
    expect(useSocketIOMessaging).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-test' })
    );
  });

  it('passes onNewMessage handler through', () => {
    const { useSocketIOMessaging } = require('@/hooks/use-socketio-messaging');
    const onNewMessage = jest.fn();
    renderHook(() => useStreamSocket(makeProps({ onNewMessage })));
    const call = useSocketIOMessaging.mock.calls.at(-1)[0];
    expect(call.onNewMessage).toBe(onNewMessage);
  });
});
