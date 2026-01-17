/**
 * Tests for useMessageTranslations hook
 *
 * Tests cover:
 * - resolveUserPreferredLanguage logic
 * - getUserLanguagePreferences
 * - processMessageWithTranslations
 * - getPreferredLanguageContent
 * - shouldRequestTranslation
 * - getRequiredTranslations
 * - Translation deduplication
 * - Edge cases with empty/missing data
 */

import { renderHook } from '@testing-library/react';
import { useMessageTranslations } from '@/hooks/use-message-translations';
import type { User } from '@meeshy/shared/types';

// Type for our test user that matches the expected User interface
type TestUser = Pick<
  User,
  | 'id'
  | 'username'
  | 'systemLanguage'
  | 'regionalLanguage'
  | 'customDestinationLanguage'
  | 'useCustomDestination'
  | 'translateToSystemLanguage'
  | 'translateToRegionalLanguage'
>;

describe('useMessageTranslations', () => {
  // Factory function to create test users
  const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => ({
    id: 'user-1',
    username: 'testuser',
    systemLanguage: 'en',
    regionalLanguage: 'en',
    customDestinationLanguage: undefined,
    useCustomDestination: false,
    translateToSystemLanguage: true,
    translateToRegionalLanguage: false,
    ...overrides,
  });

  // Factory function to create test messages
  const createTestMessage = (overrides: Partial<any> = {}) => ({
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'sender-1',
    content: 'Hello world',
    originalLanguage: 'en',
    messageType: 'text' as const,
    isEdited: false,
    isDeleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    translations: [],
    ...overrides,
  });

  describe('resolveUserPreferredLanguage', () => {
    it('should return customDestinationLanguage when useCustomDestination is true', () => {
      const user = createTestUser({
        useCustomDestination: true,
        customDestinationLanguage: 'fr',
        systemLanguage: 'en',
        regionalLanguage: 'es',
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      expect(result.current.resolveUserPreferredLanguage()).toBe('fr');
    });

    it('should return systemLanguage when translateToSystemLanguage is true', () => {
      const user = createTestUser({
        useCustomDestination: false,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        systemLanguage: 'de',
        regionalLanguage: 'es',
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      expect(result.current.resolveUserPreferredLanguage()).toBe('de');
    });

    it('should return regionalLanguage when translateToRegionalLanguage is true', () => {
      const user = createTestUser({
        useCustomDestination: false,
        translateToSystemLanguage: false,
        translateToRegionalLanguage: true,
        systemLanguage: 'en',
        regionalLanguage: 'pt',
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      expect(result.current.resolveUserPreferredLanguage()).toBe('pt');
    });

    it('should fallback to systemLanguage when no preference is set', () => {
      const user = createTestUser({
        useCustomDestination: false,
        translateToSystemLanguage: false,
        translateToRegionalLanguage: false,
        systemLanguage: 'ja',
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      expect(result.current.resolveUserPreferredLanguage()).toBe('ja');
    });

    it('should prioritize custom destination over system language', () => {
      const user = createTestUser({
        useCustomDestination: true,
        customDestinationLanguage: 'it',
        translateToSystemLanguage: true,
        systemLanguage: 'en',
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      expect(result.current.resolveUserPreferredLanguage()).toBe('it');
    });
  });

  describe('getUserLanguagePreferences', () => {
    it('should always include system language', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        translateToRegionalLanguage: false,
        useCustomDestination: false,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const languages = result.current.getUserLanguagePreferences();
      expect(languages).toContain('en');
    });

    it('should include regional language when enabled and different from system', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        translateToRegionalLanguage: true,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const languages = result.current.getUserLanguagePreferences();
      expect(languages).toContain('en');
      expect(languages).toContain('fr');
      expect(languages.length).toBe(2);
    });

    it('should not duplicate language when regional equals system', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        regionalLanguage: 'en',
        translateToRegionalLanguage: true,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const languages = result.current.getUserLanguagePreferences();
      expect(languages).toEqual(['en']);
    });

    it('should include custom destination language when enabled', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        customDestinationLanguage: 'de',
        useCustomDestination: true,
        translateToRegionalLanguage: true,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const languages = result.current.getUserLanguagePreferences();
      expect(languages).toContain('en');
      expect(languages).toContain('fr');
      expect(languages).toContain('de');
      expect(languages.length).toBe(3);
    });

    it('should not include custom destination when same as system or regional', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        customDestinationLanguage: 'en', // Same as system
        useCustomDestination: true,
        translateToRegionalLanguage: true,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const languages = result.current.getUserLanguagePreferences();
      expect(languages).toEqual(['en', 'fr']);
    });
  });

  describe('processMessageWithTranslations', () => {
    it('should return message with original content when no translation needed', () => {
      const user = createTestUser({ systemLanguage: 'en' });
      const message = createTestMessage({
        content: 'Hello world',
        originalLanguage: 'en',
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.content).toBe('Hello world');
      expect(processed.isTranslated).toBe(false);
      expect(processed.originalLanguage).toBe('en');
    });

    it('should use translated content when available for preferred language', () => {
      const user = createTestUser({ systemLanguage: 'fr' });
      const message = createTestMessage({
        content: 'Hello world',
        originalLanguage: 'en',
        translations: [
          {
            targetLanguage: 'fr',
            translatedContent: 'Bonjour le monde',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.content).toBe('Bonjour le monde');
      expect(processed.isTranslated).toBe(true);
      expect(processed.translatedFrom).toBe('en');
    });

    it('should support alternative translation format (language/content)', () => {
      const user = createTestUser({ systemLanguage: 'es' });
      const message = createTestMessage({
        content: 'Hello world',
        originalLanguage: 'en',
        translations: [
          {
            language: 'es',
            content: 'Hola mundo',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.content).toBe('Hola mundo');
      expect(processed.isTranslated).toBe(true);
    });

    it('should preserve original content in originalContent field', () => {
      const user = createTestUser({ systemLanguage: 'fr' });
      const message = createTestMessage({
        content: 'Hello world',
        originalContent: 'Hello world',
        originalLanguage: 'en',
        translations: [
          {
            targetLanguage: 'fr',
            translatedContent: 'Bonjour le monde',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.originalContent).toBe('Hello world');
    });

    it('should deduplicate translations by language', () => {
      const user = createTestUser({ systemLanguage: 'fr' });
      const olderDate = new Date('2024-01-01T00:00:00Z').toISOString();
      const newerDate = new Date('2024-01-02T00:00:00Z').toISOString();

      const message = createTestMessage({
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          {
            targetLanguage: 'fr',
            translatedContent: 'Bonjour (old)',
            createdAt: olderDate,
          },
          {
            targetLanguage: 'fr',
            translatedContent: 'Bonjour (new)',
            createdAt: newerDate,
          },
        ],
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      // Should use the newer translation
      expect(processed.translations.filter(t => t.language === 'fr').length).toBe(1);
      expect(processed.content).toBe('Bonjour (new)');
    });

    it('should filter out invalid translations', () => {
      const user = createTestUser({ systemLanguage: 'fr' });
      const message = createTestMessage({
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          { targetLanguage: 'fr', translatedContent: 'Bonjour' },
          { targetLanguage: null, translatedContent: 'Invalid' },
          { targetLanguage: 'de', translatedContent: '' },
          { targetLanguage: 'es', translatedContent: '   ' },
          null,
          undefined,
        ],
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.translations.length).toBe(1);
      expect(processed.translations[0].language).toBe('fr');
    });

    it('should handle empty translations array', () => {
      const user = createTestUser({ systemLanguage: 'fr' });
      const message = createTestMessage({
        content: 'Hello',
        originalLanguage: 'en',
        translations: [],
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.translations).toEqual([]);
      expect(processed.isTranslated).toBe(false);
    });

    it('should default originalLanguage to fr when not provided', () => {
      const user = createTestUser({ systemLanguage: 'fr' });
      const message = createTestMessage({
        content: 'Hello',
        originalLanguage: undefined,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.originalLanguage).toBe('fr');
    });

    it('should prefer premium translations over basic ones', () => {
      const user = createTestUser({ systemLanguage: 'fr' });
      const message = createTestMessage({
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          {
            targetLanguage: 'fr',
            translatedContent: 'Bonjour (basic)',
            translationModel: 'basic',
            confidenceScore: 0.8,
            createdAt: new Date().toISOString(),
          },
          {
            targetLanguage: 'fr',
            translatedContent: 'Bonjour (premium)',
            translationModel: 'premium',
            confidenceScore: 0.95,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));
      const processed = result.current.processMessageWithTranslations(message);

      expect(processed.content).toBe('Bonjour (premium)');
    });
  });

  describe('getPreferredLanguageContent', () => {
    it('should return original content when already in preferred language', () => {
      const user = createTestUser({ systemLanguage: 'en' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [],
        isTranslated: false,
        originalContent: 'Hello',
      };

      const content = result.current.getPreferredLanguageContent(message as any);

      expect(content.content).toBe('Hello');
      expect(content.isTranslated).toBe(false);
      expect(content.translatedFrom).toBeUndefined();
    });

    it('should return translated content when available', () => {
      const user = createTestUser({ systemLanguage: 'fr' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          {
            language: 'fr',
            content: 'Bonjour',
            status: 'completed',
          },
        ],
        isTranslated: false,
        originalContent: 'Hello',
      };

      const content = result.current.getPreferredLanguageContent(message as any);

      expect(content.content).toBe('Bonjour');
      expect(content.isTranslated).toBe(true);
      expect(content.translatedFrom).toBe('en');
    });

    it('should return original content with translatedFrom when no translation available', () => {
      const user = createTestUser({ systemLanguage: 'de' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          {
            language: 'fr',
            content: 'Bonjour',
            status: 'completed',
          },
        ],
        isTranslated: false,
        originalContent: 'Hello',
      };

      const content = result.current.getPreferredLanguageContent(message as any);

      expect(content.content).toBe('Hello');
      expect(content.isTranslated).toBe(false);
      expect(content.translatedFrom).toBe('en');
    });

    it('should only use completed translations', () => {
      const user = createTestUser({ systemLanguage: 'fr' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          {
            language: 'fr',
            content: 'Bonjour',
            status: 'pending', // Not completed
          },
        ],
        isTranslated: false,
        originalContent: 'Hello',
      };

      const content = result.current.getPreferredLanguageContent(message as any);

      expect(content.content).toBe('Hello');
      expect(content.isTranslated).toBe(false);
    });
  });

  describe('shouldRequestTranslation', () => {
    it('should return false when message is in preferred language', () => {
      const user = createTestUser({ systemLanguage: 'en' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [],
        isTranslated: false,
        originalContent: 'Hello',
      };

      expect(result.current.shouldRequestTranslation(message as any)).toBe(false);
    });

    it('should return false when translation already exists', () => {
      const user = createTestUser({ systemLanguage: 'fr' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          {
            language: 'fr',
            content: 'Bonjour',
            status: 'completed',
          },
        ],
        isTranslated: false,
        originalContent: 'Hello',
      };

      expect(result.current.shouldRequestTranslation(message as any)).toBe(false);
    });

    it('should return true when translation is needed', () => {
      const user = createTestUser({ systemLanguage: 'de' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [],
        isTranslated: false,
        originalContent: 'Hello',
      };

      expect(result.current.shouldRequestTranslation(message as any)).toBe(true);
    });

    it('should support custom target language parameter', () => {
      const user = createTestUser({ systemLanguage: 'en' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [],
        isTranslated: false,
        originalContent: 'Hello',
      };

      // Message is in 'en', target is 'fr' - should need translation
      expect(result.current.shouldRequestTranslation(message as any, 'fr')).toBe(true);
      // Message is in 'en', target is 'en' - no translation needed
      expect(result.current.shouldRequestTranslation(message as any, 'en')).toBe(false);
    });

    it('should return true when translation exists but is not completed', () => {
      const user = createTestUser({ systemLanguage: 'fr' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [
          {
            language: 'fr',
            content: 'Bonjour',
            status: 'pending',
          },
        ],
        isTranslated: false,
        originalContent: 'Hello',
      };

      expect(result.current.shouldRequestTranslation(message as any)).toBe(true);
    });
  });

  describe('getRequiredTranslations', () => {
    it('should return empty array when all translations exist', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        translateToRegionalLanguage: true,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hallo',
        originalLanguage: 'de',
        translations: [
          { language: 'en', content: 'Hello', status: 'completed' },
          { language: 'fr', content: 'Bonjour', status: 'completed' },
        ],
        isTranslated: false,
        originalContent: 'Hallo',
      };

      const required = result.current.getRequiredTranslations(message as any);
      expect(required).toEqual([]);
    });

    it('should return missing language codes', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        translateToRegionalLanguage: true,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hallo',
        originalLanguage: 'de',
        translations: [
          { language: 'en', content: 'Hello', status: 'completed' },
        ],
        isTranslated: false,
        originalContent: 'Hallo',
      };

      const required = result.current.getRequiredTranslations(message as any);
      expect(required).toContain('fr');
      expect(required).not.toContain('en');
    });

    it('should not include original language in required translations', () => {
      const user = createTestUser({
        systemLanguage: 'en',
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: [],
        isTranslated: false,
        originalContent: 'Hello',
      };

      const required = result.current.getRequiredTranslations(message as any);
      expect(required).not.toContain('en');
      expect(required).toEqual([]);
    });

    it('should include all configured languages that need translation', () => {
      const user = createTestUser({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        customDestinationLanguage: 'de',
        translateToRegionalLanguage: true,
        useCustomDestination: true,
      });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Ciao',
        originalLanguage: 'it',
        translations: [],
        isTranslated: false,
        originalContent: 'Ciao',
      };

      const required = result.current.getRequiredTranslations(message as any);
      expect(required).toContain('en');
      expect(required).toContain('fr');
      expect(required).toContain('de');
      expect(required.length).toBe(3);
    });
  });

  describe('Memoization and Stability', () => {
    it('should return stable function references', () => {
      const user = createTestUser();
      const { result, rerender } = renderHook(() =>
        useMessageTranslations({ currentUser: user as User })
      );

      const firstRefs = {
        processMessageWithTranslations: result.current.processMessageWithTranslations,
        getPreferredLanguageContent: result.current.getPreferredLanguageContent,
        getUserLanguagePreferences: result.current.getUserLanguagePreferences,
        resolveUserPreferredLanguage: result.current.resolveUserPreferredLanguage,
        shouldRequestTranslation: result.current.shouldRequestTranslation,
        getRequiredTranslations: result.current.getRequiredTranslations,
      };

      rerender();

      expect(result.current.processMessageWithTranslations).toBe(
        firstRefs.processMessageWithTranslations
      );
      expect(result.current.getPreferredLanguageContent).toBe(
        firstRefs.getPreferredLanguageContent
      );
      expect(result.current.getUserLanguagePreferences).toBe(
        firstRefs.getUserLanguagePreferences
      );
      expect(result.current.resolveUserPreferredLanguage).toBe(
        firstRefs.resolveUserPreferredLanguage
      );
      expect(result.current.shouldRequestTranslation).toBe(
        firstRefs.shouldRequestTranslation
      );
      expect(result.current.getRequiredTranslations).toBe(
        firstRefs.getRequiredTranslations
      );
    });

    it('should update functions when user changes', () => {
      const user1 = createTestUser({ systemLanguage: 'en' });
      const user2 = createTestUser({ systemLanguage: 'fr' });

      const { result, rerender } = renderHook(
        ({ currentUser }) => useMessageTranslations({ currentUser }),
        { initialProps: { currentUser: user1 as User } }
      );

      expect(result.current.resolveUserPreferredLanguage()).toBe('en');

      rerender({ currentUser: user2 as User });

      expect(result.current.resolveUserPreferredLanguage()).toBe('fr');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined translations gracefully', () => {
      const user = createTestUser({ systemLanguage: 'fr' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalLanguage: 'en',
        translations: undefined,
        isTranslated: false,
        originalContent: 'Hello',
      };

      const processed = result.current.processMessageWithTranslations(message);
      expect(processed.translations).toEqual([]);
    });

    it('should handle message with only originalContent', () => {
      const user = createTestUser({ systemLanguage: 'en' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = {
        id: 'msg-1',
        content: 'Hello',
        originalContent: 'Original Hello',
        originalLanguage: 'en',
      };

      const processed = result.current.processMessageWithTranslations(message);
      expect(processed.originalContent).toBe('Original Hello');
    });

    it('should default location to Paris', () => {
      const user = createTestUser({ systemLanguage: 'en' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = createTestMessage({ location: undefined });

      const processed = result.current.processMessageWithTranslations(message);
      expect(processed.location).toBe('Paris');
    });

    it('should preserve existing location', () => {
      const user = createTestUser({ systemLanguage: 'en' });

      const { result } = renderHook(() => useMessageTranslations({ currentUser: user as User }));

      const message = createTestMessage({ location: 'London' });

      const processed = result.current.processMessageWithTranslations(message);
      expect(processed.location).toBe('London');
    });
  });
});
