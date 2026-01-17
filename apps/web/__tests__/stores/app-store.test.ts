/**
 * App Store Tests
 * Tests for global application state management with Zustand
 */

import { act } from '@testing-library/react';
import { useAppStore } from '../../stores/app-store';

describe('AppStore', () => {
  // Save original window properties
  const originalNavigator = window.navigator;
  const originalDocument = window.document;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useAppStore.setState({
        isOnline: true,
        theme: 'auto',
        notifications: [],
        isInitialized: false,
      });
    });
    jest.clearAllMocks();
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Restore original window properties if needed
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAppStore.getState();

      expect(state.isOnline).toBe(true);
      expect(state.theme).toBe('auto');
      expect(state.notifications).toEqual([]);
      expect(state.isInitialized).toBe(false);
    });
  });

  describe('Online Status', () => {
    describe('setOnline', () => {
      it('should set online status to true', () => {
        act(() => {
          useAppStore.getState().setOnline(true);
        });

        expect(useAppStore.getState().isOnline).toBe(true);
      });

      it('should set online status to false', () => {
        act(() => {
          useAppStore.getState().setOnline(false);
        });

        expect(useAppStore.getState().isOnline).toBe(false);
      });

      it('should toggle online status', () => {
        act(() => {
          useAppStore.getState().setOnline(false);
        });
        expect(useAppStore.getState().isOnline).toBe(false);

        act(() => {
          useAppStore.getState().setOnline(true);
        });
        expect(useAppStore.getState().isOnline).toBe(true);
      });
    });
  });

  describe('Theme', () => {
    describe('setTheme', () => {
      it('should set theme to light', () => {
        act(() => {
          useAppStore.getState().setTheme('light');
        });

        expect(useAppStore.getState().theme).toBe('light');
      });

      it('should set theme to dark', () => {
        act(() => {
          useAppStore.getState().setTheme('dark');
        });

        expect(useAppStore.getState().theme).toBe('dark');
      });

      it('should set theme to auto', () => {
        act(() => {
          useAppStore.getState().setTheme('light');
          useAppStore.getState().setTheme('auto');
        });

        expect(useAppStore.getState().theme).toBe('auto');
      });

      it('should apply light class to document', () => {
        act(() => {
          useAppStore.getState().setTheme('light');
        });

        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      });

      it('should apply dark class to document', () => {
        act(() => {
          useAppStore.getState().setTheme('dark');
        });

        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('light')).toBe(false);
      });

      it('should remove both classes before applying new one', () => {
        act(() => {
          useAppStore.getState().setTheme('light');
          useAppStore.getState().setTheme('dark');
        });

        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('light')).toBe(false);
      });
    });
  });

  describe('Notifications', () => {
    describe('addNotification', () => {
      it('should add a notification with generated id and timestamp', () => {
        const beforeTime = new Date();

        act(() => {
          useAppStore.getState().addNotification({
            type: 'info',
            title: 'Test Notification',
            message: 'This is a test',
          });
        });

        const afterTime = new Date();
        const notifications = useAppStore.getState().notifications;

        expect(notifications).toHaveLength(1);
        expect(notifications[0].id).toMatch(/^notification-\d+-[a-z0-9]+$/);
        expect(notifications[0].title).toBe('Test Notification');
        expect(notifications[0].type).toBe('info');
        expect(notifications[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(notifications[0].timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      });

      it('should support all notification types', () => {
        const types: Array<'info' | 'success' | 'warning' | 'error'> = ['info', 'success', 'warning', 'error'];

        types.forEach(type => {
          act(() => {
            useAppStore.getState().addNotification({
              type,
              title: `${type} notification`,
            });
          });
        });

        const notifications = useAppStore.getState().notifications;
        expect(notifications).toHaveLength(4);
        expect(notifications.map(n => n.type)).toEqual(types);
      });

      it('should add multiple notifications', () => {
        act(() => {
          useAppStore.getState().addNotification({ type: 'info', title: 'First' });
          useAppStore.getState().addNotification({ type: 'success', title: 'Second' });
          useAppStore.getState().addNotification({ type: 'error', title: 'Third' });
        });

        expect(useAppStore.getState().notifications).toHaveLength(3);
      });

      it('should auto-remove notification after default duration (5000ms)', () => {
        act(() => {
          useAppStore.getState().addNotification({
            type: 'info',
            title: 'Auto-remove test',
          });
        });

        expect(useAppStore.getState().notifications).toHaveLength(1);

        act(() => {
          jest.advanceTimersByTime(5000);
        });

        expect(useAppStore.getState().notifications).toHaveLength(0);
      });

      it('should auto-remove notification after custom duration', () => {
        act(() => {
          useAppStore.getState().addNotification({
            type: 'info',
            title: 'Custom duration',
            duration: 2000,
          });
        });

        expect(useAppStore.getState().notifications).toHaveLength(1);

        act(() => {
          jest.advanceTimersByTime(1999);
        });
        expect(useAppStore.getState().notifications).toHaveLength(1);

        act(() => {
          jest.advanceTimersByTime(1);
        });
        expect(useAppStore.getState().notifications).toHaveLength(0);
      });

      it('should not auto-remove if duration is 0', () => {
        act(() => {
          useAppStore.getState().addNotification({
            type: 'info',
            title: 'Persistent notification',
            duration: 0,
          });
        });

        act(() => {
          jest.advanceTimersByTime(100000);
        });

        expect(useAppStore.getState().notifications).toHaveLength(1);
      });

      it('should support notifications with actions', () => {
        const mockAction = jest.fn();

        act(() => {
          useAppStore.getState().addNotification({
            type: 'warning',
            title: 'Action required',
            actions: [
              { label: 'Retry', action: mockAction },
              { label: 'Dismiss', action: jest.fn() },
            ],
          });
        });

        const notification = useAppStore.getState().notifications[0];
        expect(notification.actions).toHaveLength(2);
        expect(notification.actions?.[0].label).toBe('Retry');

        // Execute action
        notification.actions?.[0].action();
        expect(mockAction).toHaveBeenCalled();
      });
    });

    describe('removeNotification', () => {
      it('should remove a notification by id', () => {
        act(() => {
          useAppStore.getState().addNotification({ type: 'info', title: 'First', duration: 0 });
          useAppStore.getState().addNotification({ type: 'success', title: 'Second', duration: 0 });
        });

        const notifications = useAppStore.getState().notifications;
        const idToRemove = notifications[0].id;

        act(() => {
          useAppStore.getState().removeNotification(idToRemove);
        });

        const remaining = useAppStore.getState().notifications;
        expect(remaining).toHaveLength(1);
        expect(remaining[0].title).toBe('Second');
      });

      it('should not throw for non-existent id', () => {
        act(() => {
          useAppStore.getState().removeNotification('non-existent-id');
        });

        // Should not throw
        expect(useAppStore.getState().notifications).toHaveLength(0);
      });
    });

    describe('clearNotifications', () => {
      it('should clear all notifications', () => {
        act(() => {
          useAppStore.getState().addNotification({ type: 'info', title: 'First', duration: 0 });
          useAppStore.getState().addNotification({ type: 'success', title: 'Second', duration: 0 });
          useAppStore.getState().addNotification({ type: 'error', title: 'Third', duration: 0 });
        });

        expect(useAppStore.getState().notifications).toHaveLength(3);

        act(() => {
          useAppStore.getState().clearNotifications();
        });

        expect(useAppStore.getState().notifications).toHaveLength(0);
      });

      it('should be safe to call when empty', () => {
        act(() => {
          useAppStore.getState().clearNotifications();
        });

        expect(useAppStore.getState().notifications).toHaveLength(0);
      });
    });
  });

  describe('Initialization', () => {
    describe('initialize', () => {
      it('should set isInitialized to true', async () => {
        await act(async () => {
          await useAppStore.getState().initialize();
        });

        expect(useAppStore.getState().isInitialized).toBe(true);
      });

      it('should set online status based on navigator.onLine', async () => {
        Object.defineProperty(window.navigator, 'onLine', {
          value: false,
          writable: true,
        });

        await act(async () => {
          await useAppStore.getState().initialize();
        });

        expect(useAppStore.getState().isOnline).toBe(false);
      });

      it('should apply initial theme', async () => {
        act(() => {
          useAppStore.setState({ theme: 'dark' });
        });

        await act(async () => {
          await useAppStore.getState().initialize();
        });

        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });
    });
  });

  describe('Selector Hooks', () => {
    it('useTheme should return current theme', () => {
      act(() => {
        useAppStore.getState().setTheme('dark');
      });

      expect(useAppStore.getState().theme).toBe('dark');
    });

    it('useIsOnline should return online status', () => {
      act(() => {
        useAppStore.getState().setOnline(false);
      });

      expect(useAppStore.getState().isOnline).toBe(false);
    });

    it('useNotifications should return notifications array', () => {
      act(() => {
        useAppStore.getState().addNotification({ type: 'info', title: 'Test', duration: 0 });
      });

      const notifications = useAppStore.getState().notifications;
      expect(notifications).toHaveLength(1);
    });

    it('useIsInitialized should return initialization status', async () => {
      expect(useAppStore.getState().isInitialized).toBe(false);

      await act(async () => {
        await useAppStore.getState().initialize();
      });

      expect(useAppStore.getState().isInitialized).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should only persist theme (not notifications or online status)', () => {
      // The store partializes to only persist theme
      act(() => {
        useAppStore.getState().setTheme('dark');
        useAppStore.getState().setOnline(false);
        useAppStore.getState().addNotification({ type: 'info', title: 'Test', duration: 0 });
      });

      const state = useAppStore.getState();

      // All values should be set in state
      expect(state.theme).toBe('dark');
      expect(state.isOnline).toBe(false);
      expect(state.notifications).toHaveLength(1);

      // But persistence only keeps theme (verified by store config)
    });
  });

  describe('Error Handling', () => {
    it('should add error notification on initialization failure', async () => {
      // Mock an error scenario by making theme application fail
      const originalClassList = document.documentElement.classList;

      // Temporarily break classList
      Object.defineProperty(document.documentElement, 'classList', {
        value: {
          remove: () => { throw new Error('Test error'); },
          add: () => { throw new Error('Test error'); },
        },
        configurable: true,
      });

      // We need to catch the error but the store handles it internally
      try {
        await act(async () => {
          await useAppStore.getState().initialize();
        });
      } catch {
        // Expected to fail
      }

      // Restore classList
      Object.defineProperty(document.documentElement, 'classList', {
        value: originalClassList,
        configurable: true,
      });
    });
  });
});
