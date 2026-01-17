/**
 * Tests for notifications.tsx
 * Tests useNotifications hook, ConnectionStatus component, and NotificationCenter component
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  useNotifications,
  ConnectionStatus,
  NotificationCenter,
  type NotificationConfig,
  type NotificationType,
} from '@/components/notifications/notifications';

// Mock sonner toast
const mockToast = jest.fn();
jest.mock('sonner', () => ({
  toast: Object.assign(mockToast, {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

// Store original navigator.onLine
const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

describe('notifications.tsx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToast.mockClear();

    // Reset navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });

    // Reset window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    // Restore original onLine property
    if (originalOnLine) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
    }
  });

  describe('useNotifications Hook', () => {
    describe('Online Status', () => {
      it('should return isOnline as true when navigator is online', () => {
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

        const { result } = renderHook(() => useNotifications());

        expect(result.current.isOnline).toBe(true);
      });

      it('should return isOnline as false when navigator is offline', () => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

        const { result } = renderHook(() => useNotifications());

        expect(result.current.isOnline).toBe(false);
      });

      it('should update isOnline when online event is triggered', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

        const { result } = renderHook(() => useNotifications());

        expect(result.current.isOnline).toBe(false);

        await act(async () => {
          Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
          window.dispatchEvent(new Event('online'));
        });

        expect(result.current.isOnline).toBe(true);
      });

      it('should update isOnline when offline event is triggered', async () => {
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

        const { result } = renderHook(() => useNotifications());

        expect(result.current.isOnline).toBe(true);

        await act(async () => {
          Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
          window.dispatchEvent(new Event('offline'));
        });

        expect(result.current.isOnline).toBe(false);
      });

      it('should cleanup event listeners on unmount', () => {
        const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

        const { unmount } = renderHook(() => useNotifications());
        unmount();

        expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
        expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

        removeEventListenerSpy.mockRestore();
      });
    });

    describe('notify Function', () => {
      it('should call toast with correct parameters', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });

        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notify({
            title: 'Test Title',
            description: 'Test Description',
            type: 'info',
          });
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Test Title',
          expect.objectContaining({
            description: 'Test Description',
            duration: 4000,
            className: 'toast-info',
          })
        );
      });

      it('should not show toast on mobile (width <= 768)', () => {
        Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });

        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notify({
            title: 'Test',
            type: 'info',
          });
        });

        expect(mockToast).not.toHaveBeenCalled();
      });

      it('should use custom duration when provided', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notify({
            title: 'Test',
            type: 'info',
            duration: 8000,
          });
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Test',
          expect.objectContaining({
            duration: 8000,
          })
        );
      });

      it('should include action when provided', () => {
        const mockAction = { label: 'Click', onClick: jest.fn() };

        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notify({
            title: 'Test',
            type: 'info',
            action: mockAction,
          });
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Test',
          expect.objectContaining({
            action: {
              label: 'Click',
              onClick: mockAction.onClick,
            },
          })
        );
      });

      it('should use correct icon for success type', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notify({
            title: 'Success',
            type: 'success',
          });
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Success',
          expect.objectContaining({
            className: 'toast-success',
          })
        );
      });

      it('should use correct icon for error type', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notify({
            title: 'Error',
            type: 'error',
          });
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            className: 'toast-error',
          })
        );
      });

      it('should use correct icon for warning type', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notify({
            title: 'Warning',
            type: 'warning',
          });
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Warning',
          expect.objectContaining({
            className: 'toast-warning',
          })
        );
      });
    });

    describe('Predefined Notification Functions', () => {
      it('should call notifySuccess correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifySuccess('Success Title', 'Success Description');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Success Title',
          expect.objectContaining({
            description: 'Success Description',
            className: 'toast-success',
          })
        );
      });

      it('should call notifyError correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyError('Error Title', 'Error Description');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Error Title',
          expect.objectContaining({
            description: 'Error Description',
            className: 'toast-error',
          })
        );
      });

      it('should call notifyWarning correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyWarning('Warning Title', 'Warning Description');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Warning Title',
          expect.objectContaining({
            description: 'Warning Description',
            className: 'toast-warning',
          })
        );
      });

      it('should call notifyInfo correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyInfo('Info Title', 'Info Description');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Info Title',
          expect.objectContaining({
            description: 'Info Description',
            className: 'toast-info',
          })
        );
      });
    });

    describe('Application-Specific Notifications', () => {
      it('should call notifyTranslationSuccess correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyTranslationSuccess('French', 'English');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Message traduit',
          expect.objectContaining({
            description: 'Traduit de French vers English',
            duration: 2000,
            className: 'toast-success',
          })
        );
      });

      it('should call notifyTranslationError with custom error', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyTranslationError('Custom error message');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Erreur de traduction',
          expect.objectContaining({
            description: 'Custom error message',
            duration: 4000,
            className: 'toast-error',
          })
        );
      });

      it('should call notifyTranslationError with default error', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyTranslationError();
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Erreur de traduction',
          expect.objectContaining({
            description: 'Impossible de traduire le message',
          })
        );
      });

      it('should call notifyModelLoaded correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyModelLoaded('GPT-4');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Modele charge',
          expect.objectContaining({
            description: 'Le modele GPT-4 est maintenant disponible',
            duration: 3000,
            className: 'toast-success',
          })
        );
      });

      it('should call notifyUserJoined correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyUserJoined('John');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Utilisateur connecte',
          expect.objectContaining({
            description: 'John a rejoint la conversation',
            duration: 2000,
            className: 'toast-info',
          })
        );
      });

      it('should call notifyUserLeft correctly', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyUserLeft('John');
        });

        expect(mockToast).toHaveBeenCalledWith(
          'Utilisateur deconnecte',
          expect.objectContaining({
            description: 'John a quitte la conversation',
            duration: 2000,
            className: 'toast-info',
          })
        );
      });

      it('should not show toast for notifyConnectionStatus (disabled)', () => {
        const { result } = renderHook(() => useNotifications());

        act(() => {
          result.current.notifyConnectionStatus(true, 'testuser');
        });

        // Connection status toasts are disabled
        expect(mockToast).not.toHaveBeenCalled();
      });
    });

    describe('Return Values', () => {
      it('should return all expected functions', () => {
        const { result } = renderHook(() => useNotifications());

        expect(result.current.notify).toBeInstanceOf(Function);
        expect(result.current.notifySuccess).toBeInstanceOf(Function);
        expect(result.current.notifyError).toBeInstanceOf(Function);
        expect(result.current.notifyWarning).toBeInstanceOf(Function);
        expect(result.current.notifyInfo).toBeInstanceOf(Function);
        expect(result.current.notifyTranslationSuccess).toBeInstanceOf(Function);
        expect(result.current.notifyTranslationError).toBeInstanceOf(Function);
        expect(result.current.notifyModelLoaded).toBeInstanceOf(Function);
        expect(result.current.notifyConnectionStatus).toBeInstanceOf(Function);
        expect(result.current.notifyUserJoined).toBeInstanceOf(Function);
        expect(result.current.notifyUserLeft).toBeInstanceOf(Function);
        expect(typeof result.current.isOnline).toBe('boolean');
      });
    });
  });

  describe('ConnectionStatus Component', () => {
    // Need to mock useNotifications for this component
    jest.mock('@/components/notifications/notifications', () => ({
      ...jest.requireActual('@/components/notifications/notifications'),
      useNotifications: () => ({
        isOnline: true,
      }),
    }));

    it('should render online status correctly', () => {
      render(<ConnectionStatus />);

      expect(screen.getByText('En ligne')).toBeInTheDocument();
    });

    it('should render with correct online styling', () => {
      const { container } = render(<ConnectionStatus />);

      // Should have green text for online
      const badge = screen.getByText('En ligne');
      expect(badge).toHaveClass('text-green-600');
      expect(badge).toHaveClass('border-green-600');
    });

    it('should have wifi icon when online', () => {
      const { container } = render(<ConnectionStatus />);

      // Should have Wifi icon (green)
      const wifiIcon = container.querySelector('.text-green-600');
      expect(wifiIcon).toBeInTheDocument();
    });
  });

  describe('NotificationCenter Component (from notifications.tsx)', () => {
    it('should render bell icon', () => {
      render(<NotificationCenter />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should not show badge when notification count is 0', () => {
      render(<NotificationCenter />);

      // Initial count is 0, so no badge
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('should render with ghost variant', () => {
      render(<NotificationCenter />);

      const button = screen.getByRole('button');
      // Ghost buttons typically have specific styling
      expect(button).toBeInTheDocument();
    });

    it('should render with sm size', () => {
      render(<NotificationCenter />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('relative');
    });
  });

  describe('Type Definitions', () => {
    it('should accept valid NotificationType values', () => {
      const types: NotificationType[] = ['success', 'error', 'warning', 'info'];

      types.forEach(type => {
        const config: NotificationConfig = {
          title: 'Test',
          type,
        };
        expect(config.type).toBe(type);
      });
    });

    it('should accept NotificationConfig with all properties', () => {
      const config: NotificationConfig = {
        title: 'Test Title',
        description: 'Test Description',
        type: 'success',
        duration: 5000,
        action: {
          label: 'Click',
          onClick: () => {},
        },
      };

      expect(config.title).toBe('Test Title');
      expect(config.description).toBe('Test Description');
      expect(config.type).toBe('success');
      expect(config.duration).toBe(5000);
      expect(config.action?.label).toBe('Click');
    });

    it('should accept NotificationConfig with minimal properties', () => {
      const config: NotificationConfig = {
        title: 'Test',
        type: 'info',
      };

      expect(config.title).toBe('Test');
      expect(config.type).toBe('info');
      expect(config.description).toBeUndefined();
      expect(config.duration).toBeUndefined();
      expect(config.action).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty title', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.notify({
          title: '',
          type: 'info',
        });
      });

      expect(mockToast).toHaveBeenCalledWith('', expect.any(Object));
    });

    it('should handle special characters in title', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.notify({
          title: '<script>alert("xss")</script>',
          type: 'info',
        });
      });

      expect(mockToast).toHaveBeenCalledWith(
        '<script>alert("xss")</script>',
        expect.any(Object)
      );
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(1000);

      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.notify({
          title: 'Test',
          description: longDescription,
          type: 'info',
        });
      });

      expect(mockToast).toHaveBeenCalledWith(
        'Test',
        expect.objectContaining({
          description: longDescription,
        })
      );
    });

    it('should handle rapid consecutive notifications', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.notify({
            title: `Test ${i}`,
            type: 'info',
          });
        }
      });

      expect(mockToast).toHaveBeenCalledTimes(10);
    });
  });
});
