/**
 * `GET /conversations/:conversationId/links` ANNONCE enfin son successeur (#4351).
 *
 * Ses deux sœurs du même fichier (`POST /conversations/:id/new-link`, `POST
 * /conversations/join/:linkId`) portent `depreciee(...)` depuis #4169/#4353.
 * Celle-ci ne le faisait pas alors qu'elle a un successeur STRICT et déjà
 * servi : `GET /links?conversationId=` (`routes/links/user.ts`, #4170) — voir
 * le commentaire posé au site d'enregistrement.
 *
 * Traverse la VRAIE sérialisation (`app.inject()`), comme
 * `attachments-legacy-deprecation.test.ts` pour le même mécanisme.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerSharingRoutes } from '../../../routes/conversations/sharing';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439044';

/** Pose `authContext` comme le ferait `createUnifiedAuthMiddleware` pour un JWT valide. */
async function fakeRequiredAuth(request: FastifyRequest): Promise<void> {
  (request as any).authContext = {
    type: 'user', isAuthenticated: true, isAnonymous: false,
    userId: USER_ID, displayName: 'Ana', userLanguage: 'fr', hasFullAccess: true, canSendMessages: true,
    registeredUser: { id: USER_ID, role: 'USER' },
  };
}

async function noopOptionalAuth(): Promise<void> {}

function buildPrisma(membership: unknown) {
  return {
    participant: {
      findFirst: async () => membership,
    },
    conversationShareLink: {
      findMany: async () => [],
    },
  };
}

async function buildApp(membership: unknown = { role: 'member' }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma(membership) as never);
  // `POST /conversations/:id/invite` (même fichier) déclare `onRequest:
  // [fastify.authenticate]` — un décorateur posé ailleurs en production.
  // `registerSharingRoutes` lève à l'ENREGISTREMENT sans lui.
  app.decorate('authenticate', fakeRequiredAuth as never);
  registerSharingRoutes(app as never, (app as any).prisma, noopOptionalAuth, fakeRequiredAuth);
  await app.ready();
  return app;
}

const getLinks = (app: FastifyInstance, conversationId: string = CONV_ID) =>
  app.inject({ method: 'GET', url: `/conversations/${conversationId}/links` });

describe("GET /conversations/:conversationId/links — dit qu'elle est en sursis", () => {
  it('porte Deprecation et un Link qui nomme le successeur AVEC le conversationId réel — succès', async () => {
    const app = await buildApp({ role: 'member' });

    const res = await getLinks(app);

    expect(res.statusCode).toBe(200);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(`</api/v1/links?conversationId=${CONV_ID}>; rel="successor-version"`);

    await app.close();
  });

  it("l'annonce part MÊME sur un refus (403, non membre) — c'est l'ADRESSE qui est en sursis", async () => {
    const app = await buildApp(null); // pas de ligne Participant ⇒ 403

    const res = await getLinks(app);

    expect(res.statusCode).toBe(403);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(`</api/v1/links?conversationId=${CONV_ID}>; rel="successor-version"`);

    await app.close();
  });

  it('le successeur porte le VRAI conversationId de la requête, jamais un gabarit', async () => {
    const otherConvId = '507f1f77bcf86cd799439099';
    const app = await buildApp({ role: 'member' });

    const res = await getLinks(app, otherConvId);

    expect(res.headers['link']).toBe(`</api/v1/links?conversationId=${otherConvId}>; rel="successor-version"`);

    await app.close();
  });
});
