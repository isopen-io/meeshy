/**
 * `POST /conversations/:id/new-link` — #6437.
 *
 * L'alias délègue à `mintConversationShareLink`, la même porte que
 * `POST /links` (`routes/links/creation.ts`) : il reçoit donc la même garde
 * `requireEmailVerification`, montée sur `preValidation` juste après
 * `requiredAuth`. Ce témoin le prouve par une VRAIE requête (`app.inject()`),
 * pas par une lecture de source — un renommage ou un fichier voisin non
 * gardé ne le ferait pas rougir sinon.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerSharingRoutes } from '../../../routes/conversations/sharing';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439044';

type Grace = { phase: 'quiet' | 'invite' | 'blocked'; activeLinks: number };

function fakeRequiredAuth(emailVerified: boolean, grace?: Grace) {
  return async (request: FastifyRequest): Promise<void> => {
    (request as any).authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, displayName: 'Ana', userLanguage: 'fr', hasFullAccess: true, canSendMessages: true,
      registeredUser: {
        id: USER_ID, role: 'USER', emailVerifiedAt: emailVerified ? new Date() : null,
        ...(grace ? { activation: { phase: grace.phase, deadline: '2026-10-30T00:00:00.000Z', missing: ['email'] } } : {}),
      },
    };
  };
}

async function buildApp(emailVerified: boolean, grace?: Grace): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const requiredAuth = fakeRequiredAuth(emailVerified, grace);
  app.decorate('prisma', {
    participant: { findFirst: async () => ({ role: 'member' }) },
    conversationShareLink: { findMany: async () => [], count: async () => grace?.activeLinks ?? 0 },
    user: { findUnique: async () => ({ role: 'USER' }) },
    // #9713 — la mine lit la conversation juste après la garde : `null` la
    // fait répondre 404, la preuve observable que la garde a laissé passer.
    conversation: { findUnique: async () => null },
  } as never);
  // `POST /conversations/:id/invite` (même fichier) déclare `onRequest:
  // [fastify.authenticate]` — `registerSharingRoutes` lève à l'ENREGISTREMENT
  // sans ce décorateur, même si ce n'est pas la route sous test ici.
  app.decorate('authenticate', requiredAuth as never);
  registerSharingRoutes(app as never, (app as any).prisma, requiredAuth);
  await app.ready();
  return app;
}

describe('POST /conversations/:id/new-link — email not verified', () => {
  it('returns 403 EMAIL_NOT_VERIFIED when the caller has not confirmed their e-mail', async () => {
    const app = await buildApp(false);

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/new-link`, payload: {} });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    await app.close();
  });

  it('does not stop at the guard once the e-mail is confirmed (reaches the 404 past it, no User row here)', async () => {
    const app = await buildApp(true);

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/new-link`, payload: {} });

    expect(res.statusCode).not.toBe(403);
    await app.close();
  });
});

// #9713 — l'alias suit la même loi que `POST /links` : délai de grâce, au plus
// cinq liens actifs.
describe('POST /conversations/:id/new-link — unproven address within its grace (#9713)', () => {
  it('passes the guard while fewer than five links are active (reaches the mint, which finds no conversation)', async () => {
    const app = await buildApp(false, { phase: 'invite', activeLinks: 4 });

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/new-link`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Conversation non trouvée');
    await app.close();
  });

  it('refuses the sixth active link with 403 EMAIL_NOT_VERIFIED', async () => {
    const app = await buildApp(false, { phase: 'quiet', activeLinks: 5 });

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/new-link`, payload: {} });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    await app.close();
  });

  it('refuses once the grace has run out (blocked)', async () => {
    const app = await buildApp(false, { phase: 'blocked', activeLinks: 0 });

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/new-link`, payload: {} });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    await app.close();
  });
});
