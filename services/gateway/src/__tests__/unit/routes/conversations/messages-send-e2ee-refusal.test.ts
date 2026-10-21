/**
 * `POST /conversations/:id/messages` — un clair refusé dans une conversation
 * chiffrée de bout en bout rend 400 avec le code stable
 * `E2EE_PLAINTEXT_REFUSED` (#11216), à côté de la phrase que les anciens
 * clients affichent.
 *
 * La règle vit dans `e2eePlaintextAdmission.ts` ; ce fichier ne prouve que le
 * transport HTTP.
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

import {
  E2EE_PLAINTEXT_REFUSAL_MESSAGE,
  E2EE_PLAINTEXT_REFUSED,
} from '../../../../services/messaging/e2eePlaintextAdmission';

describe('POST /conversations/:id/messages — clair refusé en e2ee (#11216)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('rend 400 avec le code E2EE_PLAINTEXT_REFUSED et la phrase claire', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: false,
      error: E2EE_PLAINTEXT_REFUSAL_MESSAGE,
      code: E2EE_PLAINTEXT_REFUSED,
      data: null,
    });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Rendez-vous à 18h' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: E2EE_PLAINTEXT_REFUSED, error: E2EE_PLAINTEXT_REFUSAL_MESSAGE });
  });
});
