/**
 * Tests — PostService.getPostInteractions : la réaction affichée dans le panneau
 * « vues + réactions » de l'auteur dérive de la table `PostReaction` (SSOT),
 * PAS du JSON legacy `post.reactions`.
 *
 * Contexte : `post.reactions` (blob JSON dénormalisé) n'est écrit que par
 * `likePost`/`unlikePost` (chemin REST). Le chemin socket
 * (`PostReactionService.addReaction`, câblé sur `post:reaction-add`) écrit la
 * ligne `PostReaction` + `reactionSummary`/`reactionCount`/`likeCount`, jamais
 * `post.reactions`. `enrichWithLikeStatus` (PostFeedService) a déjà migré vers la
 * table pour cette raison exacte ; `getPostInteractions` était le dernier
 * consommateur resté sur le JSON stale → toute réaction posée via socket
 * s'affichait `reaction: null` dans le panneau de l'auteur.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockLog = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => mockLog),
  },
}));

import { PostService } from '../services/PostService';

const POST_A = '507f1f77bcf86cd799439011';
const AUTHOR = 'author-1';
const VIEWER = 'viewer-1';

type ViewRow = {
  user: { id: string; username: string; displayName: string | null; avatar: string | null };
  viewedAt: Date;
};

const buildPrisma = (opts: {
  postReactions?: Array<{ userId: string; emoji: string }>;
  legacyReactions?: unknown;
  views?: ViewRow[];
} = {}) => {
  const views: ViewRow[] = opts.views ?? [
    {
      user: { id: VIEWER, username: 'vera', displayName: 'Vera', avatar: null },
      viewedAt: new Date('2026-07-10T10:00:00Z'),
    },
  ];
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<Record<string, unknown> | null>>()
      .mockResolvedValue({ id: POST_A, authorId: AUTHOR, reactions: opts.legacyReactions ?? null }),
  };
  const postView = {
    findMany: jest.fn<(arg?: unknown) => Promise<ViewRow[]>>().mockResolvedValue(views),
    count: jest.fn<(arg?: unknown) => Promise<number>>().mockResolvedValue(views.length),
  };
  const postReaction = {
    findMany: jest.fn<(arg?: unknown) => Promise<Array<{ userId: string; emoji: string }>>>()
      .mockResolvedValue(opts.postReactions ?? []),
  };
  const prisma = { post, postView, postReaction };
  return { prisma, post, postView, postReaction };
};

const makeService = (prisma: unknown) => new PostService(prisma as never);

describe('PostService.getPostInteractions — source des réactions = table PostReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('réaction posée via socket (ligne PostReaction, post.reactions vide) → surfacée dans viewers', async () => {
    const { prisma } = buildPrisma({
      postReactions: [{ userId: VIEWER, emoji: '👍' }],
      legacyReactions: null,
    });
    const svc = makeService(prisma);

    const result = await svc.getPostInteractions(POST_A, AUTHOR);

    expect(result?.viewers[0]).toEqual(
      expect.objectContaining({ id: VIEWER, reaction: '👍' }),
    );
  });

  it('JSON legacy stale ignoré : la table PostReaction fait autorité', async () => {
    // La réaction socket a été retirée (aucune ligne PostReaction), mais le JSON
    // legacy garde un 😍 fantôme jamais nettoyé par le chemin socket.
    const { prisma } = buildPrisma({
      postReactions: [],
      legacyReactions: [{ userId: VIEWER, emoji: '😍' }],
    });
    const svc = makeService(prisma);

    const result = await svc.getPostInteractions(POST_A, AUTHOR);

    expect(result?.viewers[0].reaction).toBeNull();
  });

  it('viewer sans réaction → reaction: null', async () => {
    const { prisma } = buildPrisma({ postReactions: [] });
    const svc = makeService(prisma);

    const result = await svc.getPostInteractions(POST_A, AUTHOR);

    expect(result?.viewers[0].reaction).toBeNull();
  });
});
