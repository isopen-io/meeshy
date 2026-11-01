/**
 * LES AUDIENCES DE CERCLE D'UNE PUBLICATION (#13931) — Connaissances, Proches, Sang.
 *
 * Un post `ACQUAINTANCES` se lit à partir du niveau EFFECTIF Connaissance, un
 * post `CLOSE` à partir de Proche, un post `BLOOD` au seul Sang ; `FRIENDS`
 * garde « Amis et au-dessus ». Le niveau effectif est le MINIMUM des deux
 * accords (RG-01). Les trois formes de la même question (verdict unitaire,
 * admission d'un lot, filtre de liste) rendent ici le MÊME verdict, lu sur un
 * graphe EN MÉMOIRE (`relationStore`) — jamais sur une clause comparée à une
 * copie d'elle-même.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { filterPostConsumers } from '../../../../services/posts/postAudience';
import {
  buildPostVisibilityOrFilter,
  canUserConsumePost,
  canUserInteractWithPost,
  canUserViewPost,
  type PostVisibilityRecord,
} from '../../../../services/posts/postVisibility';
import { buildFeedVisibilityFilter } from '../../../../services/posts/feedVisibility';
import { buildViewerVisibilityFilter } from '../../../../services/posts/viewerAudience';
import { feedCirclesCacheKey, invalidateFeedFriends, loadFeedCircles } from '../../../../services/posts/feedFriends';
import { relationStore } from '../../../helpers/user-relation-store';
import { matchesMongoWhere } from '../../../helpers/mongo-where';
import type { CacheStore } from '../../../../services/CacheStore';

const hex = (letter: string): string => letter.repeat(24);

const AUTHOR = hex('a');
const ACQ = hex('b');
const FRI = hex('c');
const CLS = hex('d');
const BLD = hex('e');
const DM = hex('f');
const STR = hex('1');
const ASYM = hex('2');

const NOW = new Date('2026-10-31T10:00:00Z');

const link = (other: string, granted: { byAuthor: string; byOther: string }) => {
  const [userLowId, userHighId] = AUTHOR < other ? [AUTHOR, other] : [other, AUTHOR];
  const authorIsLow = userLowId === AUTHOR;
  return {
    id: `rel-${other}`,
    userLowId,
    userHighId,
    grantedByLow: authorIsLow ? granted.byAuthor : granted.byOther,
    grantedByHigh: authorIsLow ? granted.byOther : granted.byAuthor,
    transitions: [],
    updatedAt: NOW,
  };
};

const same = (level: string) => ({ byAuthor: level, byOther: level });

const world = (extra: { readonly dmContacts?: readonly string[]; readonly relationsOverride?: readonly object[] } = {}) => {
  const store = relationStore({
    relations: extra.relationsOverride ?? [
      link(ACQ, same('ACQUAINTANCE')),
      link(CLS, same('CLOSE')),
      link(BLD, same('BLOOD')),
      link(ASYM, { byAuthor: 'BLOOD', byOther: 'ACQUAINTANCE' }),
    ],
    friendRequests: [{ id: 'fr-legacy', senderId: AUTHOR, receiverId: FRI, status: 'accepted', updatedAt: NOW, respondedAt: NOW }],
  });
  const dm = new Set(extra.dmContacts ?? [DM]);
  const participantFindMany = jest.fn<any>(async ({ where }: any) => {
    if (where?.userId === AUTHOR) return [...dm].map((id) => ({ conversationId: `c-${id}` }));
    if (where?.userId?.in) {
      const rooms = new Set<string>(where?.conversationId?.in ?? []);
      return (where.userId.in as string[]).filter((id) => dm.has(id) && rooms.has(`c-${id}`)).map((id) => ({ userId: id }));
    }
    return [];
  });
  const prisma = {
    ...store.prisma,
    communityMember: { findMany: jest.fn<any>(async () => []), findFirst: jest.fn<any>(async () => null) },
    participant: {
      findMany: participantFindMany,
      findFirst: jest.fn<any>(async ({ where }: any) => {
        const rooms = new Set<string>(where?.conversationId?.in ?? []);
        return dm.has(where?.userId) && rooms.has(`c-${where.userId}`) ? { id: 'p-1' } : null;
      }),
    },
    postMention: { findUnique: jest.fn<any>(async () => null) },
    post: { findFirst: jest.fn<any>(async () => null) },
    postComment: { findFirst: jest.fn<any>(async () => null) },
  };
  return { prisma: prisma as any, participantFindMany };
};

const record = (visibility: string): PostVisibilityRecord => ({
  id: 'p-1',
  authorId: AUTHOR,
  visibility: visibility as never,
  visibilityUserIds: [],
  expiresAt: null,
});

const ALL_READERS = [ACQ, FRI, CLS, BLD, DM, STR, ASYM] as const;

const EXPECTED_READERS: Readonly<Record<string, readonly string[]>> = {
  ACQUAINTANCES: [ACQ, FRI, CLS, BLD, ASYM],
  FRIENDS: [FRI, CLS, BLD, DM],
  CLOSE: [CLS, BLD],
  BLOOD: [BLD],
};

describe('filterPostConsumers — l\'admission d\'un lot suit le niveau effectif du cercle', () => {
  it.each(Object.entries(EXPECTED_READERS))('%s admet exactement ses lecteurs, dans l\'ordre reçu', async (visibility, expected) => {
    const { prisma } = world();
    const admitted = await filterPostConsumers({ prisma, authorId: AUTHOR, visibility, candidateUserIds: ALL_READERS });
    expect(admitted).toEqual(ALL_READERS.filter((id) => expected.includes(id)));
  });

  it('Aucun contact de message direct n\'entre dans un cercle : ni Connaissances, ni Proches, ni Sang', async () => {
    const { prisma, participantFindMany } = world();
    for (const visibility of ['ACQUAINTANCES', 'CLOSE', 'BLOOD']) {
      expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility, candidateUserIds: [DM] })).toEqual([]);
    }
    expect(participantFindMany).not.toHaveBeenCalled();
  });

  it('un accès à sens unique ne vaut que le plus bas des deux accords (Sang accordé, Connaissance reçue)', async () => {
    const { prisma } = world();
    expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility: 'ACQUAINTANCES', candidateUserIds: [ASYM] })).toEqual([ASYM]);
    expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility: 'CLOSE', candidateUserIds: [ASYM] })).toEqual([]);
    expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility: 'BLOOD', candidateUserIds: [ASYM] })).toEqual([]);
  });

  it('l\'auteur est toujours admis, même dans le cercle le plus étroit', async () => {
    const { prisma } = world();
    expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility: 'BLOOD', candidateUserIds: [STR, AUTHOR] })).toEqual([AUTHOR]);
  });

  it('en panne du graphe, un cercle n\'admet personne hormis l\'auteur', async () => {
    const { prisma } = world();
    prisma.userRelation.findMany = jest.fn<any>().mockRejectedValue(new Error('down'));
    for (const visibility of ['ACQUAINTANCES', 'CLOSE', 'BLOOD']) {
      expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility, candidateUserIds: [BLD, AUTHOR] })).toEqual([AUTHOR]);
    }
  });

  it('EXCEPT garde sa liste noire sur le niveau Ami (un Proche nommé reste exclu)', async () => {
    const { prisma } = world();
    expect(
      await filterPostConsumers({ prisma, authorId: AUTHOR, visibility: 'EXCEPT', visibilityUserIds: [CLS], candidateUserIds: [CLS, BLD, ACQ] }),
    ).toEqual([BLD]);
  });
});

describe('le verdict unitaire dit la même chose que le lot, audience par audience', () => {
  it.each(Object.entries(EXPECTED_READERS))('%s : lecture, consommation et interaction suivent le niveau effectif', async (visibility, expected) => {
    const { prisma } = world();
    for (const reader of ALL_READERS) {
      const may = expected.includes(reader);
      expect(await canUserViewPost(prisma, record(visibility), reader)).toBe(may && reader !== DM);
      expect(await canUserConsumePost(prisma, record(visibility), reader)).toBe(may);
    }
  });

  it('le lot et le verdict de consommation ne divergent sur aucune paire (audience x lecteur)', async () => {
    const { prisma } = world();
    for (const visibility of ['ACQUAINTANCES', 'FRIENDS', 'CLOSE', 'BLOOD']) {
      const batch = new Set(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility, candidateUserIds: ALL_READERS }));
      for (const reader of ALL_READERS) {
        expect(await canUserConsumePost(prisma, record(visibility), reader)).toBe(batch.has(reader));
      }
    }
  });

  it('l\'interaction suit le cercle sans contact DM : un contact DM ne commente pas un post FRIENDS', async () => {
    const { prisma } = world();
    expect(await canUserInteractWithPost(prisma, record('FRIENDS'), DM)).toBe(false);
    expect(await canUserInteractWithPost(prisma, record('CLOSE'), CLS)).toBe(true);
    expect(await canUserInteractWithPost(prisma, record('CLOSE'), FRI)).toBe(false);
  });

  it('un visiteur anonyme ne lit aucune audience de cercle', async () => {
    const { prisma } = world();
    for (const visibility of ['ACQUAINTANCES', 'CLOSE', 'BLOOD']) {
      expect(await canUserConsumePost(prisma, record(visibility), undefined)).toBe(false);
    }
  });

  it('l\'auteur lit toujours son propre post de cercle', async () => {
    const { prisma } = world();
    expect(await canUserConsumePost(prisma, record('BLOOD'), AUTHOR)).toBe(true);
  });
});

describe('le filtre de liste — buildPostVisibilityOrFilter', () => {
  const posts = ['ACQUAINTANCES', 'CLOSE', 'BLOOD', 'FRIENDS'].map((visibility, i) => ({
    id: `post-${i}`,
    authorId: AUTHOR,
    visibility,
    visibilityUserIds: [] as string[],
  }));
  const seen = (filter: object) => posts.filter((p) => matchesMongoWhere(p, filter as never)).map((p) => p.visibility);

  it('sert à un lecteur de cercle ce que son niveau permet, et rien de plus', () => {
    const circles = { acquaintance: [AUTHOR], close: [], blood: [] };
    expect(seen(buildPostVisibilityOrFilter(STR, [], [], [], circles))).toEqual(['ACQUAINTANCES']);
  });

  it('un Proche (niveau Proche et plus bas) voit Connaissances et Proches, pas Sang', () => {
    const circles = { acquaintance: [AUTHOR], close: [AUTHOR], blood: [] };
    expect(seen(buildPostVisibilityOrFilter(STR, [AUTHOR], [], [], circles)).sort()).toEqual(['ACQUAINTANCES', 'CLOSE', 'FRIENDS']);
  });

  it('sans cercles fournis, aucune audience de cercle n\'est servie (fail-closed)', () => {
    expect(seen(buildPostVisibilityOrFilter(STR, [AUTHOR], []))).toEqual(['FRIENDS']);
  });

  it('le Sang voit tout', () => {
    const circles = { acquaintance: [AUTHOR], close: [AUTHOR], blood: [AUTHOR] };
    expect(seen(buildPostVisibilityOrFilter(STR, [AUTHOR], [], [], circles)).sort()).toEqual(['ACQUAINTANCES', 'BLOOD', 'CLOSE', 'FRIENDS']);
  });

  it('le blocage prime sur le cercle', () => {
    const circles = { acquaintance: [AUTHOR], close: [AUTHOR], blood: [AUTHOR] };
    expect(seen(buildPostVisibilityOrFilter(STR, [AUTHOR], [], [AUTHOR], circles))).toEqual([]);
  });
});

describe('les cercles du lecteur — loadFeedCircles et les filtres qui les lisent', () => {
  const VIEWER = hex('9');
  const viewerWorld = () => {
    const l = (other: string, level: string) => {
      const [userLowId, userHighId] = VIEWER < other ? [VIEWER, other] : [other, VIEWER];
      return { id: `r-${other}`, userLowId, userHighId, grantedByLow: level, grantedByHigh: level, transitions: [], updatedAt: NOW };
    };
    const store = relationStore({ relations: [l(ACQ, 'ACQUAINTANCE'), l(FRI, 'FRIEND'), l(CLS, 'CLOSE'), l(BLD, 'BLOOD')] });
    const prisma = {
      ...store.prisma,
      user: { findMany: jest.fn<any>(async () => []), findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })) },
      communityMember: { findMany: jest.fn<any>(async () => []), findFirst: jest.fn<any>(async () => null) },
      participant: { findMany: jest.fn<any>(async () => []), findFirst: jest.fn<any>(async () => null) },
    };
    return prisma as any;
  };
  const cacheDouble = () => {
    const store = new Map<string, string>();
    return {
      store,
      cache: {
        get: jest.fn(async (key: string) => store.get(key) ?? null),
        set: jest.fn(async (key: string, value: string) => void store.set(key, value)),
        del: jest.fn(async (key: string) => void store.delete(key)),
      } as unknown as CacheStore,
    };
  };

  it('rend, par cercle, les auteurs dont le niveau atteint AU MOINS ce cercle', async () => {
    const circles = await loadFeedCircles({ prisma: viewerWorld(), userId: VIEWER });
    expect([...circles.acquaintance].sort()).toEqual([ACQ, FRI, CLS, BLD].sort());
    expect([...circles.close].sort()).toEqual([CLS, BLD].sort());
    expect([...circles.blood]).toEqual([BLD]);
  });

  it('sert le second appel depuis le cache et se vide avec l\'invalidation du fil', async () => {
    const prisma = viewerWorld();
    const { cache, store } = cacheDouble();
    await loadFeedCircles({ prisma, cache, userId: VIEWER });
    const reads = prisma.userRelation.findMany.mock?.calls?.length ?? 0;
    await loadFeedCircles({ prisma, cache, userId: VIEWER });
    expect(store.has(feedCirclesCacheKey(VIEWER))).toBe(true);
    expect(prisma.userRelation.findMany.mock?.calls?.length ?? 0).toBe(reads);
    await invalidateFeedFriends(cache, [VIEWER]);
    expect(store.has(feedCirclesCacheKey(VIEWER))).toBe(false);
  });

  it('en panne, aucun cercle (jamais une ouverture)', async () => {
    const prisma = viewerWorld();
    prisma.userRelation.findMany = jest.fn<any>().mockRejectedValue(new Error('down'));
    prisma.friendRequest.findMany = jest.fn<any>().mockRejectedValue(new Error('down'));
    expect(await loadFeedCircles({ prisma, userId: VIEWER })).toEqual({ acquaintance: [], close: [], blood: [] });
  });

  const authored = (author: string) =>
    ['ACQUAINTANCES', 'CLOSE', 'BLOOD', 'FRIENDS'].map((visibility) => ({ authorId: author, visibility, visibilityUserIds: [] as string[] }));
  const visibleVisibilities = (filter: object, author: string) =>
    authored(author).filter((p) => matchesMongoWhere(p, filter as never)).map((p) => p.visibility).sort();

  it('le filtre du fil lit lui-même les cercles : un Proche voit Connaissances et Proches de ses Proches', async () => {
    const prisma = viewerWorld();
    const filter = await buildFeedVisibilityFilter(prisma, VIEWER, [FRI, CLS, BLD], [], undefined);
    expect(visibleVisibilities(filter, ACQ)).toEqual(['ACQUAINTANCES']);
    expect(visibleVisibilities(filter, FRI)).toEqual(['ACQUAINTANCES', 'FRIENDS']);
    expect(visibleVisibilities(filter, CLS)).toEqual(['ACQUAINTANCES', 'CLOSE', 'FRIENDS']);
    expect(visibleVisibilities(filter, BLD)).toEqual(['ACQUAINTANCES', 'BLOOD', 'CLOSE', 'FRIENDS']);
    expect(visibleVisibilities(filter, STR)).toEqual([]);
  });

  it('le filtre d\'accès unitaire (PostService) suit la même table, sans lecture de demande acceptée', async () => {
    const prisma = viewerWorld();
    const filter = await buildViewerVisibilityFilter(prisma, VIEWER);
    expect(visibleVisibilities(filter, CLS)).toEqual(['ACQUAINTANCES', 'CLOSE', 'FRIENDS']);
    expect(visibleVisibilities(filter, ACQ)).toEqual(['ACQUAINTANCES']);
    expect(visibleVisibilities(filter, STR)).toEqual([]);
  });
});
