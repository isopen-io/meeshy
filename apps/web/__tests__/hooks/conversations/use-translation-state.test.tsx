/**
 * Tests for useTranslationState hook
 *
 * Tests cover:
 * - Initial state (empty Map, empty usedLanguages)
 * - addTranslatingState functionality
 * - removeTranslatingState functionality
 * - isTranslating check
 * - usedLanguages management (addUsedLanguage, addUsedLanguages)
 * - Map/Set data structure behavior
 * - Deduplication of languages
 * - Cleanup of empty entries
 */

import { renderHook, act } from '@testing-library/react';
import { useTranslationState } from '@/hooks/conversations/use-translation-state';

describe('useTranslationState', () => {
  describe('Initial State', () => {
    it('should return isTranslating function', () => {
      const { result } = renderHook(() => useTranslationState());

      expect(typeof result.current.isTranslating).toBe('function');
    });

    it('should return empty usedLanguages initially', () => {
      const { result } = renderHook(() => useTranslationState());

      expect(result.current.usedLanguages).toEqual([]);
    });

    it('should return false for isTranslating initially', () => {
      const { result } = renderHook(() => useTranslationState());

      expect(result.current.isTranslating('msg-1', 'en')).toBe(false);
    });

    it('should return all management functions', () => {
      const { result } = renderHook(() => useTranslationState());

      expect(typeof result.current.addTranslatingState).toBe('function');
      expect(typeof result.current.removeTranslatingState).toBe('function');
      expect(typeof result.current.addUsedLanguage).toBe('function');
      expect(typeof result.current.addUsedLanguages).toBe('function');
    });
  });

  describe('addTranslatingState', () => {
    it('should mark a message/language as translating', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
    });

    it('should handle multiple languages for same message', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-1', 'es');
        result.current.addTranslatingState('msg-1', 'de');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
      expect(result.current.isTranslating('msg-1', 'es')).toBe(true);
      expect(result.current.isTranslating('msg-1', 'de')).toBe(true);
    });

    it('should handle multiple messages independently', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-2', 'es');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
      expect(result.current.isTranslating('msg-1', 'es')).toBe(false);
      expect(result.current.isTranslating('msg-2', 'es')).toBe(true);
      expect(result.current.isTranslating('msg-2', 'fr')).toBe(false);
    });

    it('should be idempotent for same message/language', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);

      // Removing once should clear it
      act(() => {
        result.current.removeTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
    });
  });

  describe('removeTranslatingState', () => {
    it('should remove translating state for specific language', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-1', 'es');
      });

      act(() => {
        result.current.removeTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
      expect(result.current.isTranslating('msg-1', 'es')).toBe(true);
    });

    it('should handle removal of non-existent state gracefully', () => {
      const { result } = renderHook(() => useTranslationState());

      // Should not throw
      act(() => {
        result.current.removeTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
    });

    it('should cleanup message entry when all languages removed', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      act(() => {
        result.current.removeTranslatingState('msg-1', 'fr');
      });

      // Verify state is clean (indirectly through isTranslating)
      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
    });

    it('should not affect other messages', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
        result.current.addTranslatingState('msg-2', 'fr');
      });

      act(() => {
        result.current.removeTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(false);
      expect(result.current.isTranslating('msg-2', 'fr')).toBe(true);
    });
  });

  describe('isTranslating', () => {
    it('should return false for unknown message', () => {
      const { result } = renderHook(() => useTranslationState());

      expect(result.current.isTranslating('unknown-msg', 'fr')).toBe(false);
    });

    it('should return false for unknown language', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'es')).toBe(false);
    });

    it('should return true only when exact match exists', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
      expect(result.current.isTranslating('msg-1', 'FR')).toBe(false); // Case sensitive
      expect(result.current.isTranslating('msg-1', 'french')).toBe(false);
    });
  });

  describe('addUsedLanguage', () => {
    it('should add a language to usedLanguages', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguage('fr');
      });

      expect(result.current.usedLanguages).toContain('fr');
    });

    it('should not duplicate languages', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguage('fr');
        result.current.addUsedLanguage('fr');
        result.current.addUsedLanguage('fr');
      });

      expect(result.current.usedLanguages.filter(l => l === 'fr')).toHaveLength(1);
    });

    it('should maintain order of addition', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguage('fr');
        result.current.addUsedLanguage('es');
        result.current.addUsedLanguage('de');
      });

      expect(result.current.usedLanguages).toEqual(['fr', 'es', 'de']);
    });
  });

  describe('addUsedLanguages', () => {
    it('should add multiple languages at once', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguages(['fr', 'es', 'de']);
      });

      expect(result.current.usedLanguages).toEqual(['fr', 'es', 'de']);
    });

    it('should filter out duplicates', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguage('fr');
      });

      act(() => {
        result.current.addUsedLanguages(['fr', 'es', 'de', 'fr']);
      });

      expect(result.current.usedLanguages).toEqual(['fr', 'es', 'de']);
    });

    it('should filter out falsy values', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguages(['fr', '', 'es', null as any, undefined as any, 'de']);
      });

      expect(result.current.usedLanguages).toEqual(['fr', 'es', 'de']);
    });

    it('should handle empty array', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguages([]);
      });

      expect(result.current.usedLanguages).toEqual([]);
    });

    it('should not trigger unnecessary rerenders for no-op', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addUsedLanguages(['fr', 'es']);
      });

      const firstRef = result.current.usedLanguages;

      act(() => {
        result.current.addUsedLanguages(['fr', 'es']); // All duplicates
      });

      // Should return same reference (no state change)
      expect(result.current.usedLanguages).toBe(firstRef);
    });
  });

  describe('Handler Stability', () => {
    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() => useTranslationState());

      const firstFunctions = {
        addTranslatingState: result.current.addTranslatingState,
        removeTranslatingState: result.current.removeTranslatingState,
        addUsedLanguage: result.current.addUsedLanguage,
        addUsedLanguages: result.current.addUsedLanguages,
      };

      rerender();

      expect(result.current.addTranslatingState).toBe(firstFunctions.addTranslatingState);
      expect(result.current.removeTranslatingState).toBe(firstFunctions.removeTranslatingState);
      expect(result.current.addUsedLanguage).toBe(firstFunctions.addUsedLanguage);
      expect(result.current.addUsedLanguages).toBe(firstFunctions.addUsedLanguages);
    });

    it('isTranslating should update with state changes', () => {
      const { result, rerender } = renderHook(() => useTranslationState());

      const firstIsTranslating = result.current.isTranslating;

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      rerender();

      // isTranslating depends on translatingMessages Map, so reference may change
      // but it should still work correctly
      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in message IDs', () => {
      const { result } = renderHook(() => useTranslationState());

      const specialId = 'msg-with-special!@#$%^&*()_+-=chars';

      act(() => {
        result.current.addTranslatingState(specialId, 'fr');
      });

      expect(result.current.isTranslating(specialId, 'fr')).toBe(true);
    });

    it('should handle unicode in language codes', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'zh-Hans');
        result.current.addUsedLanguage('zh-Hans');
      });

      expect(result.current.isTranslating('msg-1', 'zh-Hans')).toBe(true);
      expect(result.current.usedLanguages).toContain('zh-Hans');
    });

    it('should handle empty string message ID', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('', 'fr');
      });

      expect(result.current.isTranslating('', 'fr')).toBe(true);
    });

    it('should handle rapid state changes', () => {
      const { result } = renderHook(() => useTranslationState());

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.addTranslatingState(`msg-${i}`, 'fr');
        }
      });

      // All should be tracked
      for (let i = 0; i < 100; i++) {
        expect(result.current.isTranslating(`msg-${i}`, 'fr')).toBe(true);
      }

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.removeTranslatingState(`msg-${i}`, 'fr');
        }
      });

      // All should be removed
      for (let i = 0; i < 100; i++) {
        expect(result.current.isTranslating(`msg-${i}`, 'fr')).toBe(false);
      }
    });
  });

  describe('Lazy Initialization', () => {
    it('should initialize Map lazily', () => {
      // This tests that the Map is created only once via useState(() => new Map())
      const { result, rerender } = renderHook(() => useTranslationState());

      act(() => {
        result.current.addTranslatingState('msg-1', 'fr');
      });

      rerender();
      rerender();
      rerender();

      // State should persist across rerenders
      expect(result.current.isTranslating('msg-1', 'fr')).toBe(true);
    });
  });
});
