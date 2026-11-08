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
import { ACCESS_DENIED, MentionSuggestionFinder } from '../../../../services/mentions/mentionSuggestions';

/**
 * Le cache du finder, en DEUX exemplaires nommés.
 *
 * Le constructeur en exige un : l'omettre laissait `this.cache` à `undefined`,
 * donc les deux accès levaient un `TypeError` **avalé par leurs `catch`** — les
 * témoins passaient dans un régime de cache en PANNE, que la production n'a
 * pas, et le chemin de cache-TOUCHÉ (qui court-circuite la porte entière)
 * n'était exercé nulle part. Le cliquet de typecheck des tests l'a nommé avant
 * moi : deux erreurs `TS2554`, non muettes, de ce fichier.
 */
const cacheVide = () => ({
  isAvailable: () => true,
  get: jest.fn<any>().mockResolvedValue(null),
  set: jest.fn<any>().mockResolvedValue(undefined),
  keys: jest.fn<any>().mockResolvedValue([]),
  del: jest.fn<any>().mockResolvedValue(undefined),
});

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
          // Le bavard a rejoint EN DERNIER, exprès : si activité et ancienneté
          // classaient pareil, l'assertion d'ORDRE ci-dessous ne pourrait pas
          // tomber — elle décrirait une coïncidence au lieu d'une règle.
          const rows = [membre(DISCRET, '2026-01-01T00:00:00.000Z'), membre(BAVARD, '2026-06-01T00:00:00.000Z')];
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
    // Dégradation : l'ANCIENNETÉ, l'ordre que le complément tenait déjà — donc
    // le DISCRET d'abord, l'inverse du classement par activité.
    expect(page.participants.map((p: { userId: string }) => p.userId)).toEqual([DISCRET, BAVARD]);
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

    const finder = new MentionSuggestionFinder(prisma, cacheVide() as any);
    const suggestions = await finder.forConversation(CONV_ID, READER, '');

    expect(statsFindUnique).not.toHaveBeenCalled();
    // Et la liste SURVIT : une porte qui vide les suggestions d'un lecteur
    // planchéisé serait une régression déguisée en correctif.
    expect(suggestions.map((s) => s.id).sort()).toEqual([BAVARD, DISCRET].sort());
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

    const finder = new MentionSuggestionFinder(prisma, cacheVide() as any);
    const suggestions = await finder.forConversation(CONV_ID, READER, '');

    expect(statsFindUnique).toHaveBeenCalled();
    expect(suggestions.map((s) => s.id).sort()).toEqual([BAVARD, DISCRET].sort());
  });
});

/**
 * ─── Et la PORTE, pas seulement le PLANCHER (audit du lot) ──────────────────
 *
 * La jumelle de ce lot — `GET …/stats`, #17076 — pose DEUX gardes, dans cet
 * ordre : `readerShareLinkHasExpired` puis le plancher. La première version de
 * ce lot-ci n'avait reprise que la seconde, et c'est exactement ce que le
 * `CLAUDE.md` du dépôt interdit : « quand on reprend le correctif d'une
 * jumelle, on le prend EN ENTIER ».
 *
 * Elle attrape un lecteur que le plancher ne voit pas : celui dont le lien
 * ÉCHU **accordait** l'historique (`allowViewHistory: true`), donc dont le
 * plancher est NUL. Le fil, la recherche, les fils de réponses, les épinglés et
 * les statistiques lui rendent tous 403 ; ces deux listes lui servaient le
 * classement de toute la vie de la conversation.
 */
const LIEN_ECHU_QUI_ACCORDAIT = {
  id: 'lien',
  allowViewHistory: true,
  expiresAt: new Date('2026-11-01T00:00:00.000Z'),
};

const entreParLien = (extra: Record<string, unknown> = {}) => ({
  id: 'part-reader',
  userId: READER,
  isActive: true,
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  historyVisibleFrom: null,
  shareLinkId: 'lien',
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
  ...extra,
});

describe('un lien ÉCHU ferme les deux surfaces de classement (#17139)', () => {
  it('les suggestions de mention refusent, comme une conversation fermée', async () => {
    const { prisma, statsFindUnique } = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(entreParLien());
    prisma.conversationShareLink = { findFirst: jest.fn<any>().mockResolvedValue(LIEN_ECHU_QUI_ACCORDAIT) };

    const finder = new MentionSuggestionFinder(prisma, cacheVide() as any);

    await expect(finder.forConversation(CONV_ID, READER, '')).rejects.toThrow(ACCESS_DENIED);
    expect(statsFindUnique).not.toHaveBeenCalled();
  });

  /**
   * Témoin NÉGATIF — vert des DEUX côtés : un lien VIVANT qui accorde
   * l'historique laisse passer, et laisse le classement par activité. Sans lui,
   * la porte se paierait en fermant la surface à tous les invités de lien.
   */
  it('un lien VIVANT qui accorde l’historique laisse passer, classement compris', async () => {
    const { prisma, statsFindUnique } = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(entreParLien());
    prisma.conversationShareLink = {
      findFirst: jest.fn<any>().mockResolvedValue({ ...LIEN_ECHU_QUI_ACCORDAIT, expiresAt: null }),
    };

    const finder = new MentionSuggestionFinder(prisma, cacheVide() as any);
    const suggestions = await finder.forConversation(CONV_ID, READER, '');

    expect(statsFindUnique).toHaveBeenCalled();
    expect(suggestions.map((s) => s.id).sort()).toEqual([BAVARD, DISCRET].sort());
  });

  /**
   * Et la lecture du lien se paie sur la ligne que la porte lisait DÉJÀ : une
   * seule lecture de participant pour les DEUX questions. L'audit avait sorti
   * le doublon contre la première version, qui appelait `loadReaderHistoryFloor`
   * en plus de la lecture d'appartenance.
   */
  it('une seule lecture de la ligne du lecteur sert les deux questions', async () => {
    const { prisma } = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(entreParLien({ shareLinkId: null }));
    prisma.conversationShareLink = { findFirst: jest.fn<any>() };

    const finder = new MentionSuggestionFinder(prisma, cacheVide() as any);
    await finder.forConversation(CONV_ID, READER, '');

    expect((prisma.participant.findFirst as jest.Mock<any>).mock.calls.length).toBe(1);
    // Sans `shareLinkId`, aucune lecture de lien : rien n'est deviné.
    expect((prisma.conversationShareLink.findFirst as jest.Mock<any>)).not.toHaveBeenCalled();
  });
});
