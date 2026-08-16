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
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../../config/user-preferences-defaults';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeStoredPrefs(overrides: Array<{ key: string; value: string }> = []) {
  return overrides;
}

/**
 * Le double modélise les DEUX rangements que le dépôt possède :
 *
 *  - `userPreferences.privacy` — le document JSON qu'écrivent
 *    `PUT/PATCH /me/preferences/privacy`, seule porte que les clients
 *    appellent (web `user-preferences-store`, iOS `OutboxDispatcher`) ;
 *  - `userPreference` — les lignes clé/valeur héritées de l'endpoint
 *    `/user-preferences/privacy` retiré en janvier 2026.
 *
 * Un double qui n'en modélise qu'un seul ne peut pas voir la panne : c'est
 * exactement pour ça qu'elle a survécu.
 */
function makePrisma(
  storedPrefs: Array<{ key: string; value: string }> = [],
  privacyByUser: Record<string, unknown> = {}
) {
  const idsOf = (where: any): string[] =>
    Array.isArray(where?.userId?.in) ? where.userId.in : [where?.userId].filter(Boolean);

  return {
    userPreferences: {
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) =>
        idsOf(where)
          .filter((id) => privacyByUser[id] !== undefined)
          .map((userId) => ({ userId, privacy: privacyByUser[userId] }))
      ),
    },
    userPreference: {
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) =>
        idsOf(where).flatMap((userId) => storedPrefs.map((p) => ({ ...p, userId })))
      ),
    },
  } as unknown as PrismaClient;
}

function makeSut(prisma?: PrismaClient) {
  return new PrivacyPreferencesService(prisma ?? makePrisma());
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PrivacyPreferencesService', () => {
  // La mémoïsation vit au niveau MODULE, partagée par toutes les instances et
  // par les autres portes de diffusion (cf. `preferences/privacy-cache`) : sans
  // cette purge, un identifiant réutilisé d'un cas à l'autre serait servi chaud.
  beforeEach(() => {
    clearPrivacyPreferencesCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    clearPrivacyPreferencesCache();
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
        userPreferences: {
          findMany: jest.fn<any>().mockRejectedValue(new Error('db error')),
        },
        userPreference: {
          findMany: jest.fn<any>().mockRejectedValue(new Error('db error')),
        },
      } as unknown as PrismaClient;
      const sut = makeSut(prisma);

      const prefs = await sut.getPreferences('user-1');

      expect(prefs).toEqual(sut.getDefaultPreferences());
    });
  });

  // ── Le rangement que les clients écrivent VRAIMENT ────────────────────────

  describe('getPreferences — document JSON `userPreferences.privacy`', () => {
    it('honore un opt-out posé par PATCH /me/preferences/privacy', async () => {
      const sut = makeSut(makePrisma([], { 'user-1': { showReadReceipts: false } }));

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.showReadReceipts).toBe(false);
    });

    it('honore showOnlineStatus, showLastSeen et showTypingIndicator du même document', async () => {
      const sut = makeSut(
        makePrisma([], {
          'user-1': {
            showOnlineStatus: false,
            showLastSeen: false,
            showTypingIndicator: false,
          },
        })
      );

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.showOnlineStatus).toBe(false);
      expect(prefs.showLastSeen).toBe(false);
      expect(prefs.showTypingIndicator).toBe(false);
    });

    it('le document JSON prime sur les lignes clé/valeur héritées', async () => {
      const sut = makeSut(
        makePrisma(
          [{ key: 'show-read-receipts', value: 'false' }],
          { 'user-1': { showReadReceipts: true } }
        )
      );

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.showReadReceipts).toBe(true);
    });

    it('les lignes héritées restent servies quand aucun document JSON n’existe', async () => {
      const sut = makeSut(makePrisma([{ key: 'show-read-receipts', value: 'false' }], {}));

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.showReadReceipts).toBe(false);
    });

    it('un document vide n’efface pas les lignes héritées', async () => {
      const sut = makeSut(
        makePrisma([{ key: 'show-read-receipts', value: 'false' }], { 'user-1': {} })
      );

      const prefs = await sut.getPreferences('user-1');

      expect(prefs.showReadReceipts).toBe(false);
    });
  });

  describe('getPreferencesForUsers — document JSON `userPreferences.privacy`', () => {
    it('honore un opt-out par lot, et ne l’applique qu’à son auteur', async () => {
      const sut = makeSut(makePrisma([], { 'user-1': { showReadReceipts: false } }));

      const prefs = await sut.getPreferencesForUsers([
        { id: 'user-1', isAnonymous: false },
        { id: 'user-2', isAnonymous: false },
      ]);

      expect(prefs.get('user-1')?.showReadReceipts).toBe(false);
      expect(prefs.get('user-2')?.showReadReceipts).toBe(true);
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

  // ── Expiration ───────────────────────────────────────────────────────────
  //
  // Le balayage périodique par `setInterval` a disparu avec la `Map`
  // d'instance : le cache partagé expire à la LECTURE et se borne à
  // l'insertion. Ce qui compte n'est pas qu'une entrée périmée soit balayée,
  // c'est qu'elle ne soit jamais SERVIE.

  describe('expiration', () => {
    it('une entrée périmée est relâchée à la lecture suivante', async () => {
      const prisma = makePrisma([]);
      const sut = makeSut(prisma);

      await sut.getPreferences('user-1');
      expect(sut.getMetrics().cacheSize).toBe(1);

      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      await sut.getPreferences('user-1');

      expect(sut.getMetrics().cacheSize).toBe(1);
      expect((prisma.userPreference.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(2);
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
