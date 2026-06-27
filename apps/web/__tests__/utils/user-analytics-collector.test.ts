/**
 * Tests for utils/user-analytics-collector.ts
 */

const mockCollectErrorContext = jest.fn();
jest.mock('@/utils/error-context-collector', () => ({
  collectErrorContext: (...args: unknown[]) => mockCollectErrorContext(...args),
}));

import {
  isProbablyFromAfrica,
  hasSlowConnection,
  collectUserContext,
  trackEvent,
  trackClick,
  trackInteraction,
  trackConversion,
  profileUser,
  generateUserDiagnosticReport,
} from '@/utils/user-analytics-collector';
import type { UserAnalyticsContext } from '@/utils/user-analytics-collector';

const makeContext = (overrides: Partial<UserAnalyticsContext> = {}): UserAnalyticsContext => ({
  timestamp: '2026-06-27T00:00:00.000Z',
  url: 'http://localhost:3100/',
  userAgent: 'Mozilla/5.0',
  device: {
    type: 'desktop',
    os: 'Linux',
    osVersion: '6.18',
    browser: 'Chrome',
    browserVersion: '126',
    isTouchDevice: false,
    screenWidth: 1920,
    screenHeight: 1080,
  },
  location: {
    timezone: 'Europe/Paris',
    locale: 'fr-FR',
    language: 'fr',
    country: undefined,
  },
  network: {
    online: true,
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  },
  screen: {
    width: 1920,
    height: 1080,
    pixelRatio: 1,
    orientation: 'landscape',
  },
  preferences: {
    theme: 'light',
    language: 'fr',
    cookiesEnabled: true,
    storageAvailable: {
      localStorage: true,
      sessionStorage: true,
      indexedDB: true,
    },
    doNotTrack: false,
    reducedMotion: false,
  },
  performance: {},
  ...overrides,
} as UserAnalyticsContext);

const makeContextWithBase = (
  locationOverrides: Partial<UserAnalyticsContext['location']> = {},
  networkOverrides: Partial<UserAnalyticsContext['network']> = {}
): UserAnalyticsContext =>
  makeContext({
    location: { ...makeContext().location, ...locationOverrides },
    network: { ...makeContext().network, ...networkOverrides },
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockCollectErrorContext.mockReturnValue({
    message: 'Analytics context',
    stack: '',
    digest: '',
    ...makeContext(),
  });
});

// ─── isProbablyFromAfrica ─────────────────────────────────────────────────────

describe('isProbablyFromAfrica', () => {
  it('returns true for Africa/Lagos', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'Africa/Lagos' }))).toBe(true);
  });

  it('returns true for Africa/Cairo', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'Africa/Cairo' }))).toBe(true);
  });

  it('returns true for Africa/Johannesburg', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'Africa/Johannesburg' }))).toBe(true);
  });

  it('returns true for Africa/Nairobi', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'Africa/Nairobi' }))).toBe(true);
  });

  it('returns true for Africa/Casablanca', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'Africa/Casablanca' }))).toBe(true);
  });

  it('returns false for Europe/Paris', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'Europe/Paris' }))).toBe(false);
  });

  it('returns false for America/New_York', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'America/New_York' }))).toBe(false);
  });

  it('returns false for Asia/Tokyo', () => {
    expect(isProbablyFromAfrica(makeContextWithBase({ timezone: 'Asia/Tokyo' }))).toBe(false);
  });
});

// ─── hasSlowConnection ────────────────────────────────────────────────────────

describe('hasSlowConnection', () => {
  it('returns true for slow-2g', () => {
    expect(hasSlowConnection(makeContextWithBase({}, { effectiveType: 'slow-2g' }))).toBe(true);
  });

  it('returns true for 2g', () => {
    expect(hasSlowConnection(makeContextWithBase({}, { effectiveType: '2g' }))).toBe(true);
  });

  it('returns true for 3g', () => {
    expect(hasSlowConnection(makeContextWithBase({}, { effectiveType: '3g' }))).toBe(true);
  });

  it('returns false for 4g', () => {
    expect(hasSlowConnection(makeContextWithBase({}, { effectiveType: '4g' }))).toBe(false);
  });

  it('returns false when effectiveType is undefined', () => {
    expect(hasSlowConnection(makeContextWithBase({}, { effectiveType: undefined }))).toBe(false);
  });
});

// ─── collectUserContext ───────────────────────────────────────────────────────

describe('collectUserContext', () => {
  it('returns context without error fields', async () => {
    const context = await collectUserContext();
    expect(context).not.toHaveProperty('message');
    expect(context).not.toHaveProperty('stack');
    expect(context).not.toHaveProperty('digest');
  });

  it('includes location from error context', async () => {
    const context = await collectUserContext();
    expect(context.location).toBeDefined();
  });
});

// ─── trackEvent ───────────────────────────────────────────────────────────────

describe('trackEvent', () => {
  it('does not throw on success', async () => {
    await expect(trackEvent('click', 'button_click')).resolves.toBeUndefined();
  });

  it('does not throw when collectUserContext fails', async () => {
    mockCollectErrorContext.mockImplementation(() => { throw new Error('context failed'); });
    await expect(trackEvent('custom', 'test')).resolves.toBeUndefined();
  });

  it('passes eventData through', async () => {
    // No assertion possible without a spy, but it should not throw
    await expect(trackEvent('interaction', 'test', { key: 'value' })).resolves.toBeUndefined();
  });
});

// ─── trackClick ──────────────────────────────────────────────────────────────

describe('trackClick', () => {
  it('does not throw', async () => {
    await expect(trackClick('btn-submit', 'button')).resolves.toBeUndefined();
  });
});

// ─── trackInteraction ─────────────────────────────────────────────────────────

describe('trackInteraction', () => {
  it('does not throw', async () => {
    await expect(trackInteraction('scroll', { direction: 'down' })).resolves.toBeUndefined();
  });
});

// ─── trackConversion ──────────────────────────────────────────────────────────

describe('trackConversion', () => {
  it('does not throw', async () => {
    await expect(trackConversion('signup', 1)).resolves.toBeUndefined();
  });
});

// ─── profileUser ──────────────────────────────────────────────────────────────

describe('profileUser', () => {
  it('returns user context', async () => {
    const ctx = await profileUser('user-1');
    expect(ctx).not.toHaveProperty('message');
    expect(ctx.location).toBeDefined();
  });
});

// ─── generateUserDiagnosticReport ────────────────────────────────────────────

describe('generateUserDiagnosticReport', () => {
  it('returns a non-empty string', async () => {
    const report = await generateUserDiagnosticReport();
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('includes diagnostic header', async () => {
    const report = await generateUserDiagnosticReport();
    expect(report).toContain('RAPPORT DE DIAGNOSTIC UTILISATEUR');
  });

  it('includes timezone in report', async () => {
    const report = await generateUserDiagnosticReport();
    expect(report).toContain('Europe/Paris');
  });
});
