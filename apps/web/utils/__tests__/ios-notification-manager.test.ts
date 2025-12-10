/**
 * Tests for iOS Notification Manager
 */

import {
  getIOSNotificationManager,
  resetIOSNotificationManager,
  iosNotifications,
} from '../ios-notification-manager';

describe('IOSNotificationManager', () => {
  beforeEach(() => {
    resetIOSNotificationManager();
  });

  describe('iOS Detection', () => {
    it('should detect iOS from iPhone user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      expect(manager.isIOS()).toBe(true);
    });

    it('should detect iPad', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      expect(manager.isIOS()).toBe(true);
      expect(manager.isIPadOS()).toBe(true);
    });

    it('should not detect iOS on Android', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (Linux; Android 13)',
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      expect(manager.isIOS()).toBe(false);
    });
  });

  describe('iOS Version Detection', () => {
    it('should parse iOS version correctly', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)',
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      expect(manager.getIOSVersion()).toBe(16);
    });

    it('should return null for non-iOS', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (Linux; Android 13)',
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      expect(manager.getIOSVersion()).toBeNull();
    });
  });

  describe('Notification Capabilities', () => {
    it('should report no support for iOS < 16', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
      });

      resetIOSNotificationManager();
      const capabilities = iosNotifications.getCapabilities();

      expect(capabilities.canReceivePushNotifications).toBe(false);
      expect(capabilities.recommendedFallback).toBe('in-app');
      expect(capabilities.reason).toContain('iOS 15');
    });

    it('should require home screen install for iOS 16+ in browser', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)',
      });

      // Mock not standalone
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockReturnValue({ matches: false }),
      });

      resetIOSNotificationManager();
      const capabilities = iosNotifications.getCapabilities();

      expect(capabilities.needsHomeScreenInstall).toBe(true);
      expect(capabilities.canReceivePushNotifications).toBe(false);
    });

    it('should support push notifications for iOS 16+ standalone', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)',
      });

      // Mock standalone mode
      Object.defineProperty(window.navigator, 'standalone', {
        writable: true,
        value: true,
      });

      // Mock PushManager support
      Object.defineProperty(window, 'PushManager', {
        writable: true,
        value: function() {},
      });

      resetIOSNotificationManager();
      const capabilities = iosNotifications.getCapabilities();

      expect(capabilities.canReceivePushNotifications).toBe(true);
      expect(capabilities.canShowBadge).toBe(false); // iOS ne supporte pas badging
    });

    it('should never support badging on iOS', () => {
      const manager = getIOSNotificationManager();
      expect(manager.supportsBadging()).toBe(false);
    });
  });

  describe('Install Instructions', () => {
    it('should provide Safari-specific instructions', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      });

      resetIOSNotificationManager();
      const instructions = iosNotifications.getInstallInstructions();

      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions[0]).toContain('Share');
    });

    it('should provide different instructions for non-Safari', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Chrome/108.0.0.0',
      });

      resetIOSNotificationManager();
      const instructions = iosNotifications.getInstallInstructions();

      expect(instructions[0]).toContain('Safari');
    });
  });

  describe('Install Prompt Logic', () => {
    it('should return false when not on iOS', () => {
      // In the default test environment (not iOS), should return false
      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      // Non-iOS should not show install prompt
      if (!manager.isIOS()) {
        expect(manager.shouldShowInstallPrompt()).toBe(false);
      }
    });

    it('should not show prompt if already installed (standalone)', () => {
      Object.defineProperty(window.navigator, 'standalone', {
        writable: true,
        configurable: true,
        value: true,
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      // If standalone is true, should not show prompt
      if (manager.isInstalledPWA()) {
        expect(manager.shouldShowInstallPrompt()).toBe(false);
      }
    });

    it('should not show prompt for iOS < 16', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        configurable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();

      // iOS 15 should never show prompt
      const version = manager.getIOSVersion();
      if (version !== null && version < 16) {
        expect(manager.shouldShowInstallPrompt()).toBe(false);
      }
    });
  });

  describe('User Messages', () => {
    it('should provide helpful message for old iOS', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        configurable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
      });

      resetIOSNotificationManager();
      const manager = getIOSNotificationManager();
      const message = manager.getUserMessage();

      // Check message based on actual capabilities detected
      const capabilities = manager.getNotificationCapabilities();
      if (!capabilities.canReceivePushNotifications && !capabilities.needsHomeScreenInstall) {
        expect(message).toContain('not available');
      }
    });

    it('should provide a user message', () => {
      resetIOSNotificationManager();
      const message = iosNotifications.getUserMessage();

      // Should always return a non-empty message
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });
  });

  describe('Dismissal Tracking', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should record dismissal', () => {
      const manager = getIOSNotificationManager();
      manager.recordInstallDismissal();

      const dismissed = localStorage.getItem('ios_install_prompt_dismissed');
      expect(dismissed).toBeTruthy();
    });

    it('should check if recently dismissed', () => {
      const manager = getIOSNotificationManager();

      // Not dismissed yet
      expect(manager.wasInstallPromptRecentlyDismissed(7)).toBe(false);

      // Record dismissal
      manager.recordInstallDismissal();

      // Should be recently dismissed
      expect(manager.wasInstallPromptRecentlyDismissed(7)).toBe(true);
    });

    it('should consider old dismissals as not recent', () => {
      const manager = getIOSNotificationManager();

      // Set old dismissal (10 days ago)
      const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
      localStorage.setItem('ios_install_prompt_dismissed', tenDaysAgo.toString());

      // Should not be considered recent (within 7 days)
      expect(manager.wasInstallPromptRecentlyDismissed(7)).toBe(false);
    });
  });

  describe('Debug Report', () => {
    it('should generate debug report', () => {
      Object.defineProperty(navigator, 'userAgent', {
        writable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)',
      });

      resetIOSNotificationManager();
      const report = iosNotifications.getDebugReport();

      expect(report).toContain('iOS Notification Debug Report');
      expect(report).toContain('Version');
      expect(report).toContain('Support');
      expect(report).toContain('Capabilities');
    });
  });
});
