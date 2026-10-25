/**
 * #12822, constat 3 — un message `system` n'est écrit que par la passerelle.
 *
 * Un client qui déclarait `messageType: 'system'` contournait le scellement au
 * repos d'une conversation `server`/`hybrid` (et se faisait passer pour un avis
 * de la passerelle). Les trois frontières d'envoi le refusent : socket, REST,
 * lien de partage anonyme. Aucun client légitime ne l'émet (mesuré : web, iOS,
 * SDK, Android).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { SocketMessageSendSchema } from '../../../validation/socket-event-schemas';
import { sendMessageSchema } from '../../../routes/links/types';
import { registerSendMessageRoute, SendMessageBodySchema } from '../../../routes/conversations/messages-send';

const CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439099';
const CLIENT_ID = 'cid_550e8400-e29b-41d4-a716-446655440000';

describe.each(['system', 'System', 'SYSTEM'])('un messageType « %s » venu d’un client', (declared) => {
  it('est refusé par le schéma socket', () => {
    const parsed = SocketMessageSendSchema.safeParse({ conversationId: CONV_ID, content: 'x', clientMessageId: CLIENT_ID, messageType: declared });
    expect(parsed.success).toBe(false);
  });

  it('est refusé par le schéma Zod REST — la garde elle-même, pas le schéma JSON qui la précède', () => {
    const parsed = SendMessageBodySchema.safeParse({ content: 'x', messageType: declared });
    expect(parsed.success).toBe(false);
  });

  it('est refusé par le schéma du lien de partage', () => {
    const parsed = sendMessageSchema.safeParse({ content: 'x', clientMessageId: CLIENT_ID, messageType: declared });
    expect(parsed.success).toBe(false);
  });
});

describe('les types ordinaires passent toujours', () => {
  it.each(['text', 'image', 'audio', 'location'])('« %s »', (declared) => {
    expect(SocketMessageSendSchema.safeParse({ conversationId: CONV_ID, content: 'x', clientMessageId: CLIENT_ID, messageType: declared }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ content: 'x', clientMessageId: CLIENT_ID, messageType: declared }).success).toBe(true);
    expect(SendMessageBodySchema.safeParse({ content: 'x', messageType: declared }).success).toBe(true);
  });
});

async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  Object.assign(request, { authContext: { isAuthenticated: true, isAnonymous: true, participantId: PARTICIPANT_ID } });
}

describe('POST /conversations/:id/messages', () => {
  const opened: { app?: FastifyInstance } = {};

  afterEach(async () => {
    await opened.app?.close();
    opened.app = undefined;
  });

  it('refuse un messageType system (400) sans jamais atteindre l’envoi', async () => {
    const handleMessage = jest.fn(async () => ({ success: true, data: null }));
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    opened.app = app;
    const prisma = {
      participant: { findFirst: jest.fn() },
      conversation: { findUnique: jest.fn(), findFirst: jest.fn() },
      messageAttachment: { findMany: jest.fn(async () => []) },
    } as never;
    registerSendMessageRoute(app as never, prisma, fakeOptionalAuth as never, () => ({ handleMessage }) as never, null as never);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Code de la porte : 4471', messageType: 'system' },
    });

    expect(res.statusCode).toBe(400);
    expect(handleMessage).not.toHaveBeenCalled();
  });
});
