/**
 * `POST /conversations/:id/messages` — mapping du refus `WRITE_NOT_PERMITTED`
 * (#4855) vers un 403, distinct du 400 générique servi pour toute autre
 * fin de non-recevoir de `MessagingService.handleMessage`.
 *
 * La RÈGLE (canSendMessages résolu depuis `resolveParticipantRights`) est
 * prouvée dans `services/__tests__/unit/services/MessagingService.test.ts` —
 * ce fichier ne prouve que le CÂBLAGE REST : `messagingService.handleMessage`
 * est doublé pour isoler le seul comportement propre à cette route, le choix
 * du statut HTTP.
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

describe('POST /conversations/:id/messages — statut du refus (#4855)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('rend 403 quand handleMessage refuse avec le code WRITE_NOT_PERMITTED', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: false,
      error: 'Vous n\'êtes pas autorisé à envoyer des messages',
      code: 'WRITE_NOT_PERMITTED',
      data: null,
    });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Bonjour' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('autorisé');
  });

  // #5151 — même famille de refus (un droit PARTICIPANT retiré), même statut :
  // 403, pas le 400 générique de validation.
  it('rend 403 quand handleMessage refuse avec le code ATTACHMENT_RIGHT_NOT_PERMITTED', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: false,
      error: 'Vous n\'êtes pas autorisé à envoyer ce type de pièce jointe',
      code: 'ATTACHMENT_RIGHT_NOT_PERMITTED',
      data: null,
    });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { attachmentIds: ['507f1f77bcf86cd799439055'] },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('autorisé');
  });

  // Non-régression : toute autre fin de non-recevoir de `handleMessage`
  // (conversation close, mode lent, rang insuffisant…) garde son statut
  // ACTUEL — ce lot ne les touche pas.
  it('garde 400 pour un refus SANS code WRITE_NOT_PERMITTED', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: false,
      error: 'Cette conversation est fermée : elle n’accepte plus de messages',
      data: null,
    });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Bonjour' },
    });

    expect(res.statusCode).toBe(400);
  });
});
