/**
 * Tests for hooks/use-stream-socket.ts
 */

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: jest.fn(),
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: jest.fn(() => null),
    isConnected: jest.fn(() => false),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    onConversationJoined: jest.fn(() => jest.fn()),
    getCurrentConversationId: jest.fn(() => null),
    getConnectionDiagnostics: jest.fn(() => ({ isConnected: false, hasSocket: false })),
  },
}));

jest.mock('@meeshy/shared/types', () => ({
  getLanguageFlag: jest.fn((code: string) => `flag-${code}`),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamSocket } from '@/hooks/use-stream-socket';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

const mockUseSocketIOMessaging = useSocketIOMessaging as jest.MockedFunction<typeof useSocketIOMessaging>;
const mockService = meeshySocketIOService as jest.Mocked<typeof meeshySocketIOService>;

const makeSendMessage = () => jest.fn().mockResolvedValue({ success: true });
const makeConnectionStatus = (overrides = {}) => ({
  isConnected: false,
  hasSocket: false,
  ...overrides,
});

const makeMessagingReturn = (overrides: Record<string, unknown> = {}) => ({
  isConnected: false,
  status: makeConnectionStatus(),
  connectionStatus: makeConnectionStatus(),
  sendMessage: makeSendMessage(),
  editMessage: jest.fn(),
  deleteMessage: jest.fn(),
  startTyping: jest.fn(),
  stopTyping: jest.fn(),
  reconnect: jest.fn(),
  getDiagnostics: jest.fn(() => ({ isConnected: false })),
  ...overrides,
});

const makeUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'user-1',
    role: 'USER',
    username: 'alice',
    displayName: 'Alice',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    avatar: '',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    isOnline: true,
    isActive: true,
    permissions: {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    createdAt: new Date(),
    lastActiveAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any);

const makeOptions = (overrides: Record<string, unknown> = {}) => ({
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
  jest.resetAllMocks();

  // Restore default implementations after resetAllMocks clears them
  (mockService.onConversationJoined as jest.Mock).mockReturnValue(jest.fn());
  (mockService.getCurrentConversationId as jest.Mock).mockReturnValue(null);
  (mockService.getSocket as jest.Mock).mockReturnValue(null);
  (mockService.isConnected as jest.Mock).mockReturnValue(false);
  mockUseSocketIOMessaging.mockReturnValue(makeMessagingReturn() as any);
});

// ─── Initial state ─────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('typingUsers starts as empty array', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.typingUsers).toEqual([]);
  });

  it('messageLanguageStats starts as empty array', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.messageLanguageStats).toEqual([]);
  });

  it('activeLanguageStats starts as empty array', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.activeLanguageStats).toEqual([]);
  });

  it('normalizedConversationId starts as null', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.normalizedConversationId).toBeNull();
  });
});

// ─── connectionStatus ──────────────────────────────────────────────────────────

describe('connectionStatus', () => {
  it('reflects isConnected=false when service returns false', () => {
    mockUseSocketIOMessaging.mockReturnValue(
      makeMessagingReturn({ connectionStatus: makeConnectionStatus({ isConnected: false }) }) as any
    );
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.connectionStatus.isConnected).toBe(false);
  });

  it('reflects isConnected=true when service returns true', () => {
    mockUseSocketIOMessaging.mockReturnValue(
      makeMessagingReturn({ connectionStatus: makeConnectionStatus({ isConnected: true, hasSocket: true }) }) as any
    );
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.connectionStatus.isConnected).toBe(true);
  });

  it('hasSocket=false when getSocket returns null', () => {
    (mockService.getSocket as jest.Mock).mockReturnValue(null);
    mockUseSocketIOMessaging.mockReturnValue(
      makeMessagingReturn({ connectionStatus: makeConnectionStatus({ hasSocket: false }) }) as any
    );
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.connectionStatus.hasSocket).toBe(false);
  });

  it('hasSocket=true when service says so', () => {
    mockUseSocketIOMessaging.mockReturnValue(
      makeMessagingReturn({ connectionStatus: makeConnectionStatus({ isConnected: true, hasSocket: true }) }) as any
    );
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(result.current.connectionStatus.hasSocket).toBe(true);
  });
});

// ─── Delegated actions ────────────────────────────────────────────────────────

describe('delegated actions', () => {
  it('sendMessage is a function', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(typeof result.current.sendMessage).toBe('function');
  });

  it('startTyping is a function', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(typeof result.current.startTyping).toBe('function');
  });

  it('stopTyping is a function', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(typeof result.current.stopTyping).toBe('function');
  });

  it('reconnect is a function', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(typeof result.current.reconnect).toBe('function');
  });

  it('getDiagnostics is a function', () => {
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    expect(typeof result.current.getDiagnostics).toBe('function');
  });

  it('calling startTyping delegates to useSocketIOMessaging', () => {
    const startTypingMock = jest.fn();
    mockUseSocketIOMessaging.mockReturnValue(
      makeMessagingReturn({ startTyping: startTypingMock }) as any
    );
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    act(() => {
      result.current.startTyping();
    });
    expect(startTypingMock).toHaveBeenCalledTimes(1);
  });

  it('calling stopTyping delegates to useSocketIOMessaging', () => {
    const stopTypingMock = jest.fn();
    mockUseSocketIOMessaging.mockReturnValue(
      makeMessagingReturn({ stopTyping: stopTypingMock }) as any
    );
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    act(() => {
      result.current.stopTyping();
    });
    expect(stopTypingMock).toHaveBeenCalledTimes(1);
  });

  it('calling reconnect delegates to useSocketIOMessaging', () => {
    const reconnectMock = jest.fn();
    mockUseSocketIOMessaging.mockReturnValue(
      makeMessagingReturn({ reconnect: reconnectMock }) as any
    );
    const { result } = renderHook(() => useStreamSocket(makeOptions()));
    act(() => {
      result.current.reconnect();
    });
    expect(reconnectMock).toHaveBeenCalledTimes(1);
  });
});

// ─── onConversationJoined listener ────────────────────────────────────────────

describe('onConversationJoined', () => {
  it('registers a listener via meeshySocketIOService.onConversationJoined on mount', () => {
    renderHook(() => useStreamSocket(makeOptions()));
    expect(mockService.onConversationJoined).toHaveBeenCalledTimes(1);
  });

  it('updates normalizedConversationId when conversation joined event fires', async () => {
    let capturedListener: ((data: { conversationId: string; userId: string }) => void) | null = null;

    (mockService.onConversationJoined as jest.Mock).mockImplementation((listener: any) => {
      capturedListener = listener;
      return jest.fn();
    });

    const { result } = renderHook(() => useStreamSocket(makeOptions()));

    expect(result.current.normalizedConversationId).toBeNull();

    act(() => {
      capturedListener!({ conversationId: 'normalized-id-123', userId: 'user-1' });
    });

    await waitFor(() => {
      expect(result.current.normalizedConversationId).toBe('normalized-id-123');
    });
  });

  it('unsubscribes the listener on unmount', () => {
    const unsubscribeMock = jest.fn();
    (mockService.onConversationJoined as jest.Mock).mockReturnValue(unsubscribeMock);

    const { unmount } = renderHook(() => useStreamSocket(makeOptions()));
    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});

// ─── getCurrentConversationId on conversationId change ────────────────────────

describe('conversationId effect', () => {
  it('sets normalizedConversationId from getCurrentConversationId if available', async () => {
    (mockService.getCurrentConversationId as jest.Mock).mockReturnValue('backend-id-456');

    const { result } = renderHook(() => useStreamSocket(makeOptions()));

    await waitFor(() => {
      expect(result.current.normalizedConversationId).toBe('backend-id-456');
    });
  });

  it('leaves normalizedConversationId null if getCurrentConversationId returns null', () => {
    (mockService.getCurrentConversationId as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useStreamSocket(makeOptions()));

    expect(result.current.normalizedConversationId).toBeNull();
  });
});

// ─── useSocketIOMessaging is called with correct options ──────────────────────

describe('useSocketIOMessaging integration', () => {
  it('passes conversationId to useSocketIOMessaging', () => {
    renderHook(() => useStreamSocket(makeOptions({ conversationId: 'conv-42' })));
    expect(mockUseSocketIOMessaging).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-42' })
    );
  });

  it('passes currentUser to useSocketIOMessaging', () => {
    const user = makeUser({ id: 'user-99' });
    renderHook(() => useStreamSocket(makeOptions({ user })));
    expect(mockUseSocketIOMessaging).toHaveBeenCalledWith(
      expect.objectContaining({ currentUser: user })
    );
  });

  it('passes onNewMessage callback to useSocketIOMessaging', () => {
    const onNewMessage = jest.fn();
    renderHook(() => useStreamSocket(makeOptions({ onNewMessage })));
    expect(mockUseSocketIOMessaging).toHaveBeenCalledWith(
      expect.objectContaining({ onNewMessage })
    );
  });
});
