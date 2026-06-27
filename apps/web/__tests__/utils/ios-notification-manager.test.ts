/**
 * Tests for utils/ios-notification-manager.ts
 */

import {
  getIOSNotificationManager,
  resetIOSNotificationManager,
  iosNotifications,
} from '@/utils/ios-notification-manager';

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    writable: true,
    configurable: true,
  });
}

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    writable: true,
    configurable: true,
  });
}

function setMaxTouchPoints(n: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: n,
    writable: true,
    configurable: true,
  });
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit Safari';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit Safari';
const IOS_OLD_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit Safari';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit Chrome/120';
const CHROME_IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit CriOS/120';

beforeEach(() => {
  resetIOSNotificationManager();
  setUserAgent(ANDROID_UA);
  setPlatform('Linux armv8l');
  setMaxTouchPoints(0);

  // Non-standalone by default
  Object.defineProperty(window.navigator, 'standalone', {
    value: false,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, 'PushManager', {
    value: class PushManager {},
    writable: true,
    configurable: true,
  });

  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: jest.fn() },
    writable: true,
    configurable: true,
  });
});

// ─── isIOS ────────────────────────────────────────────────────────────────────

describe('isIOS', () => {
  it('returns true for iPhone UA', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().isIOS()).toBe(true);
  });

  it('returns true for iPad UA', () => {
    setUserAgent(IPAD_UA);
    expect(getIOSNotificationManager().isIOS()).toBe(true);
  });

  it('returns true for MacIntel + high maxTouchPoints (iPadOS)', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari');
    setPlatform('MacIntel');
    setMaxTouchPoints(5);
    expect(getIOSNotificationManager().isIOS()).toBe(true);
  });

  it('returns false for Android UA', () => {
    setUserAgent(ANDROID_UA);
    expect(getIOSNotificationManager().isIOS()).toBe(false);
  });
});

// ─── isIPadOS ─────────────────────────────────────────────────────────────────

describe('isIPadOS', () => {
  it('returns true for iPad UA', () => {
    setUserAgent(IPAD_UA);
    expect(getIOSNotificationManager().isIPadOS()).toBe(true);
  });

  it('returns true for MacIntel + maxTouchPoints > 1', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari');
    setPlatform('MacIntel');
    setMaxTouchPoints(2);
    expect(getIOSNotificationManager().isIPadOS()).toBe(true);
  });

  it('returns false for iPhone UA', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().isIPadOS()).toBe(false);
  });
});

// ─── getIOSVersion ────────────────────────────────────────────────────────────

describe('getIOSVersion', () => {
  it('parses iOS 17 from iPhone UA', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().getIOSVersion()).toBe(17);
  });

  it('parses iOS 16 from iPad UA', () => {
    setUserAgent(IPAD_UA);
    expect(getIOSNotificationManager().getIOSVersion()).toBe(16);
  });

  it('parses iOS 15', () => {
    setUserAgent(IOS_OLD_UA);
    expect(getIOSNotificationManager().getIOSVersion()).toBe(15);
  });

  it('returns null for Android UA', () => {
    setUserAgent(ANDROID_UA);
    expect(getIOSNotificationManager().getIOSVersion()).toBeNull();
  });
});

// ─── isSafari ─────────────────────────────────────────────────────────────────

describe('isSafari', () => {
  it('returns true for Safari on iPhone', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().isSafari()).toBe(true);
  });

  it('returns false for Chrome on iOS (CriOS)', () => {
    setUserAgent(CHROME_IOS_UA);
    expect(getIOSNotificationManager().isSafari()).toBe(false);
  });

  it('returns false for Chrome on Android', () => {
    setUserAgent(ANDROID_UA);
    expect(getIOSNotificationManager().isSafari()).toBe(false);
  });
});

// ─── isInstalledPWA ───────────────────────────────────────────────────────────

describe('isInstalledPWA', () => {
  it('returns true when navigator.standalone = true', () => {
    setUserAgent(IPHONE_UA);
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });
    expect(getIOSNotificationManager().isInstalledPWA()).toBe(true);
  });

  it('returns false when not standalone', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().isInstalledPWA()).toBe(false);
  });
});

// ─── supportsPushNotifications ────────────────────────────────────────────────

describe('supportsPushNotifications', () => {
  it('returns false for non-iOS device', () => {
    setUserAgent(ANDROID_UA);
    expect(getIOSNotificationManager().supportsPushNotifications()).toBe(false);
  });

  it('returns false for iOS 15 (below 16)', () => {
    setUserAgent(IOS_OLD_UA);
    expect(getIOSNotificationManager().supportsPushNotifications()).toBe(false);
  });

  it('returns true for iOS 17 standalone with PushManager and serviceWorker', () => {
    setUserAgent(IPHONE_UA);
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });
    expect(getIOSNotificationManager().supportsPushNotifications()).toBe(true);
  });

  it('returns false for iOS 17 not standalone', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().supportsPushNotifications()).toBe(false);
  });
});

// ─── supportsBadging ──────────────────────────────────────────────────────────

describe('supportsBadging', () => {
  it('always returns false on iOS', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().supportsBadging()).toBe(false);
  });

  it('returns false even on non-iOS', () => {
    setUserAgent(ANDROID_UA);
    expect(getIOSNotificationManager().supportsBadging()).toBe(false);
  });
});

// ─── getNotificationCapabilities ─────────────────────────────────────────────

describe('getNotificationCapabilities', () => {
  it('returns full capabilities for non-iOS device', () => {
    setUserAgent(ANDROID_UA);
    const caps = getIOSNotificationManager().getNotificationCapabilities();
    expect(caps.canReceivePushNotifications).toBe(true);
    expect(caps.canShowBadge).toBe(true);
    expect(caps.needsHomeScreenInstall).toBe(false);
    expect(caps.recommendedFallback).toBe('none');
  });

  it('returns in-app fallback for iOS < 16', () => {
    setUserAgent(IOS_OLD_UA);
    const caps = getIOSNotificationManager().getNotificationCapabilities();
    expect(caps.canReceivePushNotifications).toBe(false);
    expect(caps.recommendedFallback).toBe('in-app');
    expect(caps.needsHomeScreenInstall).toBe(false);
  });

  it('requires home screen install for iOS 16+ not standalone', () => {
    setUserAgent(IPHONE_UA);
    const caps = getIOSNotificationManager().getNotificationCapabilities();
    expect(caps.canReceivePushNotifications).toBe(false);
    expect(caps.needsHomeScreenInstall).toBe(true);
    expect(caps.recommendedFallback).toBe('in-app');
  });

  it('returns push support for iOS 16+ standalone', () => {
    setUserAgent(IPHONE_UA);
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });
    const caps = getIOSNotificationManager().getNotificationCapabilities();
    expect(caps.canReceivePushNotifications).toBe(true);
    expect(caps.canShowBadge).toBe(false);
    expect(caps.needsHomeScreenInstall).toBe(false);
  });
});

// ─── shouldShowInstallPrompt ──────────────────────────────────────────────────

describe('shouldShowInstallPrompt', () => {
  it('returns false for non-iOS', () => {
    setUserAgent(ANDROID_UA);
    expect(getIOSNotificationManager().shouldShowInstallPrompt()).toBe(false);
  });

  it('returns true for iOS 16+ not standalone', () => {
    setUserAgent(IPHONE_UA);
    expect(getIOSNotificationManager().shouldShowInstallPrompt()).toBe(true);
  });

  it('returns false for iOS 16+ standalone', () => {
    setUserAgent(IPHONE_UA);
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });
    expect(getIOSNotificationManager().shouldShowInstallPrompt()).toBe(false);
  });

  it('returns false for iOS < 16', () => {
    setUserAgent(IOS_OLD_UA);
    expect(getIOSNotificationManager().shouldShowInstallPrompt()).toBe(false);
  });
});

// ─── getInstallInstructions ───────────────────────────────────────────────────

describe('getInstallInstructions', () => {
  it('returns Safari-specific instructions when on Safari', () => {
    setUserAgent(IPHONE_UA);
    const instructions = getIOSNotificationManager().getInstallInstructions();
    expect(instructions[0]).toContain('Share button');
    expect(instructions.some(s => s.includes('Add to Home Screen'))).toBe(true);
  });

  it('returns instructions to open in Safari when not on Safari', () => {
    setUserAgent(CHROME_IOS_UA);
    const instructions = getIOSNotificationManager().getInstallInstructions();
    expect(instructions[0]).toContain('Safari');
  });
});

// ─── getUserMessage ───────────────────────────────────────────────────────────

describe('getUserMessage', () => {
  it('recommends Home Screen install for iOS 16+ not standalone', () => {
    setUserAgent(IPHONE_UA);
    const msg = getIOSNotificationManager().getUserMessage();
    expect(msg).toContain('Home Screen');
  });

  it('mentions in-app for older iOS', () => {
    setUserAgent(IOS_OLD_UA);
    const msg = getIOSNotificationManager().getUserMessage();
    expect(msg).toContain('in-app');
  });

  it('positive message for iOS 16+ standalone', () => {
    setUserAgent(IPHONE_UA);
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });
    const msg = getIOSNotificationManager().getUserMessage();
    expect(msg).toContain('available');
  });
});

// ─── recordInstallDismissal / wasInstallPromptRecentlyDismissed ───────────────

describe('recordInstallDismissal / wasInstallPromptRecentlyDismissed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('wasInstallPromptRecentlyDismissed returns false with no stored value', () => {
    expect(getIOSNotificationManager().wasInstallPromptRecentlyDismissed()).toBe(false);
  });

  it('recordInstallDismissal stores timestamp and wasInstallPromptRecentlyDismissed returns true', () => {
    const mgr = getIOSNotificationManager();
    mgr.recordInstallDismissal();
    expect(mgr.wasInstallPromptRecentlyDismissed(7)).toBe(true);
  });

  it('wasInstallPromptRecentlyDismissed returns false after daysSince have passed', () => {
    const oldTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem('ios_install_prompt_dismissed', oldTimestamp.toString());
    expect(getIOSNotificationManager().wasInstallPromptRecentlyDismissed(7)).toBe(false);
  });
});

// ─── getDebugReport ───────────────────────────────────────────────────────────

describe('getDebugReport', () => {
  it('returns a non-empty string', () => {
    setUserAgent(IPHONE_UA);
    const report = getIOSNotificationManager().getDebugReport();
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('contains iOS version info', () => {
    setUserAgent(IPHONE_UA);
    const report = getIOSNotificationManager().getDebugReport();
    expect(report).toContain('17');
  });
});

// ─── iosNotifications facade ──────────────────────────────────────────────────

describe('iosNotifications facade', () => {
  it('isIOS delegates to manager', () => {
    setUserAgent(IPHONE_UA);
    expect(iosNotifications.isIOS()).toBe(true);
  });

  it('supportsBadging always returns false on iOS', () => {
    setUserAgent(IPHONE_UA);
    expect(iosNotifications.supportsBadging()).toBe(false);
  });

  it('getCapabilities returns capabilities object', () => {
    setUserAgent(ANDROID_UA);
    const caps = iosNotifications.getCapabilities();
    expect(caps).toHaveProperty('canReceivePushNotifications');
    expect(caps).toHaveProperty('canShowBadge');
  });
});
