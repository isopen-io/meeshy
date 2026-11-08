/**
 * LES AUDIENCES DE CONTENU ENTRE DEUX COMPTES DE L'ÉQUIPE (#16623, correction porteur 2026-11-08).
 *
 * Un collègue (MODERATOR, ADMIN, BIGBOSS) voit la publication Connaissances / Proches / Sang
 * d'un collègue SANS aucun lien, est prévenu par son entourage, et figure dans ses cercles de
 * fil ; un utilisateur ordinaire, non. Le blocage, un rôle inconnu, un compte parti et un
 * mineur déclaré restent fermés. Tout se lit sur un monde EN MÉMOIRE (liens, comptes, blocages).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { circleAudienceIds, filterPostConsumers } from '../../../../services/posts/postAudience';
import { canUserConsumePost, canUserViewPost, type PostVisibilityRecord } from '../../../../services/posts/postVisibility';
import { loadFeedCircles } from '../../../../services/posts/feedFriends';
import { resolveEntourage } from '../../../../services/notifications/fanout/entourage';
import { relationStore } from '../../../helpers/user-relation-store';
import { matchesMongoWhere, type MongoDocument } from '../../../helpers/mongo-where';

const hex = (letter: string): string => letter.repeat(24);

const AUTHOR = hex('a');
const COLLEAGUE = hex('b');
const ADMIN2 = hex('c');
const ORDINARY = hex('d');
const AUDITOR = hex('e');
const GONE = hex('f');
const BLOCKER = hex('1');
const UNKNOWN_ROLE = hex('2');
const LINKED_FRIEND = hex('3');

const NOW = new Date('2026-11-08T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');
const CHILD = new Date('2016-01-01T00:00:00Z');

type Account = {
  readonly id: string;
  readonly role: string;
  readonly isActive?: boolean;
  readonly deletedAt?: Date | null;
  readonly deactivatedAt?: Date | null;
  readonly birthDate?: Date | null;
  readonly blockedUserIds?: readonly string[];
};

const account = (a: Account) => ({ isActive: true, deletedAt: null, deactivatedAt: null, birthDate: ADULT, blockedUserIds: [] as string[], ...a });

const ACCOUNTS: readonly Account[] = [
  { id: AUTHOR, role: 'ADMIN' },
  { id: COLLEAGUE, role: 'MODERATOR' },
  { id: ADMIN2, role: 'BIGBOSS' },
  { id: ORDINARY, role: 'USER' },
  { id: AUDITOR, role: 'AUDIT' },
  { id: GONE, role: 'MODERATOR', isActive: false },
  { id: BLOCKER, role: 'ADMIN', blockedUserIds: [AUTHOR] },
  { id: UNKNOWN_ROLE, role: 'SUPERADMIN' },
  { id: LINKED_FRIEND, role: 'USER' },
];

const world = (accounts: readonly Account[] = ACCOUNTS, preferences: Record<string, unknown> = {}) => {
  const users = accounts.map(account) as unknown as MongoDocument[];
  const [low, high] = AUTHOR < LINKED_FRIEND ? [AUTHOR, LINKED_FRIEND] : [LINKED_FRIEND, AUTHOR];
  const store = relationStore({
    relations: [{ id: 'r1', userLowId: low, userHighId: high, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', transitions: [], updatedAt: NOW }],
  });
  const project = (row: MongoDocument, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row };
  const prisma = {
    ...store.prisma,
    user: {
      findMany: jest.fn<any>(async ({ where, select }: any) => users.filter((row) => matchesMongoWhere(row, where)).map((row) => project(row, select))),
      findUnique: jest.fn<any>(async ({ where, select }: any) => {
        const row = users.find((candidate) => candidate.id === where.id);
        return row ? project(row, select) : null;
      }),
    },
    communityMember: { findMany: jest.fn<any>(async () => []), findFirst: jest.fn<any>(async () => null) },
    participant: { findMany: jest.fn<any>(async () => []), findFirst: jest.fn<any>(async () => null) },
    userPreferences: { findUnique: jest.fn<any>(async ({ where }: any) => ({ notification: preferences[where.userId] ?? {} })) },
  };
  return prisma as any;
};

const record = (visibility: string, authorId = AUTHOR): PostVisibilityRecord => ({
  id: 'p-1',
  authorId,
  visibility: visibility as never,
  visibilityUserIds: [],
  expiresAt: null,
});

const CIRCLES = ['ACQUAINTANCES', 'CLOSE', 'BLOOD'] as const;
const READERS = [COLLEAGUE, ADMIN2, ORDINARY, AUDITOR, GONE, BLOCKER, UNKNOWN_ROLE, LINKED_FRIEND] as const;

describe('filterPostConsumers — un collègue de l\'équipe lit les cercles de l\'équipe sans lien', () => {
  it.each(CIRCLES)('%s : admet les comptes de l\'équipe, jamais un utilisateur ordinaire, AUDIT, un compte parti ni un rôle inconnu', async (visibility) => {
    const admitted = await filterPostConsumers({ prisma: world(), authorId: AUTHOR, visibility, candidateUserIds: READERS });
    const expected = visibility === 'ACQUAINTANCES' ? [COLLEAGUE, ADMIN2, LINKED_FRIEND] : [COLLEAGUE, ADMIN2];
    expect(admitted.filter((id) => id !== BLOCKER)).toEqual(expected);
  });

  it('le blocage d\'un collègue l\'écarte, dans le sens où il a bloqué l\'auteur', async () => {
    const admitted = await filterPostConsumers({ prisma: world(), authorId: AUTHOR, visibility: 'BLOOD', candidateUserIds: [BLOCKER, COLLEAGUE] });
    expect(admitted).toEqual([COLLEAGUE]);
  });

  it('un auteur ordinaire n\'ouvre rien à l\'équipe : un modérateur ne lit pas le post Sang d\'un utilisateur', async () => {
    expect(await filterPostConsumers({ prisma: world(), authorId: ORDINARY, visibility: 'BLOOD', candidateUserIds: [COLLEAGUE, ADMIN2] })).toEqual([]);
  });

  it('un auteur mineur déclaré n\'ouvre rien à un collègue adulte (le bouclier des mineurs tient)', async () => {
    const prisma = world([{ id: AUTHOR, role: 'MODERATOR', birthDate: CHILD }, { id: COLLEAGUE, role: 'ADMIN' }]);
    expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility: 'BLOOD', candidateUserIds: [COLLEAGUE] })).toEqual([]);
  });

  it('en panne de la lecture des comptes, rien ne s\'ouvre au-delà du lien réel', async () => {
    const prisma = world();
    prisma.user.findMany = jest.fn<any>().mockRejectedValue(new Error('down'));
    expect(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility: 'BLOOD', candidateUserIds: [COLLEAGUE] })).toEqual([]);
  });
});

describe('le verdict unitaire dit la même chose que le lot', () => {
  it.each(CIRCLES)('%s : lecture et consommation du collègue sans lien, refus de l\'utilisateur ordinaire', async (visibility) => {
    const prisma = world();
    expect(await canUserViewPost(prisma, record(visibility), COLLEAGUE)).toBe(true);
    expect(await canUserConsumePost(prisma, record(visibility), COLLEAGUE)).toBe(true);
    expect(await canUserViewPost(prisma, record(visibility), ORDINARY)).toBe(false);
    expect(await canUserViewPost(prisma, record(visibility), AUDITOR)).toBe(false);
  });

  it('le lot et le verdict ne divergent sur aucun lecteur', async () => {
    const prisma = world();
    for (const visibility of CIRCLES) {
      const batch = new Set(await filterPostConsumers({ prisma, authorId: AUTHOR, visibility, candidateUserIds: READERS }));
      for (const reader of READERS) {
        expect(await canUserConsumePost(prisma, record(visibility), reader)).toBe(batch.has(reader));
      }
    }
  });
});

describe('les énumérateurs d\'audience ajoutent les collègues aux liens réels', () => {
  it.each(CIRCLES)('circleAudienceIds(%s) nomme les collègues utilisables non bloqués, et les liens réels', async (visibility) => {
    const ids = await circleAudienceIds(world(), AUTHOR, visibility);
    expect([...(ids ?? [])].sort()).toEqual((visibility === 'ACQUAINTANCES' ? [COLLEAGUE, ADMIN2, LINKED_FRIEND] : [COLLEAGUE, ADMIN2]).sort());
  });

  it('circleAudienceIds ne nomme aucun collègue pour un auteur ordinaire', async () => {
    expect(await circleAudienceIds(world(), ORDINARY, 'BLOOD')).toEqual([]);
  });

  it('loadFeedCircles range les collègues d\'un lecteur de l\'équipe dans les trois cercles', async () => {
    const circles = await loadFeedCircles({ prisma: world(), userId: AUTHOR });
    for (const ring of [circles.acquaintance, circles.close, circles.blood]) {
      expect(ring).toEqual(expect.arrayContaining([COLLEAGUE, ADMIN2]));
      expect(ring).not.toEqual(expect.arrayContaining([ORDINARY]));
      expect(ring).not.toEqual(expect.arrayContaining([AUDITOR]));
      expect(ring).not.toEqual(expect.arrayContaining([GONE]));
      expect(ring).not.toEqual(expect.arrayContaining([UNKNOWN_ROLE]));
    }
    expect(circles.close).not.toContain(LINKED_FRIEND);
  });

  it('loadFeedCircles ne range aucun collègue pour un lecteur ordinaire', async () => {
    const circles = await loadFeedCircles({ prisma: world(), userId: ORDINARY });
    expect(circles).toEqual({ acquaintance: [], close: [], blood: [] });
  });
});

describe('resolveEntourage — l\'entourage d\'un compte de l\'équipe comprend ses collègues', () => {
  it('prévient les collègues sans lien, pas l\'utilisateur ordinaire', async () => {
    const { ids } = await resolveEntourage(world(), { ownerId: AUTHOR, key: 'circlePublicationPost' });
    expect(ids).toEqual(expect.arrayContaining([COLLEAGUE, ADMIN2]));
    expect(ids).not.toEqual(expect.arrayContaining([ORDINARY, AUDITOR, GONE, UNKNOWN_ROLE, BLOCKER]));
  });

  it('« Personne » ferme l\'entourage même entre collègues', async () => {
    const prisma = world(ACCOUNTS, { [AUTHOR]: { circlePublicationPost: 'NOBODY' } });
    expect((await resolveEntourage(prisma, { ownerId: AUTHOR, key: 'circlePublicationPost' })).ids).toEqual([]);
  });

  it('un propriétaire ordinaire garde son entourage au lien réel', async () => {
    const { ids } = await resolveEntourage(world(), { ownerId: ORDINARY, key: 'circlePublicationPost' });
    expect(ids).not.toEqual(expect.arrayContaining([COLLEAGUE]));
  });
});
