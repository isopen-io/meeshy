/**
 * Un seul cache pour une seule préférence — témoins du cycle 47.
 *
 * La préférence de confidentialité gouverne SIX portes de diffusion (accusés de
 * lecture, accusés de livraison, indicateur de frappe, statut en ligne, « vu
 * à », drain de reconnexion). Jusqu'ici chaque famille de lecteurs mémoïsait
 * dans SON coin : cinq `Map` d'instance côté `PrivacyPreferencesService`
 * (gestionnaire Socket.IO, `PresenceVisibilityService`, et trois plugins de
 * routes), plus un cache statique côté `MessageReadStatusService`. Aucune
 * n'était invalidée à l'écriture.
 *
 * Ces témoins verrouillent les deux propriétés qui en découlent :
 *
 *  1. le cache est PARTAGÉ — une lecture chaude sert tous les lecteurs, quelle
 *     que soit l'instance ou le service qui la demande ;
 *  2. `invalidatePrivacyPreferences(userId)` est un point d'entrée UNIQUE — il
 *     atteint tous les lecteurs à la fois, sans qu'un appelant ait besoin de
 *     tenir la référence d'une instance.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  clearPrivacyPreferencesCache,
  invalidatePrivacyPreferences,
  loadPrivacyPreferencesCached,
} from '../../../../services/preferences/privacy-cache';
import { PrivacyPreferencesService } from '../../../../services/PrivacyPreferencesService';
import { MessageReadStatusService } from '../../../../services/MessageReadStatusService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Doubles ─────────────────────────────────────────────────────────────────

const USER = 'usr-000000000000000000000001';

/**
 * Modélise les DEUX rangements, comme le double de `PrivacyPreferencesService` :
 * le document `UserPreferences.privacy` fait foi, les lignes `UserPreference`
 * héritées ne parlent que pour les utilisateurs sans document.
 */
function makePrisma(privacyByUser: Record<string, unknown> = {}) {
  const idsOf = (where: any): string[] =>
    Array.isArray(where?.userId?.in) ? where.userId.in : [where?.userId].filter(Boolean);

  const state = { privacyByUser };

  const prisma = {
    userPreferences: {
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) =>
        idsOf(where)
          .filter((id) => state.privacyByUser[id] !== undefined)
          .map((userId) => ({ userId, privacy: state.privacyByUser[userId] }))
      ),
    },
    userPreference: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    documentReads: () => (prisma.userPreferences.findMany as jest.Mock<any>).mock.calls.length,
    rewrite: (privacy: Record<string, unknown>) => {
      state.privacyByUser = { [USER]: privacy };
    },
  };
}

const participants = [{ id: 'part-1', userId: USER }];

// ─── Témoins ─────────────────────────────────────────────────────────────────

describe('cache partagé des préférences de confidentialité', () => {
  beforeEach(() => {
    clearPrivacyPreferencesCache();
  });

  afterEach(() => {
    clearPrivacyPreferencesCache();
    jest.clearAllMocks();
  });

  describe('une seule lecture sert tous les lecteurs', () => {
    it('deux instances de PrivacyPreferencesService partagent la même mémoire', async () => {
      const { prisma, documentReads } = makePrisma({ [USER]: { showReadReceipts: false } });

      const managerSide = new PrivacyPreferencesService(prisma);
      const routeSide = new PrivacyPreferencesService(prisma);

      await managerSide.getPreferences(USER);
      const fromRoute = await routeSide.getPreferences(USER);

      expect(fromRoute.showReadReceipts).toBe(false);
      expect(documentReads()).toBe(1);
    });

    it("la porte des accusés de lecture réutilise la lecture du service de préférences", async () => {
      const { prisma, documentReads } = makePrisma({ [USER]: { showReadReceipts: false } });

      await new PrivacyPreferencesService(prisma).getPreferences(USER);
      const visible = await new MessageReadStatusService(prisma).filterReadReceiptVisible(
        participants
      );

      expect(visible).toEqual([]);
      expect(documentReads()).toBe(1);
    });

    it('le résolveur mémoïse aussi les utilisateurs SANS réglage stocké', async () => {
      const { prisma, documentReads } = makePrisma({});

      await loadPrivacyPreferencesCached(prisma, [USER]);
      await loadPrivacyPreferencesCached(prisma, [USER]);

      expect(documentReads()).toBe(1);
    });

    it("ne redemande à la base que les utilisateurs encore inconnus", async () => {
      const { prisma, documentReads } = makePrisma({ [USER]: { showLastSeen: false } });

      await loadPrivacyPreferencesCached(prisma, [USER]);
      const resolved = await loadPrivacyPreferencesCached(prisma, [USER, 'usr-second']);

      expect(resolved.get(USER)?.showLastSeen).toBe(false);
      expect(documentReads()).toBe(2);
      expect(
        ((prisma as any).userPreferences.findMany as jest.Mock<any>).mock.calls[1][0].where.userId.in
      ).toEqual(['usr-second']);
    });
  });

  describe('invalidatePrivacyPreferences atteint TOUS les lecteurs', () => {
    it('un service de préférences déjà chaud relit la base', async () => {
      const { prisma, rewrite } = makePrisma({ [USER]: { showOnlineStatus: true } });
      const sut = new PrivacyPreferencesService(prisma);

      await sut.getPreferences(USER);
      rewrite({ showOnlineStatus: false });
      invalidatePrivacyPreferences(USER);

      expect((await sut.getPreferences(USER)).showOnlineStatus).toBe(false);
    });

    it('la porte des accusés de lecture, déjà chaude, relit la base', async () => {
      const { prisma, rewrite } = makePrisma({ [USER]: { showReadReceipts: true } });
      const sut = new MessageReadStatusService(prisma);

      expect(await sut.filterReadReceiptVisible(participants)).toHaveLength(1);

      rewrite({ showReadReceipts: false });
      invalidatePrivacyPreferences(USER);

      expect(await sut.filterReadReceiptVisible(participants)).toEqual([]);
    });

    it("une écriture d'un utilisateur ne jette pas la mémoire des autres", async () => {
      const other = 'usr-000000000000000000000002';
      const { prisma, documentReads } = makePrisma({
        [USER]: { showReadReceipts: false },
        [other]: { showReadReceipts: false },
      });
      const sut = new PrivacyPreferencesService(prisma);

      await sut.getPreferences(USER);
      await sut.getPreferences(other);
      const readsBefore = documentReads();

      invalidatePrivacyPreferences(USER);
      await sut.getPreferences(other);

      expect(documentReads()).toBe(readsBefore);
    });
  });

  describe("un échec de lecture n'est jamais mémoïsé", () => {
    it('la lecture suivante retente la base', async () => {
      const prisma = {
        userPreferences: {
          findMany: jest
            .fn<any>()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValue([{ userId: USER, privacy: { showReadReceipts: false } }]),
        },
        userPreference: { findMany: jest.fn<any>().mockResolvedValue([]) },
      } as unknown as PrismaClient;

      await expect(loadPrivacyPreferencesCached(prisma, [USER])).rejects.toThrow('boom');

      const resolved = await loadPrivacyPreferencesCached(prisma, [USER]);
      expect(resolved.get(USER)?.showReadReceipts).toBe(false);
    });
  });
});
