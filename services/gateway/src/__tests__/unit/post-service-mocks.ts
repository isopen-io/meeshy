import { jest } from '@jest/globals';
import type { PostReactionService } from '../../services/PostReactionService';

// ---------------------------------------------------------------------------
// Fabriques de double Prisma/PostService partagées entre PostService.test.ts
// et les suites dérivées (ex: post-service-geo-discoverability.test.ts) —
// une seule définition, jamais une copie qui dériverait (#3637).
// ---------------------------------------------------------------------------

export function createMockPrisma() {
  const prisma: any = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    postComment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    commentReaction: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
      // `unlikeComment` lit la pile TRIÉE avant de retirer (2026-08-25) :
      // l'emoji demandé la restreint, son absence la laisse entière, et la tête
      // est la cible — c'est ce qui rend « retirer la DERNIÈRE posée » possible.
      // Défaut vide : sans cible, le retrait est un no-op idempotent.
      findMany: jest.fn().mockResolvedValue([]),
      // Plafond des cinq réactions (2026-08-20) : `PostCommentService.likeComment`
      // consulte `findFirst` (l'émoji est-il déjà posé ?) puis, si non, `count`
      // (place encore disponible ?) AVANT toute purge/upsert. Défauts « personne
      // n'a encore réagi » : ces tests veulent une création normale.
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    postBookmark: {
      upsert: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    postView: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    postImpression: {
      deleteMany: jest.fn(),
    },
    postMedia: {
      // `{ count }` par défaut : le code compare le nombre de médias
      // effectivement rattachés à celui demandé pour ne jamais écarter un
      // média en silence. Un mock qui rend `undefined` casserait sur `.count`.
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      findFirst: jest.fn(),
      // `[]` par défaut : la règle de composition REEL (`qualifiesAsReel`)
      // matérialise les mimeTypes des médias à classifier via findMany.
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
    },
    postReaction: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
    user: {
      // Consulté UNIQUEMENT quand `discoverabilityPrecision === 'EXACT'`
      // (#3637) — `null` par défaut : « date de naissance inconnue » est le
      // repli fail-closed de `isAdult()`, jamais une supposition de majorité.
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return prisma;
}

export function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-author',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello world',
    reactions: [],
    reactionSummary: {},
    reactionCount: 0,
    likeCount: 0,
    commentCount: 5,
    shareCount: 0,
    repostCount: 0,
    isPinned: false,
    deletedAt: null,
    ...overrides,
  };
}

export function createMockPostReactionService() {
  return {
    addReaction: jest.fn<PostReactionService['addReaction']>().mockResolvedValue({ id: 'rxn-1', postId: 'post-1', userId: 'user-liker', emoji: '❤️', createdAt: new Date(), updatedAt: new Date() }),
    removeReaction: jest.fn<PostReactionService['removeReaction']>().mockResolvedValue(true),
  } as unknown as PostReactionService;
}
