/**
 * #4147 critère 3 — traduction à la demande : POST /posts/:postId/translate
 * (core.ts) et POST /posts/:postId/comments/:commentId/translate (comments.ts)
 * n'avaient AUCUN plafond avant ce lot, alors que chaque appel enfile un job
 * ZMQ coûteux vers le translator. Ce fichier prouve, avec le VRAI plugin
 * @fastify/rate-limit et le VRAI `preValidation` posant `authContext` :
 *
 *  - les DEUX routes portent 20/min · social:translate:{userId}, chacune sur
 *    son PROPRE budget (config.rateLimit ne peut pas les fusionner en un
 *    compteur inter-routes — cf. socialRateLimit.ts, en-tête ; ce que #4147
 *    critère 3 n'exige d'ailleurs pas : seul le SCHÉMA doit être partagé) ;
 *  - le témoin à DEUX comptes du critère 8 sur chaque route ;
 *  - le témoin de SCHÉMA du critère 8 : un `targetLanguage` absent ou
 *    non-chaîne rend 400 des DEUX côtés — la validation à la main de
 *    comments.ts (`typeof body.targetLanguage === 'string'`, max 5) a
 *    disparu au profit du même `TranslatePostSchema` (Zod, max 6) que le
 *    post. Le double de `routes/posts/types` que ce fichier NE POSE PAS
 *    (contrairement à posts-core.test.ts / posts-comments.test.ts) est
 *    volontaire : c'est le VRAI Zod qui doit trancher ce témoin, pas une
 *    imitation qui pourrait diverger du contrat réel (cf. la correction
 *    apportée au double de posts-comments.test.ts dans ce même lot).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';

// ─── Mocks de service ──────────────────────────────────────────────────────

const mockGetPostById = jest.fn<any>();
const mockTranslateOnDemand = jest.fn<any>().mockResolvedValue(undefined);
const mockTranslateCommentOnDemand = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

jest.mock('../../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({})),
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translateOnDemand: (...args: any[]) => mockTranslateOnDemand(...args),
      translateCommentOnDemand: (...args: any[]) => mockTranslateCommentOnDemand(...args),
    },
  },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (t: string) => t },
}));

// AUCUN mock de `routes/posts/types` (TranslatePostSchema doit être le VRAI
// Zod) et AUCUN mock de `middleware/rate-limiter` NI de `./socialRateLimit`
// — ce fichier existe pour exercer les VRAIES fabriques sous le VRAI plugin.

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerCommentRoutes } from '../../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const POST_ID = '507f1f77bcf86cd799439022';
const COMMENT_ID = '507f1f77bcf86cd799439033';
const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439099';

// ─── Harness ──────────────────────────────────────────────────────────────────

function makePreValidationAuth() {
  return async (req: FastifyRequest) => {
    const userId = (req.headers['x-test-user-id'] as string) || USER_A;
    (req as any).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId,
      displayName: 'Test User',
      userLanguage: 'fr',
      hasFullAccess: true,
      canSendMessages: true,
      registeredUser: { id: userId, role: 'USER', username: `user-${userId}` },
    };
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Audience PUBLIC des deux côtés — ce harnais porte sur le plafond et le
  // schéma, pas sur le droit de voir (déjà couvert par
  // comments-audience.test.ts / interactions-audience.test.ts).
  const publicAcl = { id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };
  const prisma = {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue(publicAcl),
      findFirst: jest.fn<any>().mockResolvedValue(publicAcl),
    },
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue({ postId: POST_ID, post: publicAcl }),
    },
  } as any;
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
  } as any);

  // Plugin RÉEL — `config.rateLimit` des DEUX routes translate en dépend.
  await app.register(rateLimit, { global: false });

  const requiredAuth = makePreValidationAuth();
  registerCoreRoutes(app, prisma, requiredAuth);
  registerCommentRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

function translatePost(app: FastifyInstance, userId: string, body: Record<string, unknown> = { targetLanguage: 'de' }) {
  return app.inject({
    method: 'POST',
    url: `/posts/${POST_ID}/translate`,
    headers: { 'x-test-user-id': userId },
    payload: body,
  });
}

function translateComment(app: FastifyInstance, userId: string, body: Record<string, unknown> = { targetLanguage: 'de' }) {
  return app.inject({
    method: 'POST',
    url: `/posts/${POST_ID}/comments/${COMMENT_ID}/translate`,
    headers: { 'x-test-user-id': userId },
    payload: body,
  });
}

beforeEach(() => {
  mockGetPostById.mockReset();
  mockGetPostById.mockResolvedValue({ id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC' });
  mockTranslateOnDemand.mockReset().mockResolvedValue(undefined);
  mockTranslateCommentOnDemand.mockReset().mockResolvedValue(undefined);
});

// ─── Plafond — critère 3, seau propre par route ───────────────────────────────

describe('POST /posts/:postId/translate — plafond #4147 critère 3 (social:translate)', () => {
  it('accepte les 20 premières demandes du compte A, refuse la 21e en 429 avec Retry-After, compte B non affecté', async () => {
    const app = await buildApp();

    for (let i = 0; i < 20; i += 1) {
      const res = await translatePost(app, USER_A);
      expect(res.statusCode).not.toBe(429);
    }
    const blocked = await translatePost(app, USER_A);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    // Témoin à deux comptes (critère 8) : un seau global ferait échouer B ici.
    const otherAccount = await translatePost(app, USER_B);
    expect(otherAccount.statusCode).not.toBe(429);

    expect(mockTranslateOnDemand).toHaveBeenCalledTimes(21);
    await app.close();
  });
});

describe('POST /posts/:postId/comments/:commentId/translate — plafond #4147 critère 3 (social:translate, budget PROPRE à cette route)', () => {
  it('accepte les 20 premières demandes du compte A, refuse la 21e en 429 avec Retry-After, compte B non affecté', async () => {
    const app = await buildApp();

    for (let i = 0; i < 20; i += 1) {
      const res = await translateComment(app, USER_A);
      expect(res.statusCode).not.toBe(429);
    }
    const blocked = await translateComment(app, USER_A);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    const otherAccount = await translateComment(app, USER_B);
    expect(otherAccount.statusCode).not.toBe(429);

    expect(mockTranslateCommentOnDemand).toHaveBeenCalledTimes(21);
    await app.close();
  });

  it('le budget de la route POST comme les 20 appels ci-dessus n\'entame PAS celui du commentaire — chaque route a son PROPRE plafond', async () => {
    const app = await buildApp();

    // Épuise le budget du POST /translate pour A.
    for (let i = 0; i < 21; i += 1) {
      await translatePost(app, USER_A);
    }
    const postBlocked = await translatePost(app, USER_A);
    expect(postBlocked.statusCode).toBe(429);

    // Le commentaire, MÊME compte, a encore la totalité de son budget : les
    // deux routes ne fusionnent PAS leur compteur (contrairement à
    // create/repost, dont le témoin dédié exige explicitement le partage).
    const commentStillOpen = await translateComment(app, USER_A);
    expect(commentStillOpen.statusCode).not.toBe(429);

    await app.close();
  });
});

// ─── Schéma partagé — critère 3 & témoin du critère 8 ─────────────────────────

describe('Les deux routes translate partagent le MÊME schéma Zod (#4147 critère 3, témoin critère 8)', () => {
  it('targetLanguage ABSENT rend 400 sur les DEUX routes', async () => {
    const app = await buildApp();

    const postRes = await translatePost(app, USER_A, {});
    expect(postRes.statusCode).toBe(400);

    const commentRes = await translateComment(app, USER_A, {});
    expect(commentRes.statusCode).toBe(400);

    await app.close();
  });

  it('targetLanguage NON-CHAÎNE (nombre) rend 400 sur les DEUX routes', async () => {
    const app = await buildApp();

    const postRes = await translatePost(app, USER_A, { targetLanguage: 42 });
    expect(postRes.statusCode).toBe(400);

    const commentRes = await translateComment(app, USER_A, { targetLanguage: 42 });
    expect(commentRes.statusCode).toBe(400);

    await app.close();
  });

  it('une langue régionalisée à 6 caractères — acceptée par le Zod partagé (.max(6)) — passe désormais aussi côté commentaire', async () => {
    // Avant #4147 : la validation à la main de comments.ts refusait tout au-delà
    // de 5 caractères (`length > 5`), alors que le post l'acceptait déjà
    // (`.max(6)`, SSOT `CommonSchemas.language`) — deux comportements pour un
    // même geste. C'est EXACTEMENT ce que « la validation à la main de
    // comments.ts:508 disparaît » (critère 3) corrige.
    const app = await buildApp();

    const res = await translateComment(app, USER_A, { targetLanguage: 'zh-Hant'.slice(0, 6) });
    expect(res.statusCode).toBe(200);

    await app.close();
  });

  it('force non-booléen (chaîne "true") rend 400 sur les DEUX routes — le Zod partagé exige un booléen', async () => {
    const app = await buildApp();

    const postRes = await translatePost(app, USER_A, { targetLanguage: 'es', force: 'true' });
    expect(postRes.statusCode).toBe(400);

    const commentRes = await translateComment(app, USER_A, { targetLanguage: 'es', force: 'true' });
    expect(commentRes.statusCode).toBe(400);

    await app.close();
  });
});
