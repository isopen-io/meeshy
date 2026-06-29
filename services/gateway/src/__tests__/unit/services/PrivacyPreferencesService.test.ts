/**
 * PrivacyPreferencesService Unit Tests
 *
 * Covers:
 * - getDefaultPreferences(): returns PRIVACY_PREFERENCES_DEFAULTS values
 * - getPreferences(): anonymous → defaults, cache hit, DB fetch + cache set
 * - fetchFromDatabase(): stored values override defaults, missing → defaults, error → defaults
 * - getBooleanValue(): 'true'/'false' strings, missing key uses default
 * - invalidateCache(): removes specific entry
 * - clearCache(): empties entire cache
 * - shutdown(): clears interval + cache
 * - shouldShow*(): delegate to getPreferences
 * - getPreferencesForUsers(): parallel fetch, returns Map
 * - getMetrics(): returns cacheSize
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { PrivacyPreferencesService } from '../../../services/PrivacyPreferencesService';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../../config/user-preferences-defaults';

function makePrisma(rows: { key: string; value: string }[] = []) {
  return {
    userPreference: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  } as any;
}

describe('PrivacyPreferencesService', () => {
  let svc: PrivacyPreferencesService;
  const userId = 'user_001';

  afterEach(() => {
    svc.shutdown();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getDefaultPreferences
  // ---------------------------------------------------------------------------
  describe('getDefaultPreferences', () => {
    it('returns values matching PRIVACY_PREFERENCES_DEFAULTS', () => {
      svc = new PrivacyPreferencesService(makePrisma());
      const defaults = svc.getDefaultPreferences();

      expect(defaults).toEqual({
        showOnlineStatus: PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus,
        showLastSeen: PRIVACY_PREFERENCES_DEFAULTS.showLastSeen,
        showReadReceipts: PRIVACY_PREFERENCES_DEFAULTS.showReadReceipts,
        showTypingIndicator: PRIVACY_PREFERENCES_DEFAULTS.showTypingIndicator,
        allowContactRequests: PRIVACY_PREFERENCES_DEFAULTS.allowContactRequests,
        allowGroupInvites: PRIVACY_PREFERENCES_DEFAULTS.allowGroupInvites,
        saveMediaToGallery: PRIVACY_PREFERENCES_DEFAULTS.saveMediaToGallery,
        allowAnalytics: PRIVACY_PREFERENCES_DEFAULTS.allowAnalytics,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getPreferences — anonymous
  // ---------------------------------------------------------------------------
  describe('getPreferences — anonymous users', () => {
    it('returns defaults without DB call for anonymous user', async () => {
      const prisma = makePrisma();
      svc = new PrivacyPreferencesService(prisma);

      const prefs = await svc.getPreferences(userId, true);

      expect(prefs).toEqual(svc.getDefaultPreferences());
      expect(prisma.userPreference.findMany).not.toHaveBeenCalled();
    });

    it('defaults to isAnonymous=false when not specified', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences(userId);

      expect(prisma.userPreference.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getPreferences — DB fetch + cache
  // ---------------------------------------------------------------------------
  describe('getPreferences — DB fetch and caching', () => {
    it('fetches from DB when no cache entry exists', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences(userId);

      expect(prisma.userPreference.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          key: { in: expect.arrayContaining(['show-online-status', 'show-last-seen']) },
        },
      });
    });

    it('uses cached result on second call without hitting DB again', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences(userId);
      await svc.getPreferences(userId);

      expect(prisma.userPreference.findMany).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after cache expires', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      // Manually inject a stale cache entry
      (svc as any).cache.set(userId, {
        preferences: svc.getDefaultPreferences(),
        fetchedAt: Date.now() - (6 * 60 * 1000), // 6 min ago, past 5-min TTL
      });

      await svc.getPreferences(userId);

      expect(prisma.userPreference.findMany).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch when cache entry is fresh', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      // Inject fresh cache entry
      (svc as any).cache.set(userId, {
        preferences: svc.getDefaultPreferences(),
        fetchedAt: Date.now() - 1000, // 1 second ago, within TTL
      });

      await svc.getPreferences(userId);

      expect(prisma.userPreference.findMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // fetchFromDatabase — stored values
  // ---------------------------------------------------------------------------
  describe('stored DB values override defaults', () => {
    it('uses stored "true" string as true', async () => {
      const prisma = makePrisma([{ key: 'save-media-to-gallery', value: 'true' }]);
      svc = new PrivacyPreferencesService(prisma);

      const prefs = await svc.getPreferences(userId);

      // Default is false; stored value overrides to true
      expect(prefs.saveMediaToGallery).toBe(true);
    });

    it('uses stored "false" string as false', async () => {
      const prisma = makePrisma([{ key: 'show-online-status', value: 'false' }]);
      svc = new PrivacyPreferencesService(prisma);

      const prefs = await svc.getPreferences(userId);

      // Default is true; stored value overrides to false
      expect(prefs.showOnlineStatus).toBe(false);
    });

    it('uses default when key is not stored', async () => {
      const prisma = makePrisma([]); // no stored preferences
      svc = new PrivacyPreferencesService(prisma);

      const prefs = await svc.getPreferences(userId);

      expect(prefs).toEqual(svc.getDefaultPreferences());
    });

    it('applies stored values for multiple keys simultaneously', async () => {
      const prisma = makePrisma([
        { key: 'show-online-status', value: 'false' },
        { key: 'allow-analytics', value: 'false' },
        { key: 'save-media-to-gallery', value: 'true' },
      ]);
      svc = new PrivacyPreferencesService(prisma);

      const prefs = await svc.getPreferences(userId);

      expect(prefs.showOnlineStatus).toBe(false);
      expect(prefs.allowAnalytics).toBe(false);
      expect(prefs.saveMediaToGallery).toBe(true);
      // Untouched keys retain defaults
      expect(prefs.showLastSeen).toBe(PRIVACY_PREFERENCES_DEFAULTS.showLastSeen);
    });

    it('returns defaults gracefully when DB throws', async () => {
      const prisma = {
        userPreference: {
          findMany: jest.fn().mockRejectedValue(new Error('DB connection lost')),
        },
      } as any;
      svc = new PrivacyPreferencesService(prisma);

      const prefs = await svc.getPreferences(userId);

      expect(prefs).toEqual(svc.getDefaultPreferences());
    });
  });

  // ---------------------------------------------------------------------------
  // invalidateCache / clearCache
  // ---------------------------------------------------------------------------
  describe('cache management', () => {
    it('invalidateCache removes the entry for that user', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences(userId);
      expect(prisma.userPreference.findMany).toHaveBeenCalledTimes(1);

      svc.invalidateCache(userId);

      await svc.getPreferences(userId);
      expect(prisma.userPreference.findMany).toHaveBeenCalledTimes(2);
    });

    it('invalidateCache on non-existent userId is a no-op', () => {
      svc = new PrivacyPreferencesService(makePrisma());
      expect(() => svc.invalidateCache('unknown_user')).not.toThrow();
    });

    it('clearCache empties all entries', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences('user_A');
      await svc.getPreferences('user_B');
      expect((svc as any).cache.size).toBe(2);

      svc.clearCache();
      expect((svc as any).cache.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // cleanupCache (called by the interval)
  // ---------------------------------------------------------------------------
  describe('cleanupCache', () => {
    it('removes expired entries and keeps fresh ones', () => {
      svc = new PrivacyPreferencesService(makePrisma());

      const now = Date.now();
      (svc as any).cache.set('stale_user', {
        preferences: svc.getDefaultPreferences(),
        fetchedAt: now - 6 * 60 * 1000, // expired
      });
      (svc as any).cache.set('fresh_user', {
        preferences: svc.getDefaultPreferences(),
        fetchedAt: now - 60 * 1000, // fresh
      });

      (svc as any).cleanupCache();

      expect((svc as any).cache.has('stale_user')).toBe(false);
      expect((svc as any).cache.has('fresh_user')).toBe(true);
    });

    it('cleanupCache with no entries does not throw', () => {
      svc = new PrivacyPreferencesService(makePrisma());
      expect(() => (svc as any).cleanupCache()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // shutdown
  // ---------------------------------------------------------------------------
  describe('shutdown', () => {
    it('clears interval and cache on shutdown', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences(userId);
      expect((svc as any).cache.size).toBe(1);

      svc.shutdown();

      expect((svc as any).cache.size).toBe(0);
      expect((svc as any).cleanupInterval).toBeNull();
    });

    it('calling shutdown twice does not throw', () => {
      svc = new PrivacyPreferencesService(makePrisma());
      svc.shutdown();
      expect(() => svc.shutdown()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // shouldShow* quick accessors
  // ---------------------------------------------------------------------------
  describe('shouldShow* quick accessors', () => {
    it('shouldShowOnlineStatus returns showOnlineStatus from preferences', async () => {
      const prisma = makePrisma([{ key: 'show-online-status', value: 'false' }]);
      svc = new PrivacyPreferencesService(prisma);

      expect(await svc.shouldShowOnlineStatus(userId)).toBe(false);
    });

    it('shouldShowLastSeen returns showLastSeen from preferences', async () => {
      const prisma = makePrisma([{ key: 'show-last-seen', value: 'false' }]);
      svc = new PrivacyPreferencesService(prisma);

      expect(await svc.shouldShowLastSeen(userId)).toBe(false);
    });

    it('shouldShowReadReceipts returns showReadReceipts', async () => {
      const prisma = makePrisma([{ key: 'show-read-receipts', value: 'false' }]);
      svc = new PrivacyPreferencesService(prisma);

      expect(await svc.shouldShowReadReceipts(userId)).toBe(false);
    });

    it('shouldShowTypingIndicator returns showTypingIndicator', async () => {
      const prisma = makePrisma([{ key: 'show-typing-indicator', value: 'false' }]);
      svc = new PrivacyPreferencesService(prisma);

      expect(await svc.shouldShowTypingIndicator(userId)).toBe(false);
    });

    it('quick accessors respect isAnonymous=true', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      // For anonymous users, always returns defaults without DB call
      const result = await svc.shouldShowOnlineStatus('anon_user', true);
      expect(result).toBe(PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus);
      expect(prisma.userPreference.findMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getPreferencesForUsers
  // ---------------------------------------------------------------------------
  describe('getPreferencesForUsers', () => {
    it('returns a Map with preferences for each user', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      const result = await svc.getPreferencesForUsers([
        { id: 'userA', isAnonymous: false },
        { id: 'userB', isAnonymous: true },
      ]);

      expect(result).toBeInstanceOf(Map);
      expect(result.has('userA')).toBe(true);
      expect(result.has('userB')).toBe(true);
    });

    it('anonymous entries use defaults without DB call', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferencesForUsers([
        { id: 'anon_1', isAnonymous: true },
        { id: 'anon_2', isAnonymous: true },
      ]);

      expect(prisma.userPreference.findMany).not.toHaveBeenCalled();
    });

    it('returns empty Map for empty input', async () => {
      svc = new PrivacyPreferencesService(makePrisma());
      const result = await svc.getPreferencesForUsers([]);
      expect(result.size).toBe(0);
    });

    it('fetches registered users from DB in parallel', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferencesForUsers([
        { id: 'reg_A', isAnonymous: false },
        { id: 'reg_B', isAnonymous: false },
      ]);

      // Both users required a DB call
      expect(prisma.userPreference.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getMetrics
  // ---------------------------------------------------------------------------
  describe('getMetrics', () => {
    it('returns cacheSize equal to number of cached users', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences('user_x');
      await svc.getPreferences('user_y');

      const metrics = svc.getMetrics();
      expect(metrics.cacheSize).toBe(2);
    });

    it('returns cacheSize 0 after clearCache', async () => {
      const prisma = makePrisma([]);
      svc = new PrivacyPreferencesService(prisma);

      await svc.getPreferences('user_z');
      svc.clearCache();

      expect(svc.getMetrics().cacheSize).toBe(0);
    });
  });
});
