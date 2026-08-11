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

type MockedPost = {
  id: string;
  authorId: string;
  repostOfId?: string | null;
  originalRepostOfId?: string | null;
};

const buildPrisma = (overrides: Partial<Record<string, unknown>> = {}) => {
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<MockedPost | null>>()
      .mockResolvedValue({ id: POST_A, authorId: 'author' }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  const postView = {
    findUnique: jest.fn<(arg?: unknown) => Promise<{ id: string; duration?: number | null } | null>>()
      .mockResolvedValue(null),
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

describe('PostService.recordView — watch-time (duration) monotone sur ré-ouverture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ré-ouverture plus courte : NE rétrograde PAS la durée (aucune écriture)', async () => {
    // L'utilisateur a regardé la story 30s (durée réelle), puis y retape et
    // swipe immédiatement (0.5s). Le PostView est un singleton (postId,userId)
    // — signal watch-time du moteur reco/monétisation (PostFeedService). Une
    // durée plus courte ne doit JAMAIS écraser la plus longue déjà observée ;
    // la valeur restant au max, aucune écriture Room redondante n'est émise.
    const { prisma, postView } = buildPrisma();
    postView.findUnique.mockResolvedValue({ id: 'v1', duration: 30_000 });
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1', 500);

    expect(counted).toBe(false);
    expect(postView.update).not.toHaveBeenCalled();
  });

  it('ré-ouverture plus longue : promeut la durée persistée', async () => {
    const { prisma, postView } = buildPrisma();
    postView.findUnique.mockResolvedValue({ id: 'v1', duration: 5_000 });
    const svc = makeService(prisma);

    await svc.recordView(POST_A, 'viewer-1', 42_000);

    expect(postView.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'v1' },
      data: { duration: 42_000 },
    }));
  });

  it('durée existante null : traite comme 0 et enregistre la nouvelle', async () => {
    const { prisma, postView } = buildPrisma();
    postView.findUnique.mockResolvedValue({ id: 'v1', duration: null });
    const svc = makeService(prisma);

    await svc.recordView(POST_A, 'viewer-1', 1_200);

    expect(postView.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'v1' },
      data: { duration: 1_200 },
    }));
  });
});

describe('PostService.recordView — crédit de la racine à travers un repost (chantier reposts cohérents, tâche 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const ROOT_ID = '507f1f77bcf86cd799439099';
  const INTERMEDIATE_ID = '507f1f77bcf86cd799439055';

  it('vue sur un repost direct : la racine reçoit +1 viewCount ET son propre PostView, le repost garde le sien', async () => {
    const { prisma, post, postView } = buildPrisma();
    post.findFirst
      .mockResolvedValueOnce({ id: POST_A, authorId: 'reposter', repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID })
      .mockResolvedValueOnce({ id: ROOT_ID, authorId: 'original-author' });
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1');

    expect(counted).toBe(true);
    expect(postView.create).toHaveBeenCalledWith({ data: { postId: POST_A, userId: 'viewer-1', duration: undefined } });
    expect(postView.create).toHaveBeenCalledWith({ data: { postId: ROOT_ID, userId: 'viewer-1', duration: undefined } });
    expect(post.update).toHaveBeenCalledWith({ where: { id: POST_A }, data: { viewCount: { increment: 1 } } });
    expect(post.update).toHaveBeenCalledWith({ where: { id: ROOT_ID }, data: { viewCount: { increment: 1 } } });
  });

  it("chaîne repost-de-repost : la RACINE (originalRepostOfId) est créditée, jamais le parent intermédiaire", async () => {
    const { prisma, post } = buildPrisma();
    post.findFirst
      .mockResolvedValueOnce({ id: POST_A, authorId: 'reposter-2', repostOfId: INTERMEDIATE_ID, originalRepostOfId: ROOT_ID })
      .mockResolvedValueOnce({ id: ROOT_ID, authorId: 'original-author' });
    const svc = makeService(prisma);

    await svc.recordView(POST_A, 'viewer-1');

    expect(post.update).toHaveBeenCalledWith({ where: { id: ROOT_ID }, data: { viewCount: { increment: 1 } } });
    expect(post.update).not.toHaveBeenCalledWith({ where: { id: INTERMEDIATE_ID }, data: { viewCount: { increment: 1 } } });
  });

  it("l'auteur de la racine visionnant un repost de son propre contenu ne gonfle pas son propre compteur (même garde que la ré-ouverture directe)", async () => {
    const { prisma, post, postView } = buildPrisma();
    post.findFirst
      .mockResolvedValueOnce({ id: POST_A, authorId: 'reposter', repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID })
      .mockResolvedValueOnce({ id: ROOT_ID, authorId: 'viewer-1' });
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1');

    expect(counted).toBe(true);
    expect(post.update).toHaveBeenCalledWith({ where: { id: POST_A }, data: { viewCount: { increment: 1 } } });
    expect(post.update).not.toHaveBeenCalledWith({ where: { id: ROOT_ID }, data: { viewCount: { increment: 1 } } });
    expect(postView.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ postId: ROOT_ID }) }));
  });

  it('racine introuvable (supprimée entre-temps) : la vue du repost reste comptée, pas de crash', async () => {
    const { prisma, post } = buildPrisma();
    post.findFirst
      .mockResolvedValueOnce({ id: POST_A, authorId: 'reposter', repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID })
      .mockResolvedValueOnce(null);
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1');

    expect(counted).toBe(true);
    expect(post.update).toHaveBeenCalledTimes(1);
    expect(post.update).toHaveBeenCalledWith({ where: { id: POST_A }, data: { viewCount: { increment: 1 } } });
  });

  it('vue sur un post non-repost : comportement inchangé — une seule résolution, aucun crédit de racine', async () => {
    const { prisma, post, postView } = buildPrisma();
    const svc = makeService(prisma);

    const counted = await svc.recordView(POST_A, 'viewer-1');

    expect(counted).toBe(true);
    expect(post.findFirst).toHaveBeenCalledTimes(1);
    expect(post.update).toHaveBeenCalledTimes(1);
    expect(postView.create).toHaveBeenCalledTimes(1);
  });
});
