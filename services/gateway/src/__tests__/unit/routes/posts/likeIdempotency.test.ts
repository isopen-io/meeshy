/**
 * POST /posts/:postId/like — CE QUI VOYAGE AVEC LE LIKE (#6293).
 *
 * Jumeau de `repostIdempotency.test.ts`, pour la même raison et sur la même
 * couture. Comme lui, ce fichier **NE MOCKE PAS** `withMutationLog` : le point
 * est de prouver que la route garde ses effets de bord au REJEU, et un
 * `jest.mock('.../withMutationLog', ({ op }) => op())` — ce que fait
 * `interactions.harness.ts` — rendrait la suite verte que la route les garde ou
 * non. C'est exactement l'angle mort que la dette nommée dans
 * `interactions.ts` désignait : « sa suite de tests mocke le helper ».
 *
 * CE QUE LA ROUTE PROMETTAIT ET NE TENAIT PAS. Son commentaire annonçait « so
 * replays don't double-fire notifications ». Le verrou ne garde que ce qu'il
 * ENVELOPPE : la diffusion (`broadcastPostLiked` / `broadcastStoryReacted` /
 * `broadcastStatusReacted`) et `createPostLikeNotification` vivaient APRÈS lui,
 * conditionnées par la seule présence de l'auteur. Un rejeu — ce que fait toute
 * file de reprise hors ligne avec le même `X-Client-Mutation-Id` — renvoyait
 * donc une SECONDE bannière à l'auteur (`createNotification` fait un
 * `prisma.notification.create` sec, sans clé d'idempotence) et une seconde
 * diffusion à son audience.
 *
 * LA ROUTE JUMELLE MONTRAIT DÉJÀ LA FORME : `DELETE /posts/:postId/like` garde
 * sa diffusion sur `removedEmoji`, qui vaut `null` au rejeu (`interactions.ts`
 * § « Rien retiré ⇒ rien annoncé »). Le défaut était confiné au POST.
 *
 * `fastify.mutationLogService` est un FAUX en mémoire qui reproduit le contrat
 * réel de `MutationLogService.recordOrReturn` (Map par `userId|cmid`, ligne
 * écrite SEULEMENT après le succès de `op()`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { MutationLogDuplicate } from '../../../../services/MutationLogService';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const AUTHOR_ID = 'author-1';
const CMID_A = 'cmid_550e8400-e29b-41d4-a716-446655440001';
const CMID_B = 'cmid_550e8400-e29b-41d4-a716-446655440002';

let likeCounter = 0;
const mockLikePost = jest.fn<any>();
// Le rejeu (`onDuplicate`) relit le post par id. Sans ce double,
// `withMutationLog` ne retrouve rien et retombe sur son filet « rejoue op() »,
// ce qui masquerait le défaut que ce fichier existe pour prouver.
const mockGetPostById = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));

// Délibérément AUCUN mock de `withMutationLog` — voir le doc-comment en tête.

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Faux MutationLogService (miroir du contrat réel) ─────────────────────────

function makeFakeMutationLogService() {
  const store = new Map<string, { resultId: string | null; kind: string }>();
  const recordOrReturn = jest.fn(async ({ userId, clientMutationId, kind, op }: any) => {
    const key = `${userId}|${clientMutationId}`;
    const existing = store.get(key);
    if (existing) throw new MutationLogDuplicate(existing.resultId, existing.kind);
    // Comme la vraie classe : la ligne n'est écrite qu'APRÈS le succès de op().
    const result = await op();
    store.set(key, { resultId: result.id, kind });
    return result;
  });
  return { recordOrReturn, store };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth() {
  return async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  };
}

/** La tranche ACL que `resolveInteractionTarget` lit — avec son `id`, sans
 *  lequel la cible résolue n'a pas d'identité et la route 404. */
const publicAcl = (id: string) => ({
  id,
  authorId: AUTHOR_ID,
  visibility: 'PUBLIC',
  visibilityUserIds: [] as string[],
  expiresAt: null,
  isQuote: false,
  repostOfId: null,
});

async function buildApp() {
  const prisma = {
    post: {
      findFirst: jest.fn<any>().mockImplementation(({ where }: any) => Promise.resolve(publicAcl(where.id ?? POST_ID))),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  } as any;

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);

  // Les DEUX effets de bord qui voyagent AVEC le like. Les laisser absents
  // rendrait les gardes `if (socialEvents)` / `if (notifService)` inertes : la
  // suite passerait au vert sans pouvoir observer un double envoi.
  const broadcastPostLiked = jest.fn<any>().mockResolvedValue(undefined);
  const broadcastStoryReacted = jest.fn<any>().mockResolvedValue(undefined);
  const broadcastStatusReacted = jest.fn<any>().mockResolvedValue(undefined);
  const createPostLikeNotification = jest.fn<any>().mockResolvedValue(undefined);
  app.decorate('socialEvents', { broadcastPostLiked, broadcastStoryReacted, broadcastStatusReacted } as any);
  app.decorate('notificationService', { createPostLikeNotification } as any);

  // Topologie réelle : le hook cmid est enregistré AVANT les routes.
  registerClientMutationIdHook(app);

  const mutationLogService = makeFakeMutationLogService();
  app.decorate('mutationLogService', mutationLogService as any);

  registerInteractionRoutes(app, prisma, makePreValidationAuth());
  await app.ready();
  return { app, mutationLogService, broadcastPostLiked, broadcastStoryReacted, broadcastStatusReacted, createPostLikeNotification };
}

async function like(app: FastifyInstance, cmid?: string, payload: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: `/posts/${POST_ID}/like`,
    headers: cmid ? { 'x-client-mutation-id': cmid } : {},
    payload,
  });
}

const likedPost = (type: string) => ({
  id: POST_ID,
  type,
  authorId: AUTHOR_ID,
  likeCount: 1,
  reactionSummary: { '❤️': 1 },
  content: 'bonjour',
  createdAt: new Date('2026-09-13T00:00:00Z'),
  expiresAt: null,
});

beforeEach(() => {
  likeCounter = 0;
  mockLikePost.mockReset();
  mockLikePost.mockImplementation(async () => {
    likeCounter += 1;
    return likedPost('POST');
  });
  mockGetPostById.mockReset();
  mockGetPostById.mockImplementation(async () => likedPost('POST'));
});

// ─── Témoins ──────────────────────────────────────────────────────────────────

describe('POST /posts/:postId/like — ce qui voyage AVEC le like (#6293)', () => {
  it('un like FRAIS diffuse une fois et notifie une fois (non-régression)', async () => {
    const { app, broadcastPostLiked, createPostLikeNotification } = await buildApp();

    const res = await like(app, CMID_A);

    expect(res.statusCode).toBe(200);
    expect(broadcastPostLiked).toHaveBeenCalledTimes(1);
    expect(createPostLikeNotification).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('le REJEU du même cmid ne rediffuse PAS post:liked et ne renotifie PAS l\'auteur', async () => {
    const { app, broadcastPostLiked, createPostLikeNotification } = await buildApp();

    const res1 = await like(app, CMID_A);
    const res2 = await like(app, CMID_A);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    // `likePost` n'a tourné qu'une fois : le verrou fait son travail sur l'op.
    expect(likeCounter).toBe(1);
    // Et les DEUX effets de bord n'ont PAS été refaits — c'est le sujet.
    expect(broadcastPostLiked).toHaveBeenCalledTimes(1);
    expect(createPostLikeNotification).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('le rejeu d\'un like sur une STORY ne rediffuse pas story:reacted', async () => {
    const { app, broadcastStoryReacted } = await buildApp();
    mockLikePost.mockImplementation(async () => {
      likeCounter += 1;
      return likedPost('STORY');
    });
    mockGetPostById.mockImplementation(async () => likedPost('STORY'));

    await like(app, CMID_A);
    await like(app, CMID_A);

    expect(likeCounter).toBe(1);
    expect(broadcastStoryReacted).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('le rejeu d\'un like sur un STATUS ne rediffuse pas status:reacted', async () => {
    const { app, broadcastStatusReacted } = await buildApp();
    mockLikePost.mockImplementation(async () => {
      likeCounter += 1;
      return likedPost('STATUS');
    });
    mockGetPostById.mockImplementation(async () => likedPost('STATUS'));

    await like(app, CMID_A);
    await like(app, CMID_A);

    expect(likeCounter).toBe(1);
    expect(broadcastStatusReacted).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('deux cmid DIFFÉRENTS sont deux gestes : deux diffusions, deux notifications', async () => {
    const { app, broadcastPostLiked, createPostLikeNotification } = await buildApp();

    await like(app, CMID_A);
    await like(app, CMID_B);

    expect(likeCounter).toBe(2);
    expect(broadcastPostLiked).toHaveBeenCalledTimes(2);
    expect(createPostLikeNotification).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('sans en-tête X-Client-Mutation-Id, le comportement legacy est inchangé', async () => {
    const { app, mutationLogService, broadcastPostLiked } = await buildApp();

    await like(app, undefined);
    await like(app, undefined);

    expect(likeCounter).toBe(2);
    expect(broadcastPostLiked).toHaveBeenCalledTimes(2);
    expect(mutationLogService.recordOrReturn).not.toHaveBeenCalled();

    await app.close();
  });

  it('un like sur un post introuvable reste 404 et ne consomme PAS le cmid', async () => {
    const { app } = await buildApp();
    mockLikePost.mockResolvedValueOnce(null);

    const res1 = await like(app, CMID_A);
    expect(res1.statusCode).toBe(404);

    // Aucune ligne écrite après l'échec : le même cmid se rejoue.
    const res2 = await like(app, CMID_A);
    expect(res2.statusCode).toBe(200);

    await app.close();
  });

  // Les deux témoins qui suivent reprennent l'intention de ceux qui vivaient
  // dans `interactions2.test.ts` § « withMutationLog onDuplicate path ». Là-bas
  // ils pilotaient le helper MOCKÉ — donc ils mesuraient la fiction du harnais.
  // Ici le rejeu est réel : c'est le faux `MutationLogService` qui lève
  // `MutationLogDuplicate`, et `onDuplicate` est appelé par le VRAI helper.

  it('le rejeu passe bien par onDuplicate : getPostById est relu avec (postId, userId)', async () => {
    const { app } = await buildApp();

    await like(app, CMID_A);
    expect(mockGetPostById).not.toHaveBeenCalled();

    await like(app, CMID_A);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);

    await app.close();
  });

  it('un rejeu dont le post est devenu illisible retombe sur le filet « converges » et rend 404', async () => {
    const { app, broadcastPostLiked, createPostLikeNotification } = await buildApp();

    await like(app, CMID_A);

    // Le post a disparu entre les deux appels : `onDuplicate` ne peut rien
    // resservir, et `replayCost: 'converges'` autorise le helper à rejouer
    // `op()`. Ce rejeu constate à son tour la disparition et rend 404 — la
    // seule réponse honnête, et surtout AUCUN second effet de bord.
    mockGetPostById.mockResolvedValue(null);
    mockLikePost.mockResolvedValue(null);

    const res2 = await like(app, CMID_A);

    expect(res2.statusCode).toBe(404);
    expect(broadcastPostLiked).toHaveBeenCalledTimes(1);
    expect(createPostLikeNotification).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("le `kind` enregistré vaut exactement 'toggleLikePost' (doit matcher iOS OutboxKind)", async () => {
    const { app, mutationLogService } = await buildApp();

    await like(app, CMID_A);

    expect(mutationLogService.recordOrReturn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'toggleLikePost' }),
    );

    await app.close();
  });
});
