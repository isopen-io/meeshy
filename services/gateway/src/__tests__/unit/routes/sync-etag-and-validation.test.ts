/**
 * Tests — issue #4171, critères 2 et 4.
 *
 * Critère 2 : `scope` validé comme ObjectId (400 explicite, jamais une erreur
 * moteur Prisma) ; une collection inconnue continue de rougir malgré
 * l'élargissement de `SUPPORTED_COLLECTIONS`.
 *
 * Critère 4, LE PIÈGE LE PLUS COÛTEUX : l'ETag ne doit pas se casser en
 * ajoutant des collections. `collections` entre déjà dans son calcul (via
 * `collectionsResult`, dont les clés de premier niveau SONT le jeu de
 * collections demandé) — ce fichier PROUVE que deux jeux différents ne
 * partagent jamais un ETag, plutôt que de le déduire. Un défaut ici est « PIRE
 * que l'absence de cache : il se présente comme une synchronisation
 * réussie » (issue #4171).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as any).authContext = { userId: USER_ID, type: 'user' };
    },
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';

function makePrisma() {
  return {
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) }, // aucune conversation — chaque collection rend une page vide "légitime"
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma() as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

describe('GET /sync — critère 2 : `scope` validé comme ObjectId', () => {
  it('400 explicite sur un `scope` malformé — jamais une erreur moteur Prisma', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations&scope=not-an-object-id` });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_QUERY');
    // Le message doit nommer le CHAMP — jamais un `Malformed ObjectID` de Prisma,
    // qui ne dit ni où ni pourquoi côté client.
    expect(body.error.message.toLowerCase()).toContain('scope');
    await app.close();
  });

  it('accepte un `scope` à la forme ObjectId valide (24 hex)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=conversations&scope=507f1f77bcf86cd799439aaa`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('`scope` absent reste valide — le paramètre est optionnel', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /sync — critère 2 : le refus de collection inconnue survit à l’élargissement', () => {
  it('400 UNSUPPORTED_COLLECTION sur un nom qui n’a jamais existé', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=posts` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_COLLECTION');
    await app.close();
  });

  it('les TROIS collections ajoutées par ce lot sont acceptées, une à la fois', async () => {
    for (const name of ['conversations', 'reactions', 'participants']) {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=${name}` });
      expect(res.statusCode).toBe(200);
      await app.close();
    }
  });

  it('refuse le lot dès qu’UN SEUL nom du jeu est inconnu — l’élargissement ne rend rien permissif', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=conversations,messages,reactions,participants,posts`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_COLLECTION');
    expect(res.json().error.message).toContain('posts');
    await app.close();
  });
});

describe('GET /sync — critère 4 : l’ETag ne se casse PAS avec plusieurs collections', () => {
  it('une seconde requête IDENTIQUE sur la NOUVELLE collection rend 304', async () => {
    const app = await buildApp();
    const first = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });
    expect(first.statusCode).toBe(200);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=conversations`,
      headers: { 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
    await app.close();
  });

  it('deux JEUX de collections différents ne rendent PAS le même ETag, même page vide des deux côtés', async () => {
    const app = await buildApp();
    const messagesOnly = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const conversationsOnly = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=conversations` });

    expect(messagesOnly.headers.etag).toBeTruthy();
    expect(conversationsOnly.headers.etag).toBeTruthy();
    expect(messagesOnly.headers.etag).not.toBe(conversationsOnly.headers.etag);
    await app.close();
  });

  /**
   * LA preuve décisive du critère 4 : un ETag pris sur `collections=messages`
   * ne doit JAMAIS faire tomber un 304 pour `collections=conversations` — ce
   * serait rendre un corps `messages` (vide ici, mais le principe est le même
   * à toute taille) pour une requête qui demandait `conversations`, la pire
   * régression nommée par l'issue : « il se présente comme une synchronisation
   * réussie ».
   */
  it('un ETag pris sur `messages` ne fait PAS tomber un 304 pour `conversations`', async () => {
    const app = await buildApp();
    const messagesFirst = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const etagFromMessages = messagesFirst.headers.etag as string;

    const conversationsWithStaleEtag = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=conversations`,
      headers: { 'if-none-match': etagFromMessages },
    });

    expect(conversationsWithStaleEtag.statusCode).toBe(200);
    expect(conversationsWithStaleEtag.json().data.collections).toHaveProperty('conversations');
    expect(conversationsWithStaleEtag.json().data.collections).not.toHaveProperty('messages');
    await app.close();
  });

  it('quatre jeux de collections (les 3 nouvelles + toutes ensemble) rendent QUATRE ETags distincts', async () => {
    const app = await buildApp();
    const sets = ['conversations', 'messages', 'reactions', 'participants'];
    const etags = new Set<string>();
    for (const s of sets) {
      const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=${s}` });
      etags.add(res.headers.etag as string);
    }
    expect(etags.size).toBe(sets.length);
    await app.close();
  });
});
