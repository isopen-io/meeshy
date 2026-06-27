/**
 * Tests for hooks/use-stream-translation.ts
 */

const mockIncrementTranslationCount = jest.fn();
const mockStats = { total: 0 };

jest.mock('@/hooks/useMessageTranslation', () => ({
  useMessageTranslation: () => ({
    stats: mockStats,
    incrementTranslationCount: mockIncrementTranslationCount,
  }),
}));

jest.mock('@meeshy/shared/types', () => ({
  getLanguageInfo: (lang: string) => ({ code: lang, name: lang }),
}));

import { renderHook, act } from '@testing-library/react';
import { useStreamTranslation } from '@/hooks/use-stream-translation';
import type { User } from '@meeshy/shared/types';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    username: 'alice',
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: null,
    ...overrides,
  } as unknown as User);

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── addTranslatingState / removeTranslatingState / isTranslating ─────────────

describe('translating state', () => {
  it('isTranslating returns false initially', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
  });

  it('isTranslating returns true after addTranslatingState', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    act(() => { result.current.addTranslatingState('msg-1', 'fr'); });
    expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
  });

  it('isTranslating returns false after removeTranslatingState', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    act(() => {
      result.current.addTranslatingState('msg-1', 'fr');
      result.current.removeTranslatingState('msg-1', 'fr');
    });
    expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
  });

  it('tracks multiple languages per message independently', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    act(() => {
      result.current.addTranslatingState('msg-1', 'fr');
      result.current.addTranslatingState('msg-1', 'es');
    });
    expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
    expect(result.current.isTranslating('msg-1', 'es')).toBe(true);
    act(() => { result.current.removeTranslatingState('msg-1', 'fr'); });
    expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
    expect(result.current.isTranslating('msg-1', 'es')).toBe(true);
  });

  it('handles remove on non-existent message gracefully', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    expect(() => {
      act(() => { result.current.removeTranslatingState('nonexistent', 'fr'); });
    }).not.toThrow();
  });
});

// ─── handleTranslation ────────────────────────────────────────────────────────

describe('handleTranslation', () => {
  it('calls updateMessage with the given messageId', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    const translations = [{
      targetLanguage: 'fr',
      translatedContent: 'Bonjour',
      sourceLanguage: 'en',
    }];
    act(() => { result.current.handleTranslation('msg-1', translations); });
    expect(updateMessage).toHaveBeenCalledWith('msg-1', expect.any(Function));
  });

  it('updater merges translations into existing message', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    const prevMessage = {
      id: 'msg-1',
      content: 'Hello',
      originalLanguage: 'en',
      translations: [],
    };
    const translations = [{
      targetLanguage: 'fr',
      translatedContent: 'Bonjour',
      sourceLanguage: 'en',
    }];
    act(() => { result.current.handleTranslation('msg-1', translations); });
    const updater = updateMessage.mock.calls[0][1];
    const updated = updater(prevMessage);
    expect(updated.translations).toHaveLength(1);
    expect(updated.translations[0].translatedContent).toBe('Bonjour');
    expect(updated.translations[0].targetLanguage).toBe('fr');
  });

  it('updater updates existing translation for same targetLanguage', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    const prevMessage = {
      id: 'msg-1',
      content: 'Hello',
      originalLanguage: 'en',
      translations: [{ targetLanguage: 'fr', translatedContent: 'Salut' }],
    };
    const translations = [{
      targetLanguage: 'fr',
      translatedContent: 'Bonjour',
      sourceLanguage: 'en',
    }];
    act(() => { result.current.handleTranslation('msg-1', translations); });
    const updater = updateMessage.mock.calls[0][1];
    const updated = updater(prevMessage);
    expect(updated.translations).toHaveLength(1);
    expect(updated.translations[0].translatedContent).toBe('Bonjour');
  });

  it('updater returns prevMessage unchanged when prevMessage is null/undefined', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    const translations = [{ targetLanguage: 'fr', translatedContent: 'Bonjour', sourceLanguage: 'en' }];
    act(() => { result.current.handleTranslation('msg-1', translations); });
    const updater = updateMessage.mock.calls[0][1];
    const result2 = updater(null);
    expect(result2).toBeNull();
  });

  it('increments translation count for user preferred language', () => {
    const updateMessage = jest.fn();
    const user = makeUser({ systemLanguage: 'fr' });
    const { result } = renderHook(() =>
      useStreamTranslation({ user, updateMessage })
    );
    const prevMessage = { id: 'msg-1', content: 'Hello', originalLanguage: 'en', translations: [] };
    const translations = [{
      targetLanguage: 'fr',
      translatedContent: 'Bonjour',
      sourceLanguage: 'en',
    }];
    updateMessage.mockImplementation((id, updater) => updater(prevMessage));
    act(() => { result.current.handleTranslation('msg-1', translations); });
    expect(mockIncrementTranslationCount).toHaveBeenCalledWith('en', 'fr');
  });

  it('does not increment count for non-user language', () => {
    const updateMessage = jest.fn();
    const user = makeUser({ systemLanguage: 'fr', regionalLanguage: undefined, customDestinationLanguage: undefined });
    const { result } = renderHook(() =>
      useStreamTranslation({ user, updateMessage })
    );
    const prevMessage = { id: 'msg-1', content: 'Hello', originalLanguage: 'en', translations: [] };
    const translations = [{
      targetLanguage: 'de',
      translatedContent: 'Hallo',
      sourceLanguage: 'en',
    }];
    updateMessage.mockImplementation((id, updater) => updater(prevMessage));
    act(() => { result.current.handleTranslation('msg-1', translations); });
    expect(mockIncrementTranslationCount).not.toHaveBeenCalled();
  });
});

// ─── exposed API ──────────────────────────────────────────────────────────────

describe('exposed API', () => {
  it('returns stats from useMessageTranslation', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    expect(result.current.stats).toBe(mockStats);
  });

  it('returns incrementTranslationCount from useMessageTranslation', () => {
    const updateMessage = jest.fn();
    const { result } = renderHook(() =>
      useStreamTranslation({ user: makeUser(), updateMessage })
    );
    expect(result.current.incrementTranslationCount).toBe(mockIncrementTranslationCount);
  });
});
