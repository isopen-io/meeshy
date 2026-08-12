/**
 * Unit tests for PrivacyPreferencesService
 * Covers: anonymous user defaults, DB fetch with stored values,
 * cache hit (no second DB call), TTL expiry invalidates cache,
 * cache invalidation/clear, fallback-to-defaults on DB error,
 * quick-access helpers (shouldShowOnlineStatus etc.),
 * getPreferencesForUsers batch, getMetrics, and shutdown.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { PrivacyPreferencesService } from '../../../services/PrivacyPreferencesService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../../config/user-preferences-defaults';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeStoredPrefs(overrides: Array<{ key: string; value: string }> = []) {
  return overrides;
}

function makePrisma(storedPrefs: Array<{ key: string; value: string }> = []) {
  return {
    userPreference: {
      findMany: jest.fn<any>().mockResolvedValue(storedPrefs),
    },
  } as unknown as PrismaClient;
}

function makeSut(prisma?: PrismaClient) {
  return new PrivacyPreferencesService(prisma ?? makePrisma());
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PrivacyPreferencesService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── Anonymous users ──────────────────────────────────────────────────────

  describe('anonymous users', () => {
    it('returns default preferences without querying the DB', async () => {
      const prisma = makePrisma();
      const sut = makeSut(prisma);

      const prefs = await sut.getPreferences('anon-id', true);

      expect(prefs).toEqual(sut.getDefaultPreferences());
      expect((prisma.userPreference.findMany as jest.Mock<any>)).not.toHaveBeenCalled();
    });
  });

  // ── getDefaultPreferences ────────────────────────────────────────────────

  describe('getDefaultPreferences', () => {
    it('matches the PRIVACY_PREFERENCES_DEFAULTS constants', () => {
      const sut = makeSut();

      const prefs = sut.getDefaultPreferences();

      expect(prefs.showOnlineStatus).toBe(PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus);
      expect(prefs.saveMediaToGallery).toBe(PRIVACY_PREFERENCES_DEFAULTS.saveMediaToGallery);
      expect(prefs.allowAnalytics).toBe(PRIVACY_PREFERENCES_DEFAULTS.allowAnalytics);
    });
  });

  // ── DB fetch ─────────────────────────────────────────────────────────────

  describe('getPreferences — DB fetch', () => {
    it('fetches from DB and returns defaults when no stored preferences', async () => {
      const sut = makeSut(makePrisma([]));

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.showOnlineStatus).toBe(true);
      expect(prefs.saveMediaToGallery).toBe(false);
    });

    it('uses stored value when available (show-online-status = false)', async () => {
      const sut = makeSut(makePrisma([{ key: 'show-online-status', value: 'false' }]));

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.showOnlineStatus).toBe(false);
    });

    it('uses stored value true for save-media-to-gallery', async () => {
      const sut = makeSut(makePrisma([{ key: 'save-media-to-gallery', value: 'true' }]));

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.saveMediaToGallery).toBe(true);
    });

    it('falls back to defaults on DB error', async () => {
      const prisma = {
        userPreference: {
          findMany: jest.fn<any>().mockRejectedValue(new Error('db error')),
        },
      } as unknown as PrismaClient;
      const sut = makeSut(prisma);

      const prefs = await sut.getPreferences('user-1');

      expect(prefs).toEqual(sut.getDefaultPreferences());
    });
  });

  // ── Caching ──────────────────────────────────────────────────────────────

  describe('cache behavior', () => {
    it('second call returns cached result without hitting DB again', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      await sut.getPreferences('user-1');
      await sut.getPreferences('user-1');

      expect((prisma.userPreference.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(1);
    });

    it('expired cache (> 5 min) triggers a new DB fetch', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      await sut.getPreferences('user-1');
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      await sut.getPreferences('user-1');

      expect((prisma.userPreference.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(2);
    });

    it('invalidateCache forces next call to re-fetch', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      await sut.getPreferences('user-1');
      sut.invalidateCache('user-1');
      await sut.getPreferences('user-1');

      expect((prisma.userPreference.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(2);
    });

    it('clearCache forces all users to re-fetch', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      await sut.getPreferences('user-1');
      await sut.getPreferences('user-2');
      sut.clearCache();
      await sut.getPreferences('user-1');
      await sut.getPreferences('user-2');

      expect((prisma.userPreference.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(4);
    });
  });

  // ── Cleanup interval ─────────────────────────────────────────────────────

  describe('cache cleanup interval', () => {
    it('removes expired entries on cleanup tick (10 min interval)', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      await sut.getPreferences('user-1');
      expect(sut.getMetrics().cacheSize).toBe(1);

      // Let entry expire
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      // Trigger cleanup interval (10 min)
      jest.advanceTimersByTime(10 * 60 * 1000);

      expect(sut.getMetrics().cacheSize).toBe(0);
    });
  });

  // ── Quick-access helpers ─────────────────────────────────────────────────

  describe('quick-access helpers', () => {
    it('shouldShowOnlineStatus returns stored value', async () => {
      const sut = makeSut(makePrisma([{ key: 'show-online-status', value: 'false' }]));

      expect(await sut.shouldShowOnlineStatus('u1')).toBe(false);
    });

    it('shouldShowLastSeen returns default (true) when not stored', async () => {
      const sut = makeSut(makePrisma([]));

      expect(await sut.shouldShowLastSeen('u1')).toBe(true);
    });

    it('shouldShowReadReceipts returns stored value', async () => {
      const sut = makeSut(makePrisma([{ key: 'show-read-receipts', value: 'false' }]));

      expect(await sut.shouldShowReadReceipts('u1')).toBe(false);
    });

    it('shouldShowTypingIndicator returns stored value', async () => {
      const sut = makeSut(makePrisma([{ key: 'show-typing-indicator', value: 'false' }]));

      expect(await sut.shouldShowTypingIndicator('u1')).toBe(false);
    });

    it('anonymous user helpers return default values without DB call', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      expect(await sut.shouldShowOnlineStatus('anon', true)).toBe(true);
      expect((prisma.userPreference.findMany as jest.Mock<any>)).not.toHaveBeenCalled();
    });
  });

  // ── getPreferencesForUsers batch ─────────────────────────────────────────

  describe('getPreferencesForUsers', () => {
    it('returns a map keyed by userId', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      const result = await sut.getPreferencesForUsers([
        { id: 'u1', isAnonymous: false },
        { id: 'u2', isAnonymous: true },
      ]);

      expect(result.has('u1')).toBe(true);
      expect(result.has('u2')).toBe(true);
    });

    it('does not query DB for anonymous users in batch', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      await sut.getPreferencesForUsers([{ id: 'anon', isAnonymous: true }]);

      expect((prisma.userPreference.findMany as jest.Mock<any>)).not.toHaveBeenCalled();
    });
  });

  // ── getMetrics ───────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('reports cacheSize 0 initially', () => {
      expect(makeSut().getMetrics().cacheSize).toBe(0);
    });

    it('reports cacheSize equal to unique cached users', async () => {
      const sut = makeSut(makePrisma([]));
      await sut.getPreferences('u1');
      await sut.getPreferences('u2');

      expect(sut.getMetrics().cacheSize).toBe(2);
    });
  });

  // ── shutdown ─────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('clears cache and stops cleanup interval', async () => {
      const sut = makeSut(makePrisma([]));
      await sut.getPreferences('u1');
      expect(sut.getMetrics().cacheSize).toBe(1);

      sut.shutdown();

      expect(sut.getMetrics().cacheSize).toBe(0);
    });
  });
});
