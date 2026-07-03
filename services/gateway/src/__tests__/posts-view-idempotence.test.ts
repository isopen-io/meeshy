/**
 * Tests — PostService.recordView : idempotence sous course + logging des
 * échecs réels (P7-2).
 *
 * Contexte prod : `prisma:error Unique constraint failed on
 * PostView_postId_userId_key` (~1×/6h) = course double-submit sur le
 * check-then-insert. Vérif adversariale : le catch externe gérait DÉJÀ le
 * P2002 (retour false, compteurs exacts, pas de 500) — la prémisse « 500 »
 * est réfutée. Les vrais défauts : (a) une erreur DB RÉELLE (Mongo down)
 * était avalée en silence par le même catch nu ; (b) le P2002 attendu et la
 * panne réelle étaient indistinguables en observabilité.
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

const p2002 = () => {
  const err = new Error('Unique constraint failed on the constraint: `PostView_postId_userId_key`');
  (err as Error & { code: string }).code = 'P2002';
  return err;
};

const buildPrisma = (overrides: Partial<Record<string, unknown>> = {}) => {
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<{ id: string; authorId: string } | null>>()
      .mockResolvedValue({ id: POST_A, authorId: 'author' }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  const postView = {
    findUnique: jest.fn<(arg?: unknown) => Promise<{ id: string } | null>>().mockResolvedValue(null),
    create: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({ id: 'v1' }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  const prisma = { post, postView, ...overrides };
  return { prisma, post, postView };
};

const makeService = (prisma: unknown) => {
  const svc = new PostService(prisma as never);
  // buildVisibilityFilter fait des requêtes annexes (communautés, amis) —
  // hors sujet ici : on le court-circuite pour isoler le chemin view.
  (svc as unknown as { buildVisibilityFilter: () => Promise<object> }).buildVisibilityFilter =
    async () => ({});
  return svc;
};

describe('PostService.recordView — course P2002 + observabilité', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('course double-submit : P2002 au create → false, viewCount NON incrémenté, pas de log d’erreur', async () => {
    const { prisma, post, postView } = buildPrisma();
    postView.create.mockRejectedValue(p2002());
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1');

    expect(counted).toBe(false);
    expect(post.update).not.toHaveBeenCalled();
    // Dédup ATTENDUE sous course — ne doit pas polluer les logs d'erreur.
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('panne DB réelle (non-P2002) → false ET loggée (jamais avalée en silence)', async () => {
    const { prisma, postView } = buildPrisma();
    postView.create.mockRejectedValue(new Error('MongoServerSelectionError: connection timed out'));
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1');

    expect(counted).toBe(false);
    expect(mockLog.warn).toHaveBeenCalled();
  });

  it('happy path : premier view → true + viewCount incrémenté', async () => {
    const { prisma, post } = buildPrisma();
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1');

    expect(counted).toBe(true);
    expect(post.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { viewCount: { increment: 1 } },
    }));
  });
});
