/**
 * `messages/search` et `pinned-messages` ANNONCENT leur successeur (#4340).
 *
 * `GET /conversations/:id/messages?view=search|pinned` sert les mêmes lectures
 * par la collection unique ; les deux adresses historiques restent montées
 * (des binaires installés les appellent) mais disent au client où migrer.
 * L'annonce part en `onRequest`, donc AUSSI sur un refus : l'appelant dont la
 * session vient de mourir est celui qui a le plus besoin de l'apprendre.
 *
 * Traverse la vraie réponse (`app.inject()`), jamais un double du handler.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { registerMessageSearchRoute } from '../../../routes/conversations/messages-search';
import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';

const refuseWithoutSession = async (_request: unknown, reply: FastifyReply) =>
  reply.code(401).send({ success: false, error: 'Unauthorized' });

describe('les lectures historiques du fil annoncent ?view= (#4340)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    const prisma = {} as never;
    registerMessageSearchRoute(app, prisma, refuseWithoutSession);
    registerMessagePinRoutes(app, prisma, refuseWithoutSession, null);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET messages/search annonce view=search, même sur un 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/messages/search?q=bonjour`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(
      `</api/v1/conversations/${CONVERSATION_ID}/messages?view=search>; rel="successor-version"`
    );
  });

  it('GET pinned-messages annonce view=pinned, même sur un 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONVERSATION_ID}/pinned-messages` });

    expect(res.statusCode).toBe(401);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(
      `</api/v1/conversations/${CONVERSATION_ID}/messages?view=pinned>; rel="successor-version"`
    );
  });

  it("épingler n'est pas une lecture : PUT .../pin n'annonce rien", async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/conversations/${CONVERSATION_ID}/messages/507f1f77bcf86cd799439013/pin`,
    });

    expect(res.headers['deprecation']).toBeUndefined();
  });

  it('un identifiant hostile ne devient pas une injection dans le Link', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/a%3Eb%20c/pinned-messages` });

    expect(res.headers['link']).toBe(
      `</api/v1/conversations/a%3Eb%20c/messages?view=pinned>; rel="successor-version"`
    );
  });
});
