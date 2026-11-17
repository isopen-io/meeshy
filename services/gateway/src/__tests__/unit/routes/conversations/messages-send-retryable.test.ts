/**
 * `POST /conversations/:id/messages` — une transaction d'envoi NON validée
 * (conflit d'écriture P2034 avec un renvoi concurrent au même
 * `clientMessageId`, délai de transaction P2028) n'est pas un refus : le même
 * envoi, rejoué, aboutit ou tombe sur sa déduplication (audit de #19080, E3).
 * Elle se rend en 503, avec le code stable `MESSAGE_SEND_RETRYABLE`, le délai
 * (`retryAfter`) dans le corps ET l'en-tête `Retry-After` — jamais le 400 muet
 * qu'un client tiendrait pour définitif.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerSendMessageRoute } from '../../../../routes/conversations/messages-send';

const CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439099';

/** Identité anonyme minimale — la route ne lit rien d'autre pour ce chemin. */
async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  (request as any).authContext = {
    isAuthenticated: true,
    isAnonymous: true,
    participantId: PARTICIPANT_ID,
  };
}

async function buildApp(handleMessage: jest.Mock): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = {
    participant: { findFirst: jest.fn() },
    conversation: { findUnique: jest.fn(), findFirst: jest.fn() },
    // #6870 — la route admet désormais chaque `attachmentId` (existe,
    // appartient à l'appelant) avant `handleMessage`. Ce fichier ne teste
    // pas cette admission (voir `messages-send-attachment-admission.test.ts`)
    // : la double reflète tout id demandé comme appartenant à l'appelant
    // anonyme de `fakeOptionalAuth`, pour isoler le seul comportement propre
    // à ce fichier — le statut HTTP d'un refus de `handleMessage`.
    messageAttachment: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, uploadedBy: PARTICIPANT_ID })))
      ),
    },
  } as never;
  registerSendMessageRoute(
    app as never,
    prisma,
    fakeOptionalAuth as never,
    () => ({ handleMessage }) as never,
    null as never
  );
  await app.ready();
  return app;
}

describe('POST /conversations/:id/messages — une écriture non validée est rejouable (audit #19080, E3)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('rend 503 avec MESSAGE_SEND_RETRYABLE, retryAfter et l’en-tête Retry-After', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: false,
      error: 'Le message n’a pas pu être enregistré : renvoyez-le',
      code: 'MESSAGE_SEND_RETRYABLE',
      retryAfter: 1,
      data: null,
    });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Bonjour', clientMessageId: 'cid_00000000-0000-4000-8000-000000000001' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('1');
    expect(res.json()).toMatchObject({ success: false, code: 'MESSAGE_SEND_RETRYABLE', retryAfter: 1 });
  });

  it('une erreur interne sans code reste le 400 d’avant (contrôle)', async () => {
    const handleMessage = jest.fn().mockResolvedValue({ success: false, error: 'Erreur interne lors de l’envoi du message', data: null });
    app = await buildApp(handleMessage);

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/messages`, payload: { content: 'Bonjour' } });

    expect(res.statusCode).toBe(400);
    expect(res.headers['retry-after']).toBeUndefined();
  });
});
