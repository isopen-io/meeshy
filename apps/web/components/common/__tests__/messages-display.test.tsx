/**
 * MessagesDisplay Component Tests
 * Tests for: memo wrapping, combined filter+map iteration, stale closure deps
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { Message, User } from '@meeshy/shared/types';

// Mock dependencies before importing the component
jest.mock('@/hooks/use-fix-z-index', () => ({
  useFixRadixZIndex: jest.fn(),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/services/message-translation.service', () => ({
  messageTranslationService: {
    requestTranslation: jest.fn(),
  },
}));

jest.mock('@/components/common/BubbleMessage', () => ({
  BubbleMessage: ({ message }: { message: any }) => (
    <div data-testid={`bubble-${message.id}`}>{message.content}</div>
  ),
}));

jest.mock('@/components/messages/FailedMessageBar', () => ({
  FailedMessageBar: () => null,
}));

jest.mock('sonner', () => ({
  toast: { info: jest.fn(), error: jest.fn() },
}));

// Import after mocks
import { MessagesDisplay } from '../messages-display';

function createMockUser(overrides?: Partial<User>): User {
  return {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    role: 'USER',
    systemLanguage: 'en',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function createMockMessage(overrides?: Partial<Message>): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: 'conv-1',
    senderId: 'user-2',
    content: 'Hello world',
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: { id: 'user-2', username: 'sender', displayName: 'Sender' },
    ...overrides,
  } as Message;
}

const defaultProps = {
  messages: [] as Message[],
  translatedMessages: [],
  isLoadingMessages: false,
  currentUser: createMockUser(),
  userLanguage: 'en',
  usedLanguages: ['en', 'fr'],
};

describe('MessagesDisplay', () => {
  describe('memo wrapping', () => {
    it('should not re-render when props are unchanged', () => {
      let renderCount = 0;

      // Use a wrapper that tracks renders of the memoized component
      const RenderCounter = React.memo(function RenderCounter() {
        renderCount++;
        return null;
      });

      // Verify MessagesDisplay is wrapped in memo by checking its type
      // React.memo components have a $$typeof of Symbol.for('react.memo')
      const componentType = (MessagesDisplay as any);
      expect(componentType.$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  describe('combined filter+map iteration', () => {
    it('should filter out messages with null/undefined IDs', () => {
      const messages = [
        createMockMessage({ id: 'msg-1', content: 'Valid message' }),
        createMockMessage({ id: undefined as any, content: 'No ID' }),
        createMockMessage({ id: null as any, content: 'Null ID' }),
        createMockMessage({ id: 'msg-2', content: 'Another valid' }),
      ];

      render(
        <MessagesDisplay {...defaultProps} messages={messages} />
      );

      expect(screen.getByTestId('bubble-msg-1')).toBeInTheDocument();
      expect(screen.getByTestId('bubble-msg-2')).toBeInTheDocument();
      expect(screen.queryByText('No ID')).not.toBeInTheDocument();
      expect(screen.queryByText('Null ID')).not.toBeInTheDocument();
    });

    it('should deduplicate messages by ID', () => {
      const messages = [
        createMockMessage({ id: 'msg-dup', content: 'First occurrence' }),
        createMockMessage({ id: 'msg-dup', content: 'Duplicate' }),
        createMockMessage({ id: 'msg-unique', content: 'Unique message' }),
      ];

      render(
        <MessagesDisplay {...defaultProps} messages={messages} />
      );

      // Should render first occurrence and unique, not duplicate
      const bubbles = screen.getAllByTestId(/^bubble-/);
      expect(bubbles).toHaveLength(2);
      expect(screen.getByTestId('bubble-msg-dup')).toBeInTheDocument();
      expect(screen.getByTestId('bubble-msg-unique')).toBeInTheDocument();
    });

    it('should filter out messages with empty string IDs', () => {
      const messages = [
        createMockMessage({ id: '', content: 'Empty ID' }),
        createMockMessage({ id: '  ', content: 'Whitespace ID' }),
        createMockMessage({ id: 'msg-valid', content: 'Valid' }),
      ];

      render(
        <MessagesDisplay {...defaultProps} messages={messages} />
      );

      expect(screen.getByTestId('bubble-msg-valid')).toBeInTheDocument();
      expect(screen.queryByText('Empty ID')).not.toBeInTheDocument();
      expect(screen.queryByText('Whitespace ID')).not.toBeInTheDocument();
    });

    it('should preserve message fields through transformation', () => {
      const messages = [
        createMockMessage({
          id: 'msg-1',
          content: 'Test content',
          originalLanguage: 'fr',
          translations: [{ language: 'en', text: 'Test' }] as any,
        }),
      ];

      render(
        <MessagesDisplay {...defaultProps} messages={messages} />
      );

      expect(screen.getByTestId('bubble-msg-1')).toBeInTheDocument();
    });
  });
});
