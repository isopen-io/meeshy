/**
 * `POST /conversations/:id/messages` — un transfert refusé rend son motif en
 * `code` stable (#9598), à côté de la phrase que les anciens clients
 * affichent ; et `forwardedAttachmentIds` (#9914) atteint `handleMessage`,
 * validé en identifiants.
 *
 * La règle vit dans `forwardAdmission.ts` ; ce fichier ne prouve que le
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

const SOURCE_ID = '507f1f77bcf86cd799439011';
const PIECE_ID = '507f1f77bcf86cd799439033';

describe('POST /conversations/:id/messages — transfert (#9598, #9914)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it.each([
    ['view-once-not-forwardable', 'Un message à vue unique ne peut pas être transféré'],
    ['encrypted-source-not-server-copyable', 'Un message chiffré se transfère depuis l’appareil : la passerelle n’en copie rien'],
    ['forwarded-attachment-not-in-source', 'Une pièce demandée n’appartient pas au message transféré'],
  ])('rend 400 avec le code %s et la phrase d’origine', async (code, error) => {
    const handleMessage = jest.fn().mockResolvedValue({ success: false, error, code, data: null });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: '', forwardedFromId: SOURCE_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code, error });
  });

  it('transmet les pièces choisies à handleMessage', async () => {
    const handleMessage = jest.fn().mockResolvedValue({ success: false, error: 'x', data: null });
    app = await buildApp(handleMessage);

    await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: '', forwardedFromId: SOURCE_ID, forwardedAttachmentIds: [PIECE_ID] },
    });

    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ forwardedFromId: SOURCE_ID, forwardedAttachmentIds: [PIECE_ID] }),
      expect.anything(),
    );
  });

  it('refuse un identifiant de pièce malformé avant tout traitement', async () => {
    const handleMessage = jest.fn();
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: '', forwardedFromId: SOURCE_ID, forwardedAttachmentIds: ['pas-un-id'] },
    });

    expect(res.statusCode).toBe(400);
    expect(handleMessage).not.toHaveBeenCalled();
  });
});
