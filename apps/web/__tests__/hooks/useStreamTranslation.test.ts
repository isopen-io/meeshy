jest.mock('@/hooks/useMessageTranslation', () => ({
  useMessageTranslation: jest.fn(() => ({
    stats: { totalTranslations: 0, languagesUsed: [] },
    incrementTranslationCount: jest.fn(),
    translateText: jest.fn(),
  })),
}));

jest.mock('@meeshy/shared/types', () => ({
  getLanguageInfo: jest.fn((lang: string) => ({ code: lang, name: lang })),
}));

import { renderHook, act } from '@testing-library/react';
import { useStreamTranslation } from '@/hooks/use-stream-translation';
import { useMessageTranslation } from '@/hooks/useMessageTranslation';

const mockUseMessageTranslation = useMessageTranslation as jest.MockedFunction<
  typeof useMessageTranslation
>;

const makeUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'user-1',
    systemLanguage: 'fr',
    ...overrides,
  } as any);

describe('useStreamTranslation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseMessageTranslation.mockReturnValue({
      stats: { totalTranslations: 0, languagesUsed: [] },
      incrementTranslationCount: jest.fn(),
      translateText: jest.fn(),
    } as any);
  });

  describe('addTranslatingState / removeTranslatingState / isTranslating', () => {
    it('returns false for unknown message initially', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
    });

    it('returns true after addTranslatingState is called', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
    });

    it('returns false after removeTranslatingState is called', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      act(() => {
        result.current.removeTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
    });

    it('tracks multiple messages independently', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-2', 'en');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
      expect(result.current.isTranslating('msg-2', 'en')).toBe(true);
      expect(result.current.isTranslating('msg-1', 'en')).toBe(false);
    });

    it('tracks multiple languages for the same message', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-1', 'en');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
      expect(result.current.isTranslating('msg-1', 'en')).toBe(true);
    });

    it('removing one language does not affect other languages on same message', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-1', 'en');
      });

      act(() => {
        result.current.removeTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
      expect(result.current.isTranslating('msg-1', 'en')).toBe(true);
    });
  });

  describe('handleTranslation', () => {
    it('calls updateMessage with the correct messageId', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      const translations = [
        { targetLanguage: 'fr', translatedContent: 'Bonjour', sourceLanguage: 'en' },
      ];

      act(() => {
        result.current.handleTranslation('msg-1', translations);
      });

      expect(updateMessage).toHaveBeenCalledWith('msg-1', expect.any(Function));
    });

    it('updater function merges translations into the existing message', () => {
      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      const translations = [
        { targetLanguage: 'fr', translatedContent: 'Bonjour', sourceLanguage: 'en' },
      ];

      act(() => {
        result.current.handleTranslation('msg-1', translations);
      });

      const updaterFn = updateMessage.mock.calls[0][1];
      const prevMessage = { id: 'msg-1', content: 'Hello', translations: [] };
      const updatedMessage = updaterFn(prevMessage);

      expect(updatedMessage.translations).toHaveLength(1);
      expect(updatedMessage.translations[0].targetLanguage).toBe('fr');
      expect(updatedMessage.translations[0].translatedContent).toBe('Bonjour');
    });

    it('updater function returns prevMessage unchanged when prevMessage is null', () => {
      const updateMessage = jest.fn();
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      const translations = [
        { targetLanguage: 'fr', translatedContent: 'Bonjour', sourceLanguage: 'en' },
      ];

      act(() => {
        result.current.handleTranslation('msg-1', translations);
      });

      const updaterFn = updateMessage.mock.calls[0][1];
      const updatedMessage = updaterFn(null);

      expect(updatedMessage).toBeNull();
      consoleSpy.mockRestore();
    });

    it('calls incrementTranslationCount when a relevant translation is found', () => {
      const incrementTranslationCount = jest.fn();
      mockUseMessageTranslation.mockReturnValue({
        stats: { totalTranslations: 0, languagesUsed: [] },
        incrementTranslationCount,
        translateText: jest.fn(),
      } as any);

      const updateMessage = jest.fn();
      const user = makeUser({ systemLanguage: 'fr' });

      const { result } = renderHook(() =>
        useStreamTranslation({ user, updateMessage })
      );

      const translations = [
        { targetLanguage: 'fr', translatedContent: 'Bonjour', sourceLanguage: 'en' },
      ];

      act(() => {
        result.current.handleTranslation('msg-1', translations);
      });

      expect(incrementTranslationCount).toHaveBeenCalledWith('en', 'fr');
    });
  });

  describe('stats and incrementTranslationCount', () => {
    it('exposes stats from useMessageTranslation', () => {
      const mockStats = { totalTranslations: 5, languagesUsed: ['fr', 'en'] };
      mockUseMessageTranslation.mockReturnValue({
        stats: mockStats,
        incrementTranslationCount: jest.fn(),
        translateText: jest.fn(),
      } as any);

      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      expect(result.current.stats).toEqual(mockStats);
    });

    it('exposes incrementTranslationCount and it is callable', () => {
      const incrementTranslationCount = jest.fn();
      mockUseMessageTranslation.mockReturnValue({
        stats: { totalTranslations: 0, languagesUsed: [] },
        incrementTranslationCount,
        translateText: jest.fn(),
      } as any);

      const updateMessage = jest.fn();
      const { result } = renderHook(() =>
        useStreamTranslation({ user: makeUser(), updateMessage })
      );

      act(() => {
        result.current.incrementTranslationCount('en', 'fr');
      });

      expect(incrementTranslationCount).toHaveBeenCalledWith('en', 'fr');
    });
  });
});
