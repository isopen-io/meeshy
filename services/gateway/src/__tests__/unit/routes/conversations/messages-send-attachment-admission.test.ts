/**
 * `POST /conversations/:id/messages` — admission des pièces jointes
 * PRÉ-UPLOADÉES avant l'envoi (#6870).
 *
 * Mesuré en staging : envoyer un message avec un `attachmentId` invalide (ou
 * pas encore visible par ce chemin) rendait tantôt un 500, tantôt un message
 * persisté SANS sa pièce — `AttachmentService.associateAttachmentsToMessage`
 * est un `updateMany` qui ne matche rien pour un id inconnu, sans lever. Ce
 * fichier ne prouve que le CÂBLAGE REST (la règle elle-même est prouvée dans
 * `services/messaging/__tests__/attachmentSendAdmission.test.ts`) : un id
 * invalide rend un 404 NOMMÉ, avant que `handleMessage` ne soit appelé — donc
 * avant qu'aucun message ne soit créé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerSendMessageRoute } from '../../../../routes/conversations/messages-send';

const CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439099';
const OWNED_ATTACHMENT_ID = '507f1f77bcf86cd799439033';
const FOREIGN_ATTACHMENT_ID = '507f1f77bcf86cd799439044';

async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  (request as any).authContext = {
    isAuthenticated: true,
    isAnonymous: true,
    participantId: PARTICIPANT_ID,
    userId: PARTICIPANT_ID,
  };
}

async function buildApp(
  handleMessage: jest.Mock,
  attachmentRows: Array<{ id: string; uploadedBy: string }>
): Promise<{ app: FastifyInstance; findMany: jest.Mock }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const findMany = jest.fn().mockResolvedValue(attachmentRows);
  const prisma = {
    participant: { findFirst: jest.fn() },
    conversation: { findUnique: jest.fn(), findFirst: jest.fn() },
    messageAttachment: { findMany },
  } as never;
  registerSendMessageRoute(
    app as never,
    prisma,
    fakeOptionalAuth as never,
    () => ({ handleMessage }) as never,
    null as never
  );
  await app.ready();
  return { app, findMany };
}

describe('POST /conversations/:id/messages — admission des attachmentIds (#6870)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('rend 404 nommé quand une pièce jointe n’existe pas, et n’appelle jamais handleMessage', async () => {
    const handleMessage = jest.fn();
    ({ app } = await buildApp(handleMessage, []));

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { attachmentIds: [FOREIGN_ATTACHMENT_ID] },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('ATTACHMENT_NOT_FOUND');
    expect(res.json().message).toContain(FOREIGN_ATTACHMENT_ID);
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it('rend 404 nommé quand une pièce jointe appartient à quelqu’un d’autre', async () => {
    const handleMessage = jest.fn();
    ({ app } = await buildApp(handleMessage, [
      { id: FOREIGN_ATTACHMENT_ID, uploadedBy: 'quelqu-un-d-autre' },
    ]));

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { attachmentIds: [FOREIGN_ATTACHMENT_ID] },
    });

    expect(res.statusCode).toBe(404);
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it('laisse passer l’envoi quand la pièce jointe appartient à l’appelant', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: true,
      data: { id: '507f1f77bcf86cd799439077' },
    });
    ({ app } = await buildApp(handleMessage, [
      { id: OWNED_ATTACHMENT_ID, uploadedBy: PARTICIPANT_ID },
    ]));

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { attachmentIds: [OWNED_ATTACHMENT_ID] },
    });

    expect(res.statusCode).toBe(200);
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentIds: [OWNED_ATTACHMENT_ID] }),
      expect.any(String)
    );
  });

  it('ne consulte pas les pièces jointes quand la requête n’en porte aucune', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: true,
      data: { id: '507f1f77bcf86cd799439077' },
    });
    const { app: builtApp, findMany } = await buildApp(handleMessage, []);
    app = builtApp;

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Bonjour' },
    });

    expect(res.statusCode).toBe(200);
    expect(findMany).not.toHaveBeenCalled();
  });
});
