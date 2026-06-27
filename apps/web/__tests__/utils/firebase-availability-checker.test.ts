/**
 * Tests for utils/firebase-availability-checker.ts
 */

const mockInitializeApp = jest.fn();
const mockGetApps = jest.fn(() => []);
jest.mock('firebase/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
}));

import { FirebaseAvailabilityChecker } from '@/utils/firebase-availability-checker';

// Use the class directly (not the singleton) so each test gets a fresh instance
const makeChecker = () => new (FirebaseAvailabilityChecker as any)();

// Helper to set env vars
const setEnv = (overrides: Record<string, string | undefined>) => {
  const restore: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    restore[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of Object.entries(restore)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
};

const VALID_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'api-key-123',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'project-123',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender-123',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'app-123',
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'vapid-123',
  NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: 'true',
  NEXT_PUBLIC_ENABLE_PWA_BADGES: 'true',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApps.mockReturnValue([]);
});

// ─── getStatus before check ───────────────────────────────────────────────────

describe('getStatus before check', () => {
  it('returns available=false before check', () => {
    const checker = makeChecker();
    expect(checker.getStatus().available).toBe(false);
  });

  it('returns pushEnabled=false before check', () => {
    const checker = makeChecker();
    expect(checker.getStatus().pushEnabled).toBe(false);
  });

  it('returns badgeEnabled=false before check', () => {
    const checker = makeChecker();
    expect(checker.getStatus().badgeEnabled).toBe(false);
  });

  it('returns reason=Not checked yet before check', () => {
    const checker = makeChecker();
    expect(checker.getStatus().reason).toBe('Not checked yet');
  });
});

// ─── isAvailable / isPushEnabled / isBadgeEnabled before check ───────────────

describe('boolean accessors before check', () => {
  it('isAvailable() returns false before check', () => {
    const checker = makeChecker();
    expect(checker.isAvailable()).toBe(false);
  });

  it('isPushEnabled() returns false before check', () => {
    const checker = makeChecker();
    expect(checker.isPushEnabled()).toBe(false);
  });

  it('isBadgeEnabled() returns false before check', () => {
    const checker = makeChecker();
    expect(checker.isBadgeEnabled()).toBe(false);
  });
});

// ─── check — missing env vars ────────────────────────────────────────────────

describe('check — missing env vars', () => {
  it('returns available=false when API key is missing', async () => {
    const restore = setEnv({ NEXT_PUBLIC_FIREBASE_API_KEY: undefined });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.available).toBe(false);
    } finally {
      restore();
    }
  });

  it('includes missing key name in reason', async () => {
    const restore = setEnv({ NEXT_PUBLIC_FIREBASE_API_KEY: undefined });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.reason).toContain('NEXT_PUBLIC_FIREBASE_API_KEY');
    } finally {
      restore();
    }
  });

  it('returns available=false when VAPID key contains xxxxx (placeholder)', async () => {
    const restore = setEnv({ ...VALID_ENV, NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'xxxxx' });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.available).toBe(false);
    } finally {
      restore();
    }
  });

  it('returns available=false when value is string "undefined"', async () => {
    const restore = setEnv({ ...VALID_ENV, NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'undefined' });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.available).toBe(false);
    } finally {
      restore();
    }
  });
});

// ─── check — firebase init success ───────────────────────────────────────────

describe('check — firebase init success', () => {
  it('returns available=true when all env vars set and init succeeds', async () => {
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.available).toBe(true);
    } finally {
      restore();
    }
  });

  it('returns pushEnabled=true when flag is "true"', async () => {
    const restore = setEnv({ ...VALID_ENV, NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: 'true' });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.pushEnabled).toBe(true);
    } finally {
      restore();
    }
  });

  it('returns pushEnabled=false when flag is not "true"', async () => {
    const restore = setEnv({ ...VALID_ENV, NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: 'false' });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.pushEnabled).toBe(false);
    } finally {
      restore();
    }
  });

  it('returns badgeEnabled=true when ENABLE_PWA_BADGES is not "false"', async () => {
    const restore = setEnv({ ...VALID_ENV, NEXT_PUBLIC_ENABLE_PWA_BADGES: 'true' });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.badgeEnabled).toBe(true);
    } finally {
      restore();
    }
  });

  it('returns badgeEnabled=false when ENABLE_PWA_BADGES is "false"', async () => {
    const restore = setEnv({ ...VALID_ENV, NEXT_PUBLIC_ENABLE_PWA_BADGES: 'false' });
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.badgeEnabled).toBe(false);
    } finally {
      restore();
    }
  });

  it('calls initializeApp when no existing apps', async () => {
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      await checker.check();
      expect(mockInitializeApp).toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('does NOT call initializeApp when apps already exist', async () => {
    mockGetApps.mockReturnValue([{ name: 'existing' }]);
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      await checker.check();
      expect(mockInitializeApp).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

// ─── check — firebase init error ─────────────────────────────────────────────

describe('check — firebase init error', () => {
  it('handles duplicate-app error as available=true', async () => {
    mockInitializeApp.mockImplementation(() => {
      const err: any = new Error('Firebase app already exists');
      err.code = 'app/duplicate-app';
      throw err;
    });
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.available).toBe(true);
    } finally {
      restore();
    }
  });

  it('returns available=false on unexpected init error', async () => {
    mockInitializeApp.mockImplementation(() => {
      throw new Error('unexpected firebase error');
    });
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.available).toBe(false);
    } finally {
      restore();
    }
  });

  it('includes error message in reason on unexpected error', async () => {
    mockInitializeApp.mockImplementation(() => {
      throw new Error('bad credentials');
    });
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      const status = await checker.check();
      expect(status.reason).toContain('bad credentials');
    } finally {
      restore();
    }
  });
});

// ─── check — caching (checked once) ──────────────────────────────────────────

describe('check — caching', () => {
  it('returns same status on second call without reinitializing', async () => {
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      const first = await checker.check();
      const second = await checker.check();
      expect(second).toBe(first);
      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('resets checked flag so check runs again', async () => {
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      await checker.check();
      checker.reset();
      await checker.check();
      expect(mockInitializeApp).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });

  it('resets status to unavailable', () => {
    const checker = makeChecker();
    checker.reset();
    expect(checker.isAvailable()).toBe(false);
  });
});

// ─── getDebugReport ───────────────────────────────────────────────────────────

describe('getDebugReport', () => {
  it('includes status and environment fields', () => {
    const checker = makeChecker();
    const report = checker.getDebugReport();
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('environment');
  });

  it('environment shows Set/Missing for keys', async () => {
    const restore = setEnv(VALID_ENV);
    try {
      const checker = makeChecker();
      await checker.check();
      const report = checker.getDebugReport();
      expect(report.environment.FIREBASE_API_KEY).toBe('Set');
    } finally {
      restore();
    }
  });
});
