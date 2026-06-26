import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PrivacyPreferencesService } from '../../../services/PrivacyPreferencesService';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../../config/user-preferences-defaults';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (matches service constant)

const buildMockPrisma = () => ({
  userPreference: { findMany: jest.fn() as jest.Mock<any> },
});

const storedPrefs = (overrides: Record<string, string> = {}) =>
  Object.entries({
    'show-online-status': 'true',
    'show-last-seen': 'true',
    'show-read-receipts': 'true',
    'show-typing-indicator': 'true',
    'allow-contact-requests': 'true',
    'allow-group-invites': 'true',
    'save-media-to-gallery': 'false',
    'allow-analytics': 'true',
    ...overrides,
  }).map(([key, value]) => ({ key, value }));

describe('PrivacyPreferencesService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let service: PrivacyPreferencesService;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPrisma = buildMockPrisma();
    service = new PrivacyPreferencesService(mockPrisma as any);
  });

  afterEach(() => {
    service.shutdown();
    jest.useRealTimers();
  });

  // ── getDefaultPreferences ─────────────────────────────────────────────────

  describe('getDefaultPreferences', () => {
    it('returns all values from PRIVACY_PREFERENCES_DEFAULTS', () => {
      const prefs = service.getDefaultPreferences();

      expect(prefs.showOnlineStatus).toBe(PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus);
      expect(prefs.showLastSeen).toBe(PRIVACY_PREFERENCES_DEFAULTS.showLastSeen);
      expect(prefs.showReadReceipts).toBe(PRIVACY_PREFERENCES_DEFAULTS.showReadReceipts);
      expect(prefs.showTypingIndicator).toBe(PRIVACY_PREFERENCES_DEFAULTS.showTypingIndicator);
      expect(prefs.allowContactRequests).toBe(PRIVACY_PREFERENCES_DEFAULTS.allowContactRequests);
      expect(prefs.allowGroupInvites).toBe(PRIVACY_PREFERENCES_DEFAULTS.allowGroupInvites);
      expect(prefs.saveMediaToGallery).toBe(PRIVACY_PREFERENCES_DEFAULTS.saveMediaToGallery);
      expect(prefs.allowAnalytics).toBe(PRIVACY_PREFERENCES_DEFAULTS.allowAnalytics);
    });

    it('has saveMediaToGallery=false as a privacy-safe default', () => {
      expect(service.getDefaultPreferences().saveMediaToGallery).toBe(false);
    });
  });

  // ── getPreferences ────────────────────────────────────────────────────────

  describe('getPreferences', () => {
    it('returns defaults for anonymous users without querying the DB', async () => {
      const prefs = await service.getPreferences('anon-session-token', true);

      expect(prefs).toEqual(service.getDefaultPreferences());
      expect(mockPrisma.userPreference.findMany).not.toHaveBeenCalled();
    });

    it('fetches from DB on cache miss and returns stored values', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(
        storedPrefs({ 'show-online-status': 'false' })
      );

      const prefs = await service.getPreferences('user-123');

      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(1);
      expect(prefs.showOnlineStatus).toBe(false);
      expect(prefs.showLastSeen).toBe(true);
    });

    it('returns cached result on second call without extra DB query', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-123');
      await service.getPreferences('user-123');

      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(1);
    });

    it('re-fetches from DB after cache TTL expires', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-123');
      jest.advanceTimersByTime(CACHE_TTL_MS + 1);
      await service.getPreferences('user-123');

      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(2);
    });

    it('does not re-fetch before TTL expires', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-123');
      jest.advanceTimersByTime(CACHE_TTL_MS - 1);
      await service.getPreferences('user-123');

      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns defaults when DB query throws an error', async () => {
      mockPrisma.userPreference.findMany.mockRejectedValue(new Error('DB connection failed'));

      const prefs = await service.getPreferences('user-123');

      expect(prefs).toEqual(service.getDefaultPreferences());
    });

    it('maps all "false" string values from DB to boolean false', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(
        storedPrefs({
          'show-online-status': 'false',
          'show-last-seen': 'false',
          'show-read-receipts': 'false',
          'show-typing-indicator': 'false',
          'allow-contact-requests': 'false',
          'allow-group-invites': 'false',
          'save-media-to-gallery': 'true',
          'allow-analytics': 'false',
        })
      );

      const prefs = await service.getPreferences('user-123');

      expect(prefs.showOnlineStatus).toBe(false);
      expect(prefs.showLastSeen).toBe(false);
      expect(prefs.showReadReceipts).toBe(false);
      expect(prefs.showTypingIndicator).toBe(false);
      expect(prefs.allowContactRequests).toBe(false);
      expect(prefs.allowGroupInvites).toBe(false);
      expect(prefs.saveMediaToGallery).toBe(true);
      expect(prefs.allowAnalytics).toBe(false);
    });

    it('uses PRIVACY_PREFERENCES_DEFAULTS for keys absent from DB', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue([
        { key: 'show-online-status', value: 'false' },
      ]);

      const prefs = await service.getPreferences('user-123');

      expect(prefs.showOnlineStatus).toBe(false); // stored value
      expect(prefs.showLastSeen).toBe(PRIVACY_PREFERENCES_DEFAULTS.showLastSeen); // default
      expect(prefs.saveMediaToGallery).toBe(PRIVACY_PREFERENCES_DEFAULTS.saveMediaToGallery); // default
    });

    it('caches independently per user', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-111');
      await service.getPreferences('user-222');
      await service.getPreferences('user-111');
      await service.getPreferences('user-222');

      // Each user fetched once
      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ── invalidateCache ───────────────────────────────────────────────────────

  describe('invalidateCache', () => {
    it('forces re-fetch for the invalidated user', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-123');
      service.invalidateCache('user-123');
      await service.getPreferences('user-123');

      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(2);
    });

    it('does not affect other cached users', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-111');
      await service.getPreferences('user-222');
      service.invalidateCache('user-111');
      await service.getPreferences('user-111');
      await service.getPreferences('user-222');

      // user-111: 2 fetches, user-222: 1 fetch
      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(3);
    });
  });

  // ── clearCache ────────────────────────────────────────────────────────────

  describe('clearCache', () => {
    it('forces re-fetch for all users after clear', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-111');
      await service.getPreferences('user-222');
      service.clearCache();
      await service.getPreferences('user-111');
      await service.getPreferences('user-222');

      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(4);
    });

    it('resets cache size to zero', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());
      await service.getPreferences('user-123');

      service.clearCache();

      expect(service.getMetrics().cacheSize).toBe(0);
    });
  });

  // ── convenience methods ───────────────────────────────────────────────────

  describe('shouldShowOnlineStatus', () => {
    it('returns stored boolean value', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(
        storedPrefs({ 'show-online-status': 'false' })
      );
      expect(await service.shouldShowOnlineStatus('user-123')).toBe(false);
    });

    it('returns default for anonymous users', async () => {
      expect(await service.shouldShowOnlineStatus('anon', true)).toBe(
        PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus
      );
    });
  });

  describe('shouldShowLastSeen', () => {
    it('returns stored boolean value', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(
        storedPrefs({ 'show-last-seen': 'false' })
      );
      expect(await service.shouldShowLastSeen('user-123')).toBe(false);
    });
  });

  describe('shouldShowReadReceipts', () => {
    it('returns stored boolean value', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(
        storedPrefs({ 'show-read-receipts': 'false' })
      );
      expect(await service.shouldShowReadReceipts('user-123')).toBe(false);
    });
  });

  describe('shouldShowTypingIndicator', () => {
    it('returns stored boolean value', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(
        storedPrefs({ 'show-typing-indicator': 'false' })
      );
      expect(await service.shouldShowTypingIndicator('user-123')).toBe(false);
    });
  });

  // ── getPreferencesForUsers ────────────────────────────────────────────────

  describe('getPreferencesForUsers', () => {
    it('returns a Map with preferences for each user ID', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      const result = await service.getPreferencesForUsers([
        { id: 'user-1', isAnonymous: false },
        { id: 'user-2', isAnonymous: false },
      ]);

      expect(result.size).toBe(2);
      expect(result.has('user-1')).toBe(true);
      expect(result.has('user-2')).toBe(true);
    });

    it('anonymous entries receive defaults without DB call', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      const result = await service.getPreferencesForUsers([
        { id: 'anon-session', isAnonymous: true },
      ]);

      expect(result.get('anon-session')).toEqual(service.getDefaultPreferences());
      expect(mockPrisma.userPreference.findMany).not.toHaveBeenCalled();
    });

    it('returns empty Map for empty input', async () => {
      const result = await service.getPreferencesForUsers([]);
      expect(result.size).toBe(0);
    });

    it('fetches multiple users in parallel (cache miss for each)', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferencesForUsers([
        { id: 'user-A', isAnonymous: false },
        { id: 'user-B', isAnonymous: false },
        { id: 'user-C', isAnonymous: false },
      ]);

      expect(mockPrisma.userPreference.findMany).toHaveBeenCalledTimes(3);
    });
  });

  // ── getMetrics ────────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('returns cache size reflecting number of cached users', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());

      await service.getPreferences('user-1');
      await service.getPreferences('user-2');

      expect(service.getMetrics().cacheSize).toBe(2);
    });

    it('returns zero cache size initially', () => {
      expect(service.getMetrics().cacheSize).toBe(0);
    });
  });

  // ── shutdown ──────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('clears the cache', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue(storedPrefs());
      await service.getPreferences('user-123');

      service.shutdown();

      expect(service.getMetrics().cacheSize).toBe(0);
    });

    it('is safe to call multiple times', () => {
      expect(() => {
        service.shutdown();
        service.shutdown();
      }).not.toThrow();
    });
  });
});
