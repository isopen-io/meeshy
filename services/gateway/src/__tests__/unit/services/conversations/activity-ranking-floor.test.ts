/**
 * #17139 — **un ORDRE qui dépend de l'activité d'avant le plancher est une
 * fuite**, au même titre que le champ.
 *
 * #17076 a cessé de SERVIR `participantStats` à un lecteur planchéisé. Deux
 * surfaces continuaient de s'en servir pour ORDONNER une liste qu'elles lui
 * servent : le listing « top » des participants et les suggestions de mention.
 *
 * Le témoin porte sur ce qui est OBSERVABLE des deux côtés de la porte : la
 * carte d'activité est-elle LUE ? C'est le discriminant juste, parce que la
 * dégradation est exactement « ne pas la charger » — et un témoin qui n'assert
 * que sur l'ordre rendu pourrait passer par coïncidence, l'activité et
 * l'ancienneté pouvant classer pareil.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ isAvailable: () => false, get: async () => null, set: async () => undefined, keys: async () => [], del: async () => undefined }),
}));

import { mayRankByConversationActivity } from '../../../../services/conversations/activityRankingGate';
import { loadMostActiveParticipants } from '../../../../routes/conversations/participants-presence';
import { MentionSuggestionFinder } from '../../../../services/mentions/mentionSuggestions';

const CONV_ID = '507f1f77bcf86cd799439022';
const READER = '507f1f77bcf86cd799439011';
const BAVARD = '507f1f77bcf86cd799439033';
const DISCRET = '507f1f77bcf86cd799439044';

const FLOOR = new Date('2026-11-08T00:00:00.000Z');

/** Le bavard a écrit mille fois AVANT le plancher ; le discret, deux fois après. */
const PARTICIPANT_STATS = {
  [BAVARD]: { messageCount: 1000, lastMessageAt: '2026-03-01T10:00:00.000Z' },
  [DISCRET]: { messageCount: 2, lastMessageAt: '2026-11-08T10:00:00.000Z' },
};

const membre = (userId: string, joinedAt: string) => ({
  id: `part-${userId}`,
  userId,
  conversationId: CONV_ID,
  isActive: true,
  joinedAt: new Date(joinedAt),
  role: 'member',
  isOnline: false,
  lastActiveAt: null,
  displayName: userId === BAVARD ? 'Aline' : 'Zoé',
  user: {
    id: userId,
    username: userId === BAVARD ? 'aline' : 'zoe',
    displayName: userId === BAVARD ? 'Aline' : 'Zoé',
    firstName: null,
    lastName: null,
    avatar: null,
    equippedAvatarRing: null,
  },
});

function makePrisma() {
  const statsFindUnique = jest.fn<any>().mockResolvedValue({ participantStats: PARTICIPANT_STATS });
  return {
    statsFindUnique,
    prisma: {
      conversationMessageStats: { findUnique: statsFindUnique },
      participant: {
        findMany: jest.fn<any>().mockImplementation(async (args: any) => {
          const rows = [membre(BAVARD, '2026-01-01T00:00:00.000Z'), membre(DISCRET, '2026-06-01T00:00:00.000Z')];
          const notIn: string[] | undefined = args?.where?.id?.notIn;
          return notIn ? rows.filter((r) => !notIn.includes(r.id)) : rows;
        }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
      user: { findMany: jest.fn<any>().mockResolvedValue([]) },
      // Le classement par PROXIMITÉ se superpose à celui de l'activité
      // (`plusProchesDabord`) : sans cette surface, l'unité lève avant
      // d'arriver à la question du témoin, et le rouge accuserait le harnais.
      userRelation: { findMany: jest.fn<any>().mockResolvedValue([]) },
      friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
      conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'group' }) },
    } as any,
  };
}

describe('la loi — qui peut être classé par l’activité de toute la conversation (#17139)', () => {
  it('sans plancher, oui ; avec, non', () => {
    expect(mayRankByConversationActivity(null)).toBe(true);
    expect(mayRankByConversationActivity(FLOOR)).toBe(false);
  });
});

describe('le listing « top » des participants ne classe plus sur l’avant-plancher (#17139)', () => {
  it('un lecteur à PLANCHER : la carte d’activité n’est même pas LUE', async () => {
    const { prisma, statsFindUnique } = makePrisma();

    const page = await loadMostActiveParticipants({
      prisma,
      conversationId: CONV_ID,
      filters: {},
      pageLimit: 20,
      readerHistoryFloor: FLOOR,
    } as any);

    expect(statsFindUnique).not.toHaveBeenCalled();
    // Dégradation : l'ANCIENNETÉ, l'ordre que le complément tenait déjà.
    expect(page.participants.map((p: { userId: string }) => p.userId)).toEqual([BAVARD, DISCRET]);
  });

  /**
   * Témoin NÉGATIF — vert des DEUX côtés par construction : sans plancher, la
   * porte et son absence rendent le même classement. Son rôle est d'interdire
   * qu'on paie la porte en retirant le classement à TOUT le monde.
   */
  it('un lecteur SANS plancher garde son classement par activité', async () => {
    const { prisma, statsFindUnique } = makePrisma();

    const page = await loadMostActiveParticipants({
      prisma,
      conversationId: CONV_ID,
      filters: {},
      pageLimit: 20,
      readerHistoryFloor: null,
    } as any);

    expect(statsFindUnique).toHaveBeenCalled();
    expect(page.participants[0].userId).toBe(BAVARD);
  });
});

describe('les suggestions de mention ne classent plus sur l’avant-plancher (#17139)', () => {
  it('un lecteur à PLANCHER : la carte d’activité n’est même pas LUE', async () => {
    const { prisma, statsFindUnique } = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'part-reader',
      userId: READER,
      isActive: true,
      role: 'member',
      joinedAt: FLOOR,
      historyVisibleFrom: FLOOR,
      shareLinkId: null,
      permissions: null,
      anonymousSession: null,
      user: { role: 'USER' },
    });
    prisma.conversationShareLink = { findUnique: jest.fn<any>().mockResolvedValue(null) };

    const finder = new MentionSuggestionFinder(prisma);
    await finder.forConversation(CONV_ID, READER, '');

    expect(statsFindUnique).not.toHaveBeenCalled();
  });

  /** Témoin NÉGATIF, vert des deux côtés : sans plancher, rien ne change. */
  it('un lecteur SANS plancher garde son classement par activité', async () => {
    const { prisma, statsFindUnique } = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'part-reader',
      userId: READER,
      isActive: true,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      historyVisibleFrom: null,
      shareLinkId: null,
      permissions: null,
      anonymousSession: null,
      user: { role: 'USER' },
    });
    prisma.conversationShareLink = { findUnique: jest.fn<any>().mockResolvedValue(null) };

    const finder = new MentionSuggestionFinder(prisma);
    await finder.forConversation(CONV_ID, READER, '');

    expect(statsFindUnique).toHaveBeenCalled();
  });
});
