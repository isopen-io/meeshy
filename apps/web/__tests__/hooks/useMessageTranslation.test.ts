/**
 * Tests for hooks/useMessageTranslation.ts
 */

jest.mock('@/services/translation.service', () => ({
  translationService: {
    translateText: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMessageTranslation } from '@/hooks/useMessageTranslation';
import { translationService } from '@/services/translation.service';
import type { Message } from '@/types';

const mockTranslateText = translationService.translateText as jest.MockedFunction<
  typeof translationService.translateText
>;

const makeTranslationResult = (overrides = {}) => ({
  translatedText: 'Bonjour',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  confidence: 0.95,
  ...overrides,
});

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'msg-1',
    content: 'Hello world',
    conversationId: 'conv-1',
    senderId: 'user-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Message);

beforeEach(() => {
  jest.resetAllMocks();
  localStorage.clear();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with isTranslating false', () => {
    const { result } = renderHook(() => useMessageTranslation());
    expect(result.current.isTranslating).toBe(false);
  });

  it('starts with error null', () => {
    const { result } = renderHook(() => useMessageTranslation());
    expect(result.current.error).toBeNull();
  });

  it('starts with zero translation stats', () => {
    const { result } = renderHook(() => useMessageTranslation());
    expect(result.current.stats.totalTranslations).toBe(0);
    expect(result.current.stats.translationsToday).toBe(0);
    expect(result.current.stats.languagesUsed).toEqual([]);
    expect(result.current.stats.lastUsed).toBeNull();
  });
});

// ─── translateText ────────────────────────────────────────────────────────────

describe('translateText', () => {
  it('returns null for empty text', async () => {
    const { result } = renderHook(() => useMessageTranslation());

    let returnValue;
    await act(async () => {
      returnValue = await result.current.translateText('', 'fr');
    });

    expect(returnValue).toBeNull();
    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it('returns null for whitespace-only text', async () => {
    const { result } = renderHook(() => useMessageTranslation());

    let returnValue;
    await act(async () => {
      returnValue = await result.current.translateText('   ', 'fr');
    });

    expect(returnValue).toBeNull();
    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it('calls translationService.translateText with correct params', async () => {
    mockTranslateText.mockResolvedValueOnce(makeTranslationResult() as any);

    const { result } = renderHook(() => useMessageTranslation());

    await act(async () => {
      await result.current.translateText('Hello', 'fr', 'en');
    });

    expect(mockTranslateText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        model: 'basic',
      })
    );
  });

  it('defaults sourceLanguage to auto when not provided', async () => {
    mockTranslateText.mockResolvedValueOnce(makeTranslationResult() as any);

    const { result } = renderHook(() => useMessageTranslation());

    await act(async () => {
      await result.current.translateText('Hello', 'fr');
    });

    expect(mockTranslateText).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'auto' })
    );
  });

  it('returns translation result on success', async () => {
    const translationResult = makeTranslationResult({ translatedText: 'Hola' });
    mockTranslateText.mockResolvedValueOnce(translationResult as any);

    const { result } = renderHook(() => useMessageTranslation());

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateText('Hello', 'es');
    });

    expect(returnValue).toEqual(translationResult);
  });

  it('sets isTranslating to true during translation and false after', async () => {
    let resolveTranslation!: (val: any) => void;
    mockTranslateText.mockReturnValueOnce(
      new Promise(resolve => { resolveTranslation = resolve; })
    );

    const { result } = renderHook(() => useMessageTranslation());

    act(() => {
      void result.current.translateText('Hello', 'fr');
    });

    await waitFor(() => expect(result.current.isTranslating).toBe(true));

    await act(async () => {
      resolveTranslation(makeTranslationResult());
    });

    expect(result.current.isTranslating).toBe(false);
  });

  it('sets error when translation fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTranslateText.mockRejectedValueOnce(new Error('Service unavailable'));

    const { result } = renderHook(() => useMessageTranslation());

    await act(async () => {
      await result.current.translateText('Hello', 'fr');
    });

    expect(result.current.error).toBe('Service unavailable');
    expect(result.current.isTranslating).toBe(false);
    consoleSpy.mockRestore();
  });

  it('returns null on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTranslateText.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useMessageTranslation());

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateText('Hello', 'fr');
    });

    expect(returnValue).toBeNull();
    consoleSpy.mockRestore();
  });

  it('returns null when AbortError is thrown (cancelled)', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockTranslateText.mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useMessageTranslation());

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateText('Hello', 'fr');
    });

    expect(returnValue).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('exposes translate as alias for translateText', async () => {
    mockTranslateText.mockResolvedValueOnce(makeTranslationResult() as any);

    const { result } = renderHook(() => useMessageTranslation());

    await act(async () => {
      await result.current.translate('Hello', 'fr');
    });

    expect(mockTranslateText).toHaveBeenCalled();
  });
});

// ─── translateMessage ─────────────────────────────────────────────────────────

describe('translateMessage', () => {
  it('returns null when message has no content', async () => {
    const { result } = renderHook(() => useMessageTranslation());

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateMessage(
        makeMessage({ content: '' }),
        'fr'
      );
    });

    expect(returnValue).toBeNull();
    expect(mockTranslateText).not.toHaveBeenCalled();
  });

  it('returns null when targetLanguage is empty', async () => {
    const { result } = renderHook(() => useMessageTranslation());

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateMessage(makeMessage(), '');
    });

    expect(returnValue).toBeNull();
  });

  it('returns TranslatedMessage on success', async () => {
    mockTranslateText.mockResolvedValueOnce(makeTranslationResult() as any);

    const { result } = renderHook(() => useMessageTranslation());
    const message = makeMessage({ content: 'Hello' });

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateMessage(message, 'fr');
    });

    expect(returnValue).not.toBeNull();
    expect(returnValue.translatedContent).toBe('Bonjour');
    expect(returnValue.originalContent).toBe('Hello');
    expect(returnValue.targetLanguage).toBe('fr');
    expect(returnValue.translationModel).toBe('api-service');
  });

  it('returns null when inner translateText returns null', async () => {
    mockTranslateText.mockResolvedValueOnce(null as any);

    const { result } = renderHook(() => useMessageTranslation());

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateMessage(makeMessage(), 'fr');
    });

    expect(returnValue).toBeNull();
  });

  it('returns null on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTranslateText.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useMessageTranslation());

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.translateMessage(makeMessage(), 'fr');
    });

    expect(returnValue).toBeNull();
    consoleSpy.mockRestore();
  });
});

// ─── abortTranslation ─────────────────────────────────────────────────────────

describe('abortTranslation', () => {
  it('does nothing when no pending translation', () => {
    const { result } = renderHook(() => useMessageTranslation());

    expect(() => {
      act(() => { result.current.abortTranslation(); });
    }).not.toThrow();
  });

  it('sets isTranslating to false when aborting', async () => {
    let resolveTranslation!: (val: any) => void;
    mockTranslateText.mockReturnValueOnce(
      new Promise(resolve => { resolveTranslation = resolve; })
    );

    const { result } = renderHook(() => useMessageTranslation());

    act(() => {
      void result.current.translateText('Hello', 'fr');
    });

    await waitFor(() => expect(result.current.isTranslating).toBe(true));

    act(() => {
      result.current.abortTranslation();
    });

    expect(result.current.isTranslating).toBe(false);
  });
});

// ─── stats ────────────────────────────────────────────────────────────────────

describe('stats', () => {
  it('loads stats from localStorage on mount', () => {
    const storedStats = {
      totalTranslations: 5,
      lastUsed: new Date().toISOString(),
      translationsToday: 2,
      languagesUsed: ['en', 'fr'],
    };
    localStorage.setItem('translation_stats', JSON.stringify(storedStats));

    const { result } = renderHook(() => useMessageTranslation());

    expect(result.current.stats.totalTranslations).toBe(5);
    expect(result.current.stats.translationsToday).toBe(2);
    expect(result.current.stats.languagesUsed).toEqual(['en', 'fr']);
  });

  it('handles missing localStorage gracefully', () => {
    localStorage.clear();
    const { result } = renderHook(() => useMessageTranslation());
    expect(result.current.stats.totalTranslations).toBe(0);
  });

  it('incrementTranslationCount increments totalTranslations', () => {
    const { result } = renderHook(() => useMessageTranslation());

    act(() => {
      result.current.incrementTranslationCount('en', 'fr');
    });

    expect(result.current.stats.totalTranslations).toBe(1);
  });

  it('incrementTranslationCount adds languages to languagesUsed', () => {
    const { result } = renderHook(() => useMessageTranslation());

    act(() => {
      result.current.incrementTranslationCount('en', 'fr');
    });

    expect(result.current.stats.languagesUsed).toContain('en');
    expect(result.current.stats.languagesUsed).toContain('fr');
  });

  it('incrementTranslationCount deduplicates languages', () => {
    const { result } = renderHook(() => useMessageTranslation());

    act(() => {
      result.current.incrementTranslationCount('en', 'fr');
      result.current.incrementTranslationCount('en', 'fr');
    });

    const enCount = result.current.stats.languagesUsed.filter(l => l === 'en').length;
    expect(enCount).toBe(1);
  });

  it('resetStats clears all counters', () => {
    const { result } = renderHook(() => useMessageTranslation());

    act(() => {
      result.current.incrementTranslationCount('en', 'fr');
    });

    act(() => {
      result.current.resetStats();
    });

    expect(result.current.stats.totalTranslations).toBe(0);
    expect(result.current.stats.languagesUsed).toEqual([]);
    expect(result.current.stats.translationsToday).toBe(0);
    expect(result.current.stats.lastUsed).toBeNull();
  });

  it('saveStats persists to localStorage', () => {
    const { result } = renderHook(() => useMessageTranslation());

    act(() => {
      result.current.incrementTranslationCount('en', 'es');
    });

    const stored = JSON.parse(localStorage.getItem('translation_stats') || '{}');
    expect(stored.totalTranslations).toBe(1);
  });

  it('handles corrupt localStorage data gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('translation_stats', 'invalid json{{{');

    const { result } = renderHook(() => useMessageTranslation());

    expect(result.current.stats.totalTranslations).toBe(0);
    consoleSpy.mockRestore();
  });
});
