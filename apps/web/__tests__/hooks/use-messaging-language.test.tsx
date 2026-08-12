/**
 * Behavioral test: useMessaging tags messages with the language of the content,
 * not the user's profile language.
 *
 * C4 Task 2 — wire detectComposeLanguage into the send seam.
 */

import { renderHook, act } from '@testing-library/react';
import { useMessaging } from '@/hooks/use-messaging';

// Mock Socket.IO messaging hook — same pattern as use-messaging.test.tsx
const mockSendMessage = jest.fn();

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: () => ({
    isConnected: true,
    sendMessage: mockSendMessage,
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
    connectionStatus: { isConnected: true, hasSocket: true },
  }),
}));

// Mock failed messages store
jest.mock('@/stores/failed-messages-store', () => ({
  useFailedMessagesStore: () => ({
    addFailedMessage: jest.fn(() => 'failed-id'),
  }),
}));

// Mock messaging utils
jest.mock('@/utils/messaging-utils', () => ({
  validateMessageContent: jest.fn(() => true),
  prepareMessageMetadata: jest.fn((content, lang) => ({ content, language: lang })),
  logMessageSend: jest.fn(),
  logMessageSuccess: jest.fn(),
  handleMessageError: jest.fn((error) => error?.message || 'Send failed'),
  createStandardMessageCallbacks: jest.fn(() => ({})),
}));

// Mock toast (sonner)
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// French-profile user
const mockFrenchUser = {
  id: 'user-fr',
  username: 'frenchuser',
  email: 'fr@example.com',
  systemLanguage: 'fr',
};

const CONVERSATION_ID = 'conv-test-lang';

describe('useMessaging — originalLanguage from content (C4)', () => {
  beforeEach(() => {
    mockSendMessage.mockClear();
    mockSendMessage.mockResolvedValue({ success: true });
  });

  it('tags an English message "en" even when the user profile is "fr"', async () => {
    const { result } = renderHook(() =>
      useMessaging({ conversationId: CONVERSATION_ID, currentUser: mockFrenchUser as any })
    );

    await act(async () => {
      await result.current.sendMessage(
        'How are you doing today? I hope everything is going well.',
        'fr', // caller passes profile language — content detection must override
      );
    });

    // socketMessaging.sendMessage(content, sourceLanguage, ...)
    // 2nd argument is the detected language — must be 'en' (content language), not 'fr' (profile)
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toBe('en');
  });

  it('keeps profile language "fr" as fallback when content is too short to detect', async () => {
    const { result } = renderHook(() =>
      useMessaging({ conversationId: CONVERSATION_ID, currentUser: mockFrenchUser as any })
    );

    await act(async () => {
      await result.current.sendMessage(
        'Ok', // too short for reliable detection (< COMPOSE_MIN_ALPHA alpha chars)
        'fr',
      );
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toBe('fr');
  });
});
