/**
 * Tests for messaging-utils utility
 */

import {
  validateMessageContent,
  prepareMessageMetadata,
  logMessageSend,
  logMessageSuccess,
  createStandardMessageCallbacks,
  handleMessageError,
  MAX_MESSAGE_LENGTH,
  MAX_TEXT_ATTACHMENT_THRESHOLD,
} from '../../utils/messaging-utils';

describe('messaging-utils', () => {
  describe('constants', () => {
    it('should export MAX_MESSAGE_LENGTH', () => {
      expect(MAX_MESSAGE_LENGTH).toBeDefined();
      expect(typeof MAX_MESSAGE_LENGTH).toBe('number');
    });

    it('should export MAX_TEXT_ATTACHMENT_THRESHOLD', () => {
      expect(MAX_TEXT_ATTACHMENT_THRESHOLD).toBeDefined();
      expect(typeof MAX_TEXT_ATTACHMENT_THRESHOLD).toBe('number');
    });

    it('should have MAX_TEXT_ATTACHMENT_THRESHOLD >= MAX_MESSAGE_LENGTH', () => {
      expect(MAX_TEXT_ATTACHMENT_THRESHOLD).toBeGreaterThanOrEqual(MAX_MESSAGE_LENGTH);
    });
  });

  describe('validateMessageContent', () => {
    it('should return valid for normal message', () => {
      const result = validateMessageContent('Hello world');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for empty string', () => {
      const result = validateMessageContent('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Le message ne peut pas être vide');
    });

    it('should return invalid for whitespace only', () => {
      const result = validateMessageContent('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Le message ne peut pas être vide');
    });

    it('should return invalid for message exceeding max length', () => {
      const longMessage = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
      const result = validateMessageContent(longMessage);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('ne peut pas dépasser');
    });

    it('should return valid for message at max length', () => {
      const maxMessage = 'a'.repeat(MAX_MESSAGE_LENGTH);
      const result = validateMessageContent(maxMessage);
      expect(result.isValid).toBe(true);
    });

    it('should use custom max length when provided', () => {
      const message = 'a'.repeat(100);
      const resultWithDefault = validateMessageContent(message);
      const resultWithCustom = validateMessageContent(message, 50);

      expect(resultWithDefault.isValid).toBe(true);
      expect(resultWithCustom.isValid).toBe(false);
    });

    it('should allow unicode characters', () => {
      const result = validateMessageContent('Bonjour! Comment ca va?');
      expect(result.isValid).toBe(true);
    });

    it('should allow emojis', () => {
      const result = validateMessageContent('Hello!');
      expect(result.isValid).toBe(true);
    });
  });

  describe('prepareMessageMetadata', () => {
    it('should prepare basic metadata', () => {
      const result = prepareMessageMetadata('Hello', 'en');

      expect(result.content).toBe('Hello');
      expect(result.sourceLanguage).toBe('en');
      expect(result.userLanguageChoices).toEqual([]);
      expect(result.timestamp).toBeDefined();
    });

    it('should trim content', () => {
      const result = prepareMessageMetadata('  Hello  ', 'en');
      expect(result.content).toBe('Hello');
    });

    it('should include user language choices when provided', () => {
      const result = prepareMessageMetadata('Hello', 'en', ['fr', 'de']);

      expect(result.userLanguageChoices).toEqual(['fr', 'de']);
    });

    it('should default to empty array for undefined language choices', () => {
      const result = prepareMessageMetadata('Hello', 'en', undefined);
      expect(result.userLanguageChoices).toEqual([]);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const result = prepareMessageMetadata('Hello', 'en');
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('logMessageSend', () => {
    it('should not throw when called', () => {
      expect(() => logMessageSend('Hello', 'en', 'conv-123')).not.toThrow();
    });

    it('should handle undefined conversationId', () => {
      expect(() => logMessageSend('Hello', 'en')).not.toThrow();
    });
  });

  describe('logMessageSuccess', () => {
    it('should not throw when called', () => {
      expect(() => logMessageSuccess('Hello', 'en')).not.toThrow();
    });
  });

  describe('createStandardMessageCallbacks', () => {
    it('should create all callback functions', () => {
      const callbacks = createStandardMessageCallbacks({});

      expect(typeof callbacks.onNewMessage).toBe('function');
      expect(typeof callbacks.onUserTyping).toBe('function');
      expect(typeof callbacks.onUserStatus).toBe('function');
      expect(typeof callbacks.onTranslation).toBe('function');
      expect(typeof callbacks.onConversationStats).toBe('function');
      expect(typeof callbacks.onConversationOnlineStats).toBe('function');
    });

    it('should call provided onNewMessage callback', () => {
      const mockOnNewMessage = jest.fn();
      const callbacks = createStandardMessageCallbacks({
        onNewMessage: mockOnNewMessage,
      });

      const message = { id: '123', content: 'test' } as any;
      callbacks.onNewMessage(message);

      expect(mockOnNewMessage).toHaveBeenCalledWith(message);
    });

    it('should call provided onUserTyping callback', () => {
      const mockOnUserTyping = jest.fn();
      const callbacks = createStandardMessageCallbacks({
        onUserTyping: mockOnUserTyping,
      });

      callbacks.onUserTyping('user1', 'John', true, 'conv1');

      expect(mockOnUserTyping).toHaveBeenCalledWith('user1', 'John', true, 'conv1');
    });

    it('should call provided onUserStatus callback', () => {
      const mockOnUserStatus = jest.fn();
      const callbacks = createStandardMessageCallbacks({
        onUserStatus: mockOnUserStatus,
      });

      callbacks.onUserStatus('user1', 'John', true);

      expect(mockOnUserStatus).toHaveBeenCalledWith('user1', 'John', true);
    });

    it('should call provided onTranslation callback', () => {
      const mockOnTranslation = jest.fn();
      const callbacks = createStandardMessageCallbacks({
        onTranslation: mockOnTranslation,
      });

      const translations = [{ lang: 'fr', text: 'Bonjour' }];
      callbacks.onTranslation('msg1', translations);

      expect(mockOnTranslation).toHaveBeenCalledWith('msg1', translations);
    });

    it('should handle missing callbacks gracefully', () => {
      const callbacks = createStandardMessageCallbacks({});

      expect(() => callbacks.onNewMessage({} as any)).not.toThrow();
      expect(() => callbacks.onUserTyping('', '', true, '')).not.toThrow();
      expect(() => callbacks.onUserStatus('', '', true)).not.toThrow();
      expect(() => callbacks.onTranslation('', [])).not.toThrow();
      expect(() => callbacks.onConversationStats({})).not.toThrow();
      expect(() => callbacks.onConversationOnlineStats({})).not.toThrow();
    });
  });

  describe('handleMessageError', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should return authentication error message', () => {
      const error = new Error('User not authenticated');
      const result = handleMessageError(error, 'test content');

      expect(result).toContain('authentification');
    });

    it('should return connection error message for WebSocket errors', () => {
      const error = new Error('WebSocket connection lost');
      const result = handleMessageError(error, 'test content');

      expect(result).toContain('Connexion perdue');
    });

    it('should return connection error message for not connected errors', () => {
      const error = new Error('Client not connected');
      const result = handleMessageError(error, 'test content');

      expect(result).toContain('Connexion perdue');
    });

    it('should return permission error message', () => {
      const error = new Error('Not authorized to send messages');
      const result = handleMessageError(error, 'test content');

      expect(result).toContain('permissions');
    });

    it('should return generic error message for other errors', () => {
      const error = new Error('Some random error');
      const result = handleMessageError(error, 'test content');

      expect(result).toBe('Some random error');
    });

    it('should return default error message for non-Error objects', () => {
      const result = handleMessageError('string error', 'test content');

      expect(result).toBe("Erreur lors de l'envoi du message");
    });

    it('should call onRestoreMessage callback', () => {
      const mockRestore = jest.fn();
      handleMessageError(new Error('test'), 'content', mockRestore);

      expect(mockRestore).toHaveBeenCalledWith('content');
    });

    it('should log error to console', () => {
      const error = new Error('test error');
      handleMessageError(error, 'content');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle null error gracefully', () => {
      const result = handleMessageError(null, 'content');
      expect(result).toBe("Erreur lors de l'envoi du message");
    });

    it('should handle undefined error gracefully', () => {
      const result = handleMessageError(undefined, 'content');
      expect(result).toBe("Erreur lors de l'envoi du message");
    });
  });
});
