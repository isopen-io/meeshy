/**
 * Tests for useMentions hook
 *
 * Tests cover:
 * - Initial state
 * - Mention detection at cursor position
 * - Valid MongoDB ObjectId requirement
 * - Mention query extraction
 * - Mention selection and text insertion
 * - User ID tracking (mentionedUserIds)
 * - Autocomplete close/clear behavior
 * - Edge cases (long queries, special characters)
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useMentions } from '@/hooks/composer/useMentions';

// Helper to create mock textarea
function createMockTextarea(value: string, selectionStart: number): HTMLTextAreaElement {
  // Create a real textarea element for DOM operations
  const textarea = document.createElement('textarea');
  textarea.value = value;
  Object.defineProperty(textarea, 'selectionStart', {
    value: selectionStart,
    writable: true,
  });
  Object.defineProperty(textarea, 'selectionEnd', {
    value: selectionStart,
    writable: true,
  });
  textarea.style.width = '400px';
  textarea.style.height = '100px';
  textarea.style.fontFamily = 'Arial';
  textarea.style.fontSize = '14px';
  textarea.style.lineHeight = '20px';
  textarea.style.padding = '10px';
  return textarea;
}

// Valid MongoDB ObjectId (24 hex characters)
const VALID_CONVERSATION_ID = '507f1f77bcf86cd799439011';

describe('useMentions', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });

    // Suppress console logs
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return initial state with empty values', () => {
      const { result } = renderHook(() => useMentions());

      expect(result.current.showMentionAutocomplete).toBe(false);
      expect(result.current.mentionQuery).toBe('');
      expect(result.current.mentionPosition).toEqual({ left: 0 });
      expect(result.current.mentionedUserIds).toEqual([]);
    });

    it('should return all handler functions', () => {
      const { result } = renderHook(() => useMentions());

      expect(typeof result.current.handleTextChange).toBe('function');
      expect(typeof result.current.handleMentionSelect).toBe('function');
      expect(typeof result.current.closeMentionAutocomplete).toBe('function');
      expect(typeof result.current.clearMentionedUserIds).toBe('function');
      expect(typeof result.current.getMentionedUserIds).toBe('function');
    });
  });

  describe('Text Change with Mention Detection', () => {
    it('should not show autocomplete without valid conversationId', () => {
      const { result } = renderHook(() => useMentions());

      const textarea = createMockTextarea('Hello @', 7);

      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(false);
    });

    it('should not show autocomplete with invalid conversationId', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: 'invalid-id' })
      );

      const textarea = createMockTextarea('Hello @', 7);

      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(false);
    });

    it('should show autocomplete when @ is typed with valid conversationId', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('Hello @', 7);

      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe('');
    });

    it('should extract mention query after @', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('Hello @john', 11);

      act(() => {
        result.current.handleTextChange('Hello @john', 11, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe('john');
    });

    it('should close autocomplete when text does not contain mention pattern', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea1 = createMockTextarea('Hello @john', 11);

      act(() => {
        result.current.handleTextChange('Hello @john', 11, textarea1);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);

      // User continues typing without @
      const textarea2 = createMockTextarea('Hello john', 10);

      act(() => {
        result.current.handleTextChange('Hello john', 10, textarea2);
      });

      expect(result.current.showMentionAutocomplete).toBe(false);
      expect(result.current.mentionQuery).toBe('');
    });

    it('should not show autocomplete when @ is followed by space', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('Hello @ ', 8);

      act(() => {
        result.current.handleTextChange('Hello @ ', 8, textarea);
      });

      // Space after @ breaks the mention pattern
      expect(result.current.showMentionAutocomplete).toBe(false);
    });

    it('should handle cursor in middle of text', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      // Cursor is after @jo, not at end of text
      const textarea = createMockTextarea('Hello @john world', 9);

      act(() => {
        result.current.handleTextChange('Hello @john world', 9, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe('jo');
    });
  });

  describe('Mention Query Limits', () => {
    it('should accept queries up to 30 characters', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const longUsername = 'a'.repeat(30);
      const textarea = createMockTextarea(`@${longUsername}`, 31);

      act(() => {
        result.current.handleTextChange(`@${longUsername}`, 31, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe(longUsername);
    });

    it('should close autocomplete for queries over 30 characters', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const tooLongUsername = 'a'.repeat(31);
      const textarea = createMockTextarea(`@${tooLongUsername}`, 32);

      act(() => {
        result.current.handleTextChange(`@${tooLongUsername}`, 32, textarea);
      });

      // Should not match the regex pattern
      expect(result.current.showMentionAutocomplete).toBe(false);
    });
  });

  describe('Mention Selection (handleMentionSelect)', () => {
    it('should insert selected mention into text', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const onChange = jest.fn();
      const textarea = createMockTextarea('Hello @jo', 9);

      // First detect the mention
      act(() => {
        result.current.handleTextChange('Hello @jo', 9, textarea);
      });

      // Then select a mention
      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          textarea,
          'Hello @jo',
          onChange
        );
      });

      // Should have called onChange with the new text
      expect(onChange).toHaveBeenCalledWith('Hello @john_doe ');
      expect(result.current.showMentionAutocomplete).toBe(false);
      expect(result.current.mentionQuery).toBe('');
    });

    it('should add userId to mentionedUserIds', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const onChange = jest.fn();
      const textarea = createMockTextarea('Hello @', 7);

      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          textarea,
          'Hello @',
          onChange
        );
      });

      expect(result.current.mentionedUserIds).toContain('user123');
    });

    it('should not add duplicate userIds', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const onChange = jest.fn();
      const textarea = createMockTextarea('Hello @', 7);

      // First mention
      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          textarea,
          'Hello @',
          onChange
        );
      });

      // Second mention same user
      act(() => {
        result.current.handleTextChange('Hello @john_doe @', 17, textarea);
      });

      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          textarea,
          'Hello @john_doe @',
          onChange
        );
      });

      expect(result.current.mentionedUserIds).toEqual(['user123']);
    });

    it('should track multiple different userIds', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const onChange = jest.fn();
      const textarea = createMockTextarea('Hello @', 7);

      // First mention
      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          textarea,
          'Hello @',
          onChange
        );
      });

      // Second mention different user
      const textarea2 = createMockTextarea('Hello @john_doe @', 17);
      act(() => {
        result.current.handleTextChange('Hello @john_doe @', 17, textarea2);
      });

      act(() => {
        result.current.handleMentionSelect(
          'jane_doe',
          'user456',
          textarea2,
          'Hello @john_doe @',
          onChange
        );
      });

      expect(result.current.mentionedUserIds).toEqual(['user123', 'user456']);
    });

    it('should not perform selection when textarea is null', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const onChange = jest.fn();

      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          null,
          'Hello @',
          onChange
        );
      });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Close Mention Autocomplete', () => {
    it('should close autocomplete and clear query', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('Hello @john', 11);

      act(() => {
        result.current.handleTextChange('Hello @john', 11, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);

      act(() => {
        result.current.closeMentionAutocomplete();
      });

      expect(result.current.showMentionAutocomplete).toBe(false);
      expect(result.current.mentionQuery).toBe('');
    });
  });

  describe('Clear Mentioned User IDs', () => {
    it('should clear all mentioned user IDs', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const onChange = jest.fn();
      const textarea = createMockTextarea('Hello @', 7);

      // Add some mentions
      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          textarea,
          'Hello @',
          onChange
        );
      });

      expect(result.current.mentionedUserIds).toHaveLength(1);

      // Clear
      act(() => {
        result.current.clearMentionedUserIds();
      });

      expect(result.current.mentionedUserIds).toEqual([]);
    });
  });

  describe('Get Mentioned User IDs', () => {
    it('should return current mentionedUserIds', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const onChange = jest.fn();
      const textarea = createMockTextarea('Hello @', 7);

      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      act(() => {
        result.current.handleMentionSelect(
          'john_doe',
          'user123',
          textarea,
          'Hello @',
          onChange
        );
      });

      expect(result.current.getMentionedUserIds()).toEqual(['user123']);
    });
  });

  describe('Mention Position Calculation', () => {
    it('should calculate position relative to textarea', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('Hello @', 7);
      // Append to document for proper style calculations
      document.body.appendChild(textarea);

      act(() => {
        result.current.handleTextChange('Hello @', 7, textarea);
      });

      expect(result.current.mentionPosition).toBeDefined();
      expect(typeof result.current.mentionPosition.left).toBe('number');

      document.body.removeChild(textarea);
    });

    it('should handle null textarea gracefully', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      act(() => {
        result.current.handleTextChange('Hello @', 7, null);
      });

      // Should still show autocomplete, position may be default
      expect(result.current.showMentionAutocomplete).toBe(true);
    });
  });

  describe('MongoDB ObjectId Validation', () => {
    const validIds = [
      '507f1f77bcf86cd799439011',
      '000000000000000000000000',
      'ffffffffffffffffffffffff',
      'ABCDEF123456789012345678', // uppercase
      'abcdef123456789012345678', // lowercase
    ];

    const invalidIds = [
      '',
      'not-an-objectid',
      '507f1f77bcf86cd79943901', // 23 chars
      '507f1f77bcf86cd7994390111', // 25 chars
      '507f1f77bcf86cd79943901g', // invalid char 'g'
      'undefined',
      'null',
    ];

    validIds.forEach((id) => {
      it(`should accept valid ObjectId: ${id}`, () => {
        const { result } = renderHook(() =>
          useMentions({ conversationId: id })
        );

        const textarea = createMockTextarea('Hello @', 7);

        act(() => {
          result.current.handleTextChange('Hello @', 7, textarea);
        });

        expect(result.current.showMentionAutocomplete).toBe(true);
      });
    });

    invalidIds.forEach((id) => {
      it(`should reject invalid ObjectId: ${id || '(empty)'}`, () => {
        const { result } = renderHook(() =>
          useMentions({ conversationId: id })
        );

        const textarea = createMockTextarea('Hello @', 7);

        act(() => {
          result.current.handleTextChange('Hello @', 7, textarea);
        });

        expect(result.current.showMentionAutocomplete).toBe(false);
      });
    });
  });

  describe('Handler Stability', () => {
    it('should return stable handler references when conversationId unchanged', () => {
      const { result, rerender } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const firstHandlers = {
        closeMentionAutocomplete: result.current.closeMentionAutocomplete,
        clearMentionedUserIds: result.current.clearMentionedUserIds,
        handleMentionSelect: result.current.handleMentionSelect,
      };

      rerender();

      expect(result.current.closeMentionAutocomplete).toBe(firstHandlers.closeMentionAutocomplete);
      expect(result.current.clearMentionedUserIds).toBe(firstHandlers.clearMentionedUserIds);
      expect(result.current.handleMentionSelect).toBe(firstHandlers.handleMentionSelect);
    });

    it('should update handleTextChange when conversationId changes', () => {
      const { result, rerender } = renderHook(
        ({ conversationId }) => useMentions({ conversationId }),
        { initialProps: { conversationId: VALID_CONVERSATION_ID } }
      );

      const firstHandler = result.current.handleTextChange;

      rerender({ conversationId: '507f1f77bcf86cd799439012' });

      expect(result.current.handleTextChange).not.toBe(firstHandler);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple @ symbols in text', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      // Cursor is at second @
      const textarea = createMockTextarea('email@test.com @john', 20);

      act(() => {
        result.current.handleTextChange('email@test.com @john', 20, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe('john');
    });

    it('should handle @ at beginning of text', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('@user', 5);

      act(() => {
        result.current.handleTextChange('@user', 5, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe('user');
    });

    it('should handle empty text', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('', 0);

      act(() => {
        result.current.handleTextChange('', 0, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(false);
    });

    it('should handle cursor at position 0', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('@john', 0);

      act(() => {
        result.current.handleTextChange('@john', 0, textarea);
      });

      // Cursor at 0, text before cursor is empty
      expect(result.current.showMentionAutocomplete).toBe(false);
    });

    it('should handle numeric usernames', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('@123456', 7);

      act(() => {
        result.current.handleTextChange('@123456', 7, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe('123456');
    });

    it('should handle underscore in usernames', () => {
      const { result } = renderHook(() =>
        useMentions({ conversationId: VALID_CONVERSATION_ID })
      );

      const textarea = createMockTextarea('@john_doe_123', 13);

      act(() => {
        result.current.handleTextChange('@john_doe_123', 13, textarea);
      });

      expect(result.current.showMentionAutocomplete).toBe(true);
      expect(result.current.mentionQuery).toBe('john_doe_123');
    });
  });
});
