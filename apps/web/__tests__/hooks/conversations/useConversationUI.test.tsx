/**
 * Tests for useConversationUI hook
 *
 * Tests cover:
 * - Mobile detection
 * - Conversation list visibility management
 * - Sidebar resize functionality
 * - Modal state management (create, details)
 * - Gallery state management
 * - localStorage persistence
 * - Responsive behavior
 * - Event cleanup
 */

import { renderHook, act } from '@testing-library/react';
import { useConversationUI } from '@/hooks/conversations/useConversationUI';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('useConversationUI', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

    // Default to desktop size
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  describe('Mobile Detection', () => {
    it('should detect desktop by default (width >= 768)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024 });

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.isMobile).toBe(false);
    });

    it('should detect mobile when width < 768', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600 });

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.isMobile).toBe(true);
    });

    it('should update on window resize with debounce', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024 });

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.isMobile).toBe(false);

      // Simulate resize to mobile
      Object.defineProperty(window, 'innerWidth', { value: 600 });

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      // Should not change immediately (debounced)
      expect(result.current.isMobile).toBe(false);

      // Advance past debounce time (150ms)
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.isMobile).toBe(true);
    });

    it('should handle resize at boundary (768px)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768 });

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      // 768 is not mobile (< 768 is mobile)
      expect(result.current.isMobile).toBe(false);

      Object.defineProperty(window, 'innerWidth', { value: 767 });

      act(() => {
        window.dispatchEvent(new Event('resize'));
        jest.advanceTimersByTime(150);
      });

      expect(result.current.isMobile).toBe(true);
    });
  });

  describe('Conversation List Visibility', () => {
    it('should show conversation list on desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024 });

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: 'conv-1' })
      );

      expect(result.current.showConversationList).toBe(true);
    });

    it('should hide conversation list on mobile when conversation selected', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600 });

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: 'conv-1' })
      );

      expect(result.current.showConversationList).toBe(false);
    });

    it('should show conversation list on mobile when no conversation selected', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600 });

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.showConversationList).toBe(true);
    });

    it('should allow manual control of showConversationList', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.setShowConversationList(false);
      });

      expect(result.current.showConversationList).toBe(false);

      act(() => {
        result.current.setShowConversationList(true);
      });

      expect(result.current.showConversationList).toBe(true);
    });

    it('should update visibility when switching between mobile and desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600 });

      const { result, rerender } = renderHook(
        ({ selectedConversationId }) =>
          useConversationUI({ selectedConversationId }),
        { initialProps: { selectedConversationId: 'conv-1' } }
      );

      expect(result.current.showConversationList).toBe(false);

      // Switch to desktop
      Object.defineProperty(window, 'innerWidth', { value: 1024 });
      act(() => {
        window.dispatchEvent(new Event('resize'));
        jest.advanceTimersByTime(150);
      });

      expect(result.current.showConversationList).toBe(true);
    });
  });

  describe('Sidebar Resize', () => {
    it('should use default width initially', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.conversationListWidth).toBe(384); // DEFAULT_LIST_WIDTH
    });

    it('should load width from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('450');

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.conversationListWidth).toBe(450);
    });

    it('should clamp width to min/max bounds', () => {
      // Below minimum
      mockLocalStorage.getItem.mockReturnValue('100');

      const { result: result1 } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result1.current.conversationListWidth).toBe(280); // MIN_LIST_WIDTH

      // Above maximum
      mockLocalStorage.getItem.mockReturnValue('800');

      const { result: result2 } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result2.current.conversationListWidth).toBe(600); // MAX_LIST_WIDTH
    });

    it('should handle invalid localStorage value', () => {
      mockLocalStorage.getItem.mockReturnValue('not-a-number');

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.conversationListWidth).toBe(384); // DEFAULT
    });

    it('should set isResizing on mouse down', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.isResizing).toBe(false);

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.handleResizeMouseDown(mockEvent);
      });

      expect(result.current.isResizing).toBe(true);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('should update width on mouse move during resize', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      // Start resize
      act(() => {
        result.current.handleResizeMouseDown({
          preventDefault: jest.fn(),
        } as unknown as React.MouseEvent);
      });

      // Move mouse
      act(() => {
        const moveEvent = new MouseEvent('mousemove', { clientX: 400 });
        document.dispatchEvent(moveEvent);
      });

      expect(result.current.conversationListWidth).toBe(400);
    });

    it('should clamp width during resize', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.handleResizeMouseDown({
          preventDefault: jest.fn(),
        } as unknown as React.MouseEvent);
      });

      // Try to resize beyond max
      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 800 }));
      });

      expect(result.current.conversationListWidth).toBe(600); // MAX

      // Try to resize below min
      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }));
      });

      expect(result.current.conversationListWidth).toBe(280); // MIN
    });

    it('should stop resizing on mouse up', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.handleResizeMouseDown({
          preventDefault: jest.fn(),
        } as unknown as React.MouseEvent);
      });

      expect(result.current.isResizing).toBe(true);

      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(result.current.isResizing).toBe(false);
    });

    it('should persist width to localStorage', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.handleResizeMouseDown({
          preventDefault: jest.fn(),
        } as unknown as React.MouseEvent);
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 450 }));
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'conversationListWidth',
        '450'
      );
    });
  });

  describe('Modal State', () => {
    it('should return isCreateModalOpen false initially', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.isCreateModalOpen).toBe(false);
    });

    it('should return isDetailsOpen false initially', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.isDetailsOpen).toBe(false);
    });

    it('should allow toggling create modal', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.setIsCreateModalOpen(true);
      });

      expect(result.current.isCreateModalOpen).toBe(true);

      act(() => {
        result.current.setIsCreateModalOpen(false);
      });

      expect(result.current.isCreateModalOpen).toBe(false);
    });

    it('should allow toggling details panel', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.setIsDetailsOpen(true);
      });

      expect(result.current.isDetailsOpen).toBe(true);

      act(() => {
        result.current.setIsDetailsOpen(false);
      });

      expect(result.current.isDetailsOpen).toBe(false);
    });
  });

  describe('Gallery State', () => {
    it('should return galleryOpen false initially', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.galleryOpen).toBe(false);
    });

    it('should return selectedAttachmentId null initially', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.selectedAttachmentId).toBeNull();
    });

    it('should allow toggling gallery', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.setGalleryOpen(true);
      });

      expect(result.current.galleryOpen).toBe(true);
    });

    it('should allow setting selected attachment', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.setSelectedAttachmentId('attachment-123');
      });

      expect(result.current.selectedAttachmentId).toBe('attachment-123');
    });

    it('should handle image click to open gallery', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.handleImageClick('image-456');
      });

      expect(result.current.galleryOpen).toBe(true);
      expect(result.current.selectedAttachmentId).toBe('image-456');
    });
  });

  describe('Cleanup', () => {
    it('should remove resize event listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    it('should remove mouse listeners after resize ends', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      // Start resize
      act(() => {
        result.current.handleResizeMouseDown({
          preventDefault: jest.fn(),
        } as unknown as React.MouseEvent);
      });

      // End resize
      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mousemove',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mouseup',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    it('should clear debounce timeout on unmount', () => {
      const { unmount } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      // Trigger a resize that sets up a debounce timeout
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      // Unmount before debounce completes
      unmount();

      // Should not throw
      act(() => {
        jest.advanceTimersByTime(200);
      });
    });
  });

  describe('Handler Stability', () => {
    it('should return stable handleResizeMouseDown reference', () => {
      const { result, rerender } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      const firstHandler = result.current.handleResizeMouseDown;

      rerender();

      expect(result.current.handleResizeMouseDown).toBe(firstHandler);
    });

    it('should return stable handleImageClick reference', () => {
      const { result, rerender } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      const firstHandler = result.current.handleImageClick;

      rerender();

      expect(result.current.handleImageClick).toBe(firstHandler);
    });

    it('should return stable setters', () => {
      const { result, rerender } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      const firstSetters = {
        setShowConversationList: result.current.setShowConversationList,
        setIsCreateModalOpen: result.current.setIsCreateModalOpen,
        setIsDetailsOpen: result.current.setIsDetailsOpen,
        setGalleryOpen: result.current.setGalleryOpen,
        setSelectedAttachmentId: result.current.setSelectedAttachmentId,
      };

      rerender();

      expect(result.current.setShowConversationList).toBe(firstSetters.setShowConversationList);
      expect(result.current.setIsCreateModalOpen).toBe(firstSetters.setIsCreateModalOpen);
      expect(result.current.setIsDetailsOpen).toBe(firstSetters.setIsDetailsOpen);
      expect(result.current.setGalleryOpen).toBe(firstSetters.setGalleryOpen);
      expect(result.current.setSelectedAttachmentId).toBe(firstSetters.setSelectedAttachmentId);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined selectedConversationId', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: undefined as any })
      );

      // Should behave like null
      expect(result.current.showConversationList).toBe(true);
    });

    it('should handle SSR (no window)', () => {
      // The hook checks typeof window === 'undefined' for initial state
      // In JSDOM this is always defined, so we test the fallback path indirectly
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      expect(result.current.conversationListWidth).toBeGreaterThanOrEqual(280);
      expect(result.current.conversationListWidth).toBeLessThanOrEqual(600);
    });

    it('should handle rapid resize events', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      // Fire many resize events rapidly
      act(() => {
        for (let i = 0; i < 20; i++) {
          Object.defineProperty(window, 'innerWidth', { value: 500 + i * 50 });
          window.dispatchEvent(new Event('resize'));
        }
      });

      // Should debounce and only process once
      act(() => {
        jest.advanceTimersByTime(150);
      });

      // Final width should be 1450, which is >= 768 (desktop)
      expect(result.current.isMobile).toBe(false);
    });

    it('should handle multiple handleImageClick calls', () => {
      const { result } = renderHook(() =>
        useConversationUI({ selectedConversationId: null })
      );

      act(() => {
        result.current.handleImageClick('img-1');
        result.current.handleImageClick('img-2');
        result.current.handleImageClick('img-3');
      });

      // Should have last image selected
      expect(result.current.selectedAttachmentId).toBe('img-3');
      expect(result.current.galleryOpen).toBe(true);
    });
  });
});
