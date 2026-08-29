/**
 * POST /posts/:postId/repost — idempotence via clientMutationId (lot 7,
 * tâche 7.1 « les deux dettes SERVEUR que la file exige »).
 *
 * Contrairement à `interactions.test.ts`, ce fichier NE MOCKE PAS
 * `withMutationLog` : le point de ce test est de prouver que la route
 * l'enveloppe réellement, pas que la logique de dédup interne fonctionne
 * (déjà couverte, isolément, par `utils/withMutationLog.test.ts`). Un
 * `jest.mock('.../withMutationLog', ...)` ici rendrait toute la suite verte
 * que la route enveloppe ou non — c'est exactement le piège mesuré dans
 * `interactions.test.ts`/`core.test.ts`/`core-extended.test.ts`.
 *
 * `fastify.mutationLogService` est un FAUX en mémoire qui reproduit le
 * contrat réel de `MutationLogService.recordOrReturn` (Map keyed par
 * `userId|clientMutationId`, ligne écrite SEULEMENT après le succès de
 * `op()`) — suffisant pour prouver le câblage de la route sans dépendre
 * de Prisma.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { MutationLogDuplicate, MutationInFlight } from '../../../../services/MutationLogService';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let repostCounter = 0;
const mockRepostPost = jest.fn<any>();
// Rejeu (onDuplicate) : refetch par id. Sans elle, `withMutationLog` ne
// retrouve rien et retombe sur son filet de sécurité « rejoue op() » —
// masquant exactement le défaut que ce fichier existe pour prouver.
const mockGetPostById = jest.fn<any>((id: string) => Promise.resolve({ id, repostOfId: POST_ID, type: 'POST', authorId: USER_ID }));
const mockRepublishStory = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    repostPost: (...args: any[]) => mockRepostPost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    republishStory: (...args: any[]) => mockRepublishStory(...args),
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

// Délibérément AUCUN mock de `withMutationLog` — voir le doc-comment en tête.

// #4147 — POST /posts / from-attachment / repost tirent leur plafond de
// création d'un compteur PARTAGÉ qui lit Redis directement, fail-closed
// (createSharedWriteRateLimitPreHandler, routes/posts/socialRateLimit.ts) :
// sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
// (aucun REDIS_URL) et CHAQUE écriture de ce type serait refusée avant
// d'atteindre ce que ce fichier vérifie — détail complet dans core.test.ts,
// premier fichier de la série à le poser. `incr` répond toujours « premier
// appel » : ce fichier ne teste PAS le plafond (son témoin dédié vit dans
// social-write-rate-limit.test.ts) — juste un Redis DISPONIBLE.
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const CMID_A = 'cmid_550e8400-e29b-41d4-a716-446655440001';
const CMID_B = 'cmid_550e8400-e29b-41d4-a716-446655440002';

// ─── Fake MutationLogService (mirrors the real recordOrReturn contract) ──────

function makeFakeMutationLogService() {
  const store = new Map<string, { resultId: string | null; kind: string }>();
  const recordOrReturn = jest.fn(async ({ userId, clientMutationId, kind, op }: any) => {
    const key = `${userId}|${clientMutationId}`;
    const existing = store.get(key);
    if (existing) {
      throw new MutationLogDuplicate(existing.resultId, existing.kind);
    }
    // Comme la vraie classe : la ligne n'est écrite qu'APRÈS le succès de
    // op() — un op() qui rejette (404 métier) ne doit RIEN persister, pour
    // que le même cmid puisse être rejoué.
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

async function buildApp(): Promise<{
  app: FastifyInstance;
  mutationLogService: ReturnType<typeof makeFakeMutationLogService>;
  broadcastPostReposted: jest.Mock<any>;
  createPostRepostNotification: jest.Mock<any>;
  broadcastStoryCreated: jest.Mock<any>;
}> {
  const prisma = {} as any;
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);

  // Les DEUX effets de bord qui voyagent AVEC la republication. Les laisser
  // à `null`/absents (ce que faisait la première version de ce fichier) rend
  // les gardes `if (socialEvents)` / `if (notifService)` inertes : la suite
  // passe alors au vert sans pouvoir observer un double envoi.
  const broadcastPostReposted = jest.fn<any>().mockResolvedValue(undefined);
  const createPostRepostNotification = jest.fn<any>().mockResolvedValue(null);
  const broadcastStoryCreated = jest.fn<any>().mockResolvedValue(undefined);
  app.decorate('socialEvents', { broadcastPostReposted, broadcastStoryCreated } as any);
  app.decorate('notificationService', { createPostRepostNotification } as any);

  // Topologie réelle : le hook cmid est enregistré AVANT les routes, comme
  // dans `server.ts`.
  registerClientMutationIdHook(app);

  const mutationLogService = makeFakeMutationLogService();
  app.decorate('mutationLogService', mutationLogService as any);

  const requiredAuth = makePreValidationAuth();
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return { app, mutationLogService, broadcastPostReposted, createPostRepostNotification, broadcastStoryCreated };
}

async function repost(app: FastifyInstance, cmid?: string, payload: Record<string, unknown> = { isQuote: false }) {
  return app.inject({
    method: 'POST',
    url: `/posts/${POST_ID}/repost`,
    headers: cmid ? { 'x-client-mutation-id': cmid } : {},
    payload,
  });
}

beforeEach(() => {
  repostCounter = 0;
  mockRepublishStory.mockReset();
  mockRepublishStory.mockImplementation(async (postId: string) => ({ id: postId, type: 'STORY', authorId: USER_ID }));
  mockGetPostById.mockReset();
  mockGetPostById.mockImplementation((id: string) => Promise.resolve({ id, repostOfId: POST_ID, type: 'POST', authorId: USER_ID }));
  mockRepostPost.mockReset();
  mockRepostPost.mockImplementation(async (postId: string, userId: string) => {
    repostCounter += 1;
    return { id: `repost-${repostCounter}`, repostOfId: postId, type: 'POST', authorId: userId };
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /posts/:postId/repost — idempotence via clientMutationId', () => {
  it('le même cmid rejoué ne crée pas un second repost — repostPost appelé UNE fois, même id', async () => {
    const { app } = await buildApp();

    const res1 = await repost(app, CMID_A);
    const res2 = await repost(app, CMID_A);

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(mockRepostPost).toHaveBeenCalledTimes(1);
    expect(res1.json().data.id).toBe(res2.json().data.id);

    await app.close();
  });

  it('deux cmid différents créent deux reposts distincts', async () => {
    const { app } = await buildApp();

    const res1 = await repost(app, CMID_A);
    const res2 = await repost(app, CMID_B);

    expect(mockRepostPost).toHaveBeenCalledTimes(2);
    expect(res1.json().data.id).not.toBe(res2.json().data.id);

    await app.close();
  });

  it('sans en-tête X-Client-Mutation-Id, le comportement legacy est inchangé : aucune dédup', async () => {
    const { app, mutationLogService } = await buildApp();

    const res1 = await repost(app, undefined);
    const res2 = await repost(app, undefined);

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(mockRepostPost).toHaveBeenCalledTimes(2);
    expect(mutationLogService.recordOrReturn).not.toHaveBeenCalled();

    await app.close();
  });

  it('un repostPost qui rend null (404) ne persiste AUCUNE ligne — le même cmid peut être rejoué', async () => {
    const { app } = await buildApp();
    mockRepostPost.mockResolvedValueOnce(null);

    const res1 = await repost(app, CMID_A);
    expect(res1.statusCode).toBe(404);

    // Rejeu du MÊME cmid : op() doit ré-exécuter, pas rester bloqué sur un
    // 404 fantôme — aucune ligne n'a été écrite après l'échec.
    const res2 = await repost(app, CMID_A);
    expect(res2.statusCode).toBe(201);

    expect(mockRepostPost).toHaveBeenCalledTimes(2);
    await app.close();
  });

  // ── La COURSE, vue de la route ─────────────────────────────────────────────
  //
  // Quand une requête jumelle applique DÉJÀ ce cmid, il n'y a ni résultat à
  // resservir ni op à rejouer : `MutationLogService` lève `MutationInFlight`.
  // 409 est le seul verdict juste — et c'est précisément le code que la file
  // durable iOS EXCLUT de `permanentRejectionStatusCodes` : elle réessaiera,
  // ce qui est ce qu'on veut. Sans ce traitement, la route rendait 500 : un
  // « le serveur est cassé » pour une situation parfaitement saine.

  it('une requête jumelle EN VOL rend 409, jamais 500 ni un second repost', async () => {
    const { app, mutationLogService } = await buildApp();
    mutationLogService.recordOrReturn.mockImplementationOnce(async () => {
      throw new MutationInFlight('repostPost');
    });

    const res = await repost(app, CMID_A);

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MUTATION_IN_FLIGHT');
    expect(mockRepostPost).not.toHaveBeenCalled();

    await app.close();
  });

  // ── Ce qui voyage AVEC la republication ────────────────────────────────────
  //
  // Le verrou d'idempotence ne vaut que pour ce qu'il ENVELOPPE. La création
  // du Post n'est pas seule à partir : un `post:reposted` est diffusé et une
  // notification est écrite pour l'auteur de l'original. Ces deux-là vivaient
  // APRÈS `withMutationLog`, inconditionnellement — un rejeu rendait donc le
  // MÊME repost tout en refanant l'annonce et en écrivant une SECONDE ligne
  // `Notification` (`createNotification` fait un `prisma.notification.create`
  // sec, sans clé d'idempotence). L'auteur recevait deux bannières pour un
  // repost unique : le symptôme visé survivait une couche plus bas.

  it('un repost FRAIS diffuse une fois et notifie une fois (non-régression)', async () => {
    const { app, broadcastPostReposted, createPostRepostNotification } = await buildApp();

    await repost(app, CMID_A);

    expect(broadcastPostReposted).toHaveBeenCalledTimes(1);
    expect(createPostRepostNotification).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('le REJEU du même cmid ne rediffuse PAS post:reposted et ne renotifie PAS l\'auteur', async () => {
    const { app, broadcastPostReposted, createPostRepostNotification } = await buildApp();

    const res1 = await repost(app, CMID_A);
    const res2 = await repost(app, CMID_A);

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(mockRepostPost).toHaveBeenCalledTimes(1);
    expect(broadcastPostReposted).toHaveBeenCalledTimes(1);
    expect(createPostRepostNotification).toHaveBeenCalledTimes(1);

    await app.close();
  });

  // ── Le rejeu d'un résultat DISPARU ─────────────────────────────────────────
  //
  // `withMutationLog` avait un filet : si `onDuplicate` ne retrouve rien, il
  // rejoue `op()`. Ce filet suppose une op « naturellement idempotente au
  // niveau du stockage » (sa propre doc). `repostPost` est un
  // `prisma.post.create` : le rejouer FABRIQUE un second repost. Chemin réel :
  // ligne d'outbox reclaim ée après 30 min alors que l'auteur a entre-temps
  // supprimé son repost — le repost SUPPRIMÉ renaissait sous un id neuf.

  it('un rejeu dont le repost a été supprimé ne fabrique PAS un second repost', async () => {
    const { app, broadcastPostReposted, createPostRepostNotification } = await buildApp();

    const res1 = await repost(app, CMID_A);
    expect(res1.statusCode).toBe(201);

    // L'auteur supprime son repost : `getPostById(repost-1)` ne rend plus rien
    // (`deletedAt: NOT_DELETED` le filtre). L'ORIGINAL, lui, reste lisible.
    mockGetPostById.mockImplementation((id: string) =>
      Promise.resolve(id === POST_ID ? { id, repostOfId: null, type: 'POST', authorId: USER_ID } : null),
    );

    const res2 = await repost(app, CMID_A);

    expect(mockRepostPost).toHaveBeenCalledTimes(1);
    expect(res2.statusCode).toBe(410);
    expect(res2.json().code).toBe('MUTATION_RESULT_GONE');
    expect(broadcastPostReposted).toHaveBeenCalledTimes(1);
    expect(createPostRepostNotification).toHaveBeenCalledTimes(1);

    await app.close();
  });

  // ── Loi 5 : le format ne se perd pas en silence ────────────────────────────
  //
  // `RepostSchema.safeParse(...)` retombait sur `{ isQuote: false }` en cas
  // d'échec, ce qui jette D'UN COUP `targetType`, `content` et `visibility` —
  // puis le service applique son repli `?? PostType.POST`. Une citation de
  // 5001 caractères, ou un `targetType` hors énumération, transformait donc
  // une source éphémère en post permanent, SANS le moindre signal. C'est
  // exactement le repli que `RepostPostPayload.targetType` (obligatoire dans
  // la file durable) existe pour interdire.

  it('un corps invalide est REFUSÉ (400), jamais dégradé en repost POST silencieux', async () => {
    const { app } = await buildApp();

    const res = await repost(app, undefined, { isQuote: true, content: 'x'.repeat(5001), targetType: 'STORY' });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    expect(mockRepostPost).not.toHaveBeenCalled();

    await app.close();
  });

  it('un targetType hors énumération est REFUSÉ — il ne retombe pas sur POST', async () => {
    const { app } = await buildApp();

    const res = await repost(app, undefined, { isQuote: false, targetType: 'MOOD' });

    expect(res.statusCode).toBe(400);
    expect(mockRepostPost).not.toHaveBeenCalled();

    await app.close();
  });

  it('un corps VALIDE porte son targetType jusqu au service (Loi 5)', async () => {
    const { app } = await buildApp();

    const res = await repost(app, undefined, { isQuote: false, targetType: 'STORY', visibility: 'FRIENDS' });

    expect(res.statusCode).toBe(201);
    expect(mockRepostPost).toHaveBeenCalledWith(
      POST_ID,
      USER_ID,
      expect.objectContaining({ targetType: 'STORY', visibility: 'FRIENDS' }),
    );

    await app.close();
  });

  it("le `kind` enregistré vaut exactement 'repostPost' (doit matcher iOS OutboxKind)", async () => {
    const { app, mutationLogService } = await buildApp();

    await repost(app, CMID_A);

    expect(mutationLogService.recordOrReturn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'repostPost' }),
    );

    await app.close();
  });
});

// ─── Mécanisme 2 de la chaîne du repost : la REPUBLICATION ───────────────────
//
// `POST /posts/:postId/republish` ne CRÉE rien : il fait repartir la MÊME
// ligne avec une date fraîche. Ce que son rejeu coûte n'est donc pas un
// doublon — c'est une DESTRUCTION. `PostService.republishStory` supprime
// `postView` / `postReaction` / `postImpression` et remet SEPT compteurs à
// zéro. Rejouer après un timeout de réponse détruit une SECONDE fois
// l'engagement acquis entre les deux appels, et refanne `story:created`.
//
// La remise à zéro est un choix produit ; sa RÉPÉTITION sur un aléa réseau
// n'en est pas un. C'est le seul des trois mécanismes de la chaîne dont le
// rejeu détruit des données — et c'était le seul sans verrou.

describe('POST /posts/:postId/republish — le rejeu ne redétruit pas l\'engagement', () => {
  it('le même cmid rejoué republie UNE fois et ne refanne pas story:created', async () => {
    const { app, broadcastStoryCreated } = await buildApp();

    const res1 = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish`, headers: { 'x-client-mutation-id': CMID_A } });
    const res2 = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish`, headers: { 'x-client-mutation-id': CMID_A } });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(mockRepublishStory).toHaveBeenCalledTimes(1);
    expect(broadcastStoryCreated).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('sans cmid, le comportement legacy est inchangé', async () => {
    const { app } = await buildApp();

    await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish` });
    await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish` });

    expect(mockRepublishStory).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('un rejeu dont la story a disparu rend 410, il ne la republie pas une seconde fois', async () => {
    const { app } = await buildApp();

    const res1 = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish`, headers: { 'x-client-mutation-id': CMID_B } });
    expect(res1.statusCode).toBe(200);

    mockGetPostById.mockImplementation(() => Promise.resolve(null));
    const res2 = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish`, headers: { 'x-client-mutation-id': CMID_B } });

    expect(res2.statusCode).toBe(410);
    expect(res2.json().code).toBe('MUTATION_RESULT_GONE');
    expect(mockRepublishStory).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('une story introuvable reste un 404 et ne consomme PAS le cmid', async () => {
    const { app } = await buildApp();
    mockRepublishStory.mockResolvedValueOnce(null);

    const res1 = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish`, headers: { 'x-client-mutation-id': CMID_A } });
    expect(res1.statusCode).toBe(404);

    const res2 = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish`, headers: { 'x-client-mutation-id': CMID_A } });
    expect(res2.statusCode).toBe(200);

    await app.close();
  });
});
