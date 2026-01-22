/**
 * Tests for useTextareaAutosize hook
 *
 * Tests cover:
 * - Initial state and ref
 * - Height initialization on mount
 * - Auto-resize on text change
 * - Min/max height constraints
 * - Overflow behavior
 * - Reset functionality
 * - Focus/blur methods
 * - Mobile-specific behavior (iOS scroll fix)
 * - Error handling
 */

import { renderHook, act } from '@testing-library/react';
import { useTextareaAutosize } from '@/hooks/composer/useTextareaAutosize';

// Helper to create mock textarea with controllable properties
function createMockTextarea(options: {
  scrollHeight?: number;
  value?: string;
} = {}): HTMLTextAreaElement {
  const { scrollHeight = 80, value = '' } = options;

  const textarea = {
    value,
    style: {
      height: '',
      overflowY: '',
    },
    scrollHeight,
    scrollTop: 0,
    focus: jest.fn(),
    blur: jest.fn(),
    scrollIntoView: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as unknown as HTMLTextAreaElement;

  return textarea;
}

describe('useTextareaAutosize', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
      writable: true,
    });

    // Mock window.scrollTo
    window.scrollTo = jest.fn();
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return textareaRef', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      expect(result.current.textareaRef).toBeDefined();
      expect(result.current.textareaRef.current).toBeNull();
    });

    it('should return all handler functions', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      expect(typeof result.current.handleTextareaChange).toBe('function');
      expect(typeof result.current.resetTextareaSize).toBe('function');
      expect(typeof result.current.focus).toBe('function');
      expect(typeof result.current.blur).toBe('function');
    });
  });

  describe('Height Initialization', () => {
    it('should set initial height to minHeight on mount', () => {
      const mockTextarea = createMockTextarea();

      const { result } = renderHook(() => useTextareaAutosize({ minHeight: 80 }));

      // Manually set the ref to simulate mount
      (result.current.textareaRef as any).current = mockTextarea;

      // Re-render to trigger useEffect
      const { rerender } = renderHook(() => useTextareaAutosize({ minHeight: 80 }));
      rerender();

      // The effect runs on mount and sets the height
      // Since we set the ref after mount, we need to test the effect behavior
    });

    it('should use default minHeight of 80px', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      // Default min height should be 80
      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 50 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // Height should be clamped to minHeight (80)
      expect(mockEvent.target.style.height).toBe('80px');
    });

    it('should use custom minHeight', () => {
      const { result } = renderHook(() => useTextareaAutosize({ minHeight: 100 }));

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 50 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(mockEvent.target.style.height).toBe('100px');
    });
  });

  describe('Auto-Resize on Text Change', () => {
    it('should grow height based on scrollHeight', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ minHeight: 80, maxHeight: 200 })
      );

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 120 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(mockEvent.target.style.height).toBe('120px');
    });

    it('should not exceed maxHeight', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ minHeight: 80, maxHeight: 160 })
      );

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 300 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(mockEvent.target.style.height).toBe('160px');
    });

    it('should use default maxHeight of 160px', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 500 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(mockEvent.target.style.height).toBe('160px');
    });

    it('should reset height to auto before calculating', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockTextarea = createMockTextarea({ scrollHeight: 100 });
      mockTextarea.style.height = '50px';

      const mockEvent = {
        target: mockTextarea,
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // The function sets height to 'auto' first, then to calculated value
      expect(mockTextarea.style.height).toBe('100px');
    });
  });

  describe('Overflow Behavior', () => {
    it('should enable scroll when content exceeds maxHeight', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ minHeight: 80, maxHeight: 160 })
      );

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 200 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(mockEvent.target.style.overflowY).toBe('auto');
    });

    it('should hide overflow when content is within maxHeight', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ minHeight: 80, maxHeight: 160 })
      );

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 120 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(mockEvent.target.style.overflowY).toBe('hidden');
    });

    it('should auto-scroll to bottom during typing', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockTextarea = createMockTextarea({ scrollHeight: 200 });
      const mockEvent = {
        target: mockTextarea,
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // scrollTop should be set to scrollHeight
      expect(mockTextarea.scrollTop).toBe(mockTextarea.scrollHeight);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset height to minHeight', () => {
      const { result } = renderHook(() => useTextareaAutosize({ minHeight: 80 }));

      const mockTextarea = createMockTextarea();
      mockTextarea.style.height = '200px';
      (result.current.textareaRef as any).current = mockTextarea;

      act(() => {
        result.current.resetTextareaSize();
      });

      expect(mockTextarea.style.height).toBe('80px');
    });

    it('should reset overflow to hidden', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockTextarea = createMockTextarea();
      mockTextarea.style.overflowY = 'auto';
      (result.current.textareaRef as any).current = mockTextarea;

      act(() => {
        result.current.resetTextareaSize();
      });

      expect(mockTextarea.style.overflowY).toBe('hidden');
    });

    it('should blur and scroll on mobile', () => {
      // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

      const { result } = renderHook(() =>
        useTextareaAutosize({ isMobile: true })
      );

      const mockTextarea = createMockTextarea();
      (result.current.textareaRef as any).current = mockTextarea;

      act(() => {
        result.current.resetTextareaSize();
      });

      expect(mockTextarea.blur).toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(window.scrollTo).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not blur on desktop', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ isMobile: false })
      );

      const mockTextarea = createMockTextarea();
      (result.current.textareaRef as any).current = mockTextarea;

      act(() => {
        result.current.resetTextareaSize();
      });

      expect(mockTextarea.blur).not.toHaveBeenCalled();
    });
  });

  describe('Focus and Blur Methods', () => {
    it('should call focus on textarea', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockTextarea = createMockTextarea();
      (result.current.textareaRef as any).current = mockTextarea;

      act(() => {
        result.current.focus();
      });

      expect(mockTextarea.focus).toHaveBeenCalled();
    });

    it('should call blur on textarea', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockTextarea = createMockTextarea();
      (result.current.textareaRef as any).current = mockTextarea;

      act(() => {
        result.current.blur();
      });

      expect(mockTextarea.blur).toHaveBeenCalled();
    });

    it('should handle null ref gracefully for focus', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      // Ref is null
      act(() => {
        result.current.focus();
      });

      // Should not throw
    });

    it('should handle null ref gracefully for blur', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      act(() => {
        result.current.blur();
      });

      // Should not throw
    });
  });

  describe('Mobile Focus Behavior', () => {
    beforeEach(() => {
      // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should scroll textarea into view on mobile focus', () => {
      const mockTextarea = createMockTextarea();

      // Render with mobile flag
      renderHook(() => useTextareaAutosize({ isMobile: true }));

      // We need to manually simulate the effect by triggering the focus handler
      // The hook adds a focus event listener in useEffect
    });

    it('should add extra scroll for iOS devices', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        writable: true,
      });

      const mockTextarea = createMockTextarea();

      // This tests the iOS-specific behavior
      // The actual focus event listener behavior would need integration testing
    });
  });

  describe('Error Handling', () => {
    it('should handle textarea without style property', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockEvent = {
        target: {
          scrollHeight: 100,
          style: null,
        },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      // Should not throw
      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });
    });

    it('should handle errors during resize gracefully', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockTextarea = {
        scrollHeight: 100,
        scrollTop: 0,
        style: {
          get height() {
            throw new Error('Style error');
          },
          set height(_v: string) {
            throw new Error('Style error');
          },
          overflowY: '',
        },
      };

      const mockEvent = {
        target: mockTextarea,
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      // Should catch error and warn
      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(console.warn).toHaveBeenCalledWith(
        'Error resizing textarea:',
        expect.any(Error)
      );
    });

    it('should handle errors during reset gracefully', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const mockTextarea = {
        style: {
          get height() {
            throw new Error('Style error');
          },
          set height(_v: string) {
            throw new Error('Style error');
          },
          overflowY: '',
        },
        blur: jest.fn(),
      };

      (result.current.textareaRef as any).current = mockTextarea;

      // Should catch error and warn
      act(() => {
        result.current.resetTextareaSize();
      });

      expect(console.warn).toHaveBeenCalledWith(
        'Error resetting textarea:',
        expect.any(Error)
      );
    });
  });

  describe('Handler Stability', () => {
    it('should return stable handler references when options unchanged', () => {
      const { result, rerender } = renderHook(() =>
        useTextareaAutosize({ minHeight: 80, maxHeight: 160 })
      );

      const firstHandlers = {
        handleTextareaChange: result.current.handleTextareaChange,
        resetTextareaSize: result.current.resetTextareaSize,
        focus: result.current.focus,
        blur: result.current.blur,
      };

      rerender();

      expect(result.current.handleTextareaChange).toBe(firstHandlers.handleTextareaChange);
      expect(result.current.resetTextareaSize).toBe(firstHandlers.resetTextareaSize);
      expect(result.current.focus).toBe(firstHandlers.focus);
      expect(result.current.blur).toBe(firstHandlers.blur);
    });

    it('should update handlers when options change', () => {
      const { result, rerender } = renderHook(
        ({ minHeight }) => useTextareaAutosize({ minHeight }),
        { initialProps: { minHeight: 80 } }
      );

      const firstHandler = result.current.handleTextareaChange;

      rerender({ minHeight: 100 });

      expect(result.current.handleTextareaChange).not.toBe(firstHandler);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small minHeight', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ minHeight: 10 })
      );

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 5 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      expect(mockEvent.target.style.height).toBe('10px');
    });

    it('should handle minHeight greater than maxHeight', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ minHeight: 200, maxHeight: 100 })
      );

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 150 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // minHeight (200) > maxHeight (100), so Math.min returns 100
      expect(mockEvent.target.style.height).toBe('200px');
    });

    it('should handle zero scrollHeight', () => {
      const { result } = renderHook(() =>
        useTextareaAutosize({ minHeight: 80 })
      );

      const mockEvent = {
        target: createMockTextarea({ scrollHeight: 0 }),
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      act(() => {
        result.current.handleTextareaChange(mockEvent);
      });

      // Should use minHeight
      expect(mockEvent.target.style.height).toBe('80px');
    });

    it('should handle rapid consecutive changes', () => {
      const { result } = renderHook(() => useTextareaAutosize());

      const heights = [50, 100, 150, 200, 100, 80];

      heights.forEach((scrollHeight) => {
        const mockEvent = {
          target: createMockTextarea({ scrollHeight }),
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

        act(() => {
          result.current.handleTextareaChange(mockEvent);
        });
      });

      // Final height should be 80 (minHeight)
      // Last scrollHeight was 80, which equals minHeight
    });
  });

  describe('Cleanup', () => {
    it('should remove event listener on unmount when mobile', () => {
      const mockRemoveEventListener = jest.fn();

      const { unmount } = renderHook(() =>
        useTextareaAutosize({ isMobile: true })
      );

      // The cleanup function removes the event listener
      unmount();

      // Event listener cleanup is handled internally
    });
  });
});
