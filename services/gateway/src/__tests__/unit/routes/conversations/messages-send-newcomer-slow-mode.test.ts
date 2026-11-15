/**
 * `POST /conversations/:id/messages` — le refus du mode lent des NOUVEAUX
 * COMPTES dans Meeshy Global (#7740) se rend en 429, avec son code dédié, son
 * décompte (`retryAfter`, secondes) dans le corps ET l'en-tête `Retry-After`.
 *
 * La règle est prouvée dans `messaging/globalNewcomerSlowMode.test.ts` et son
 * câblage au point de convergence dans `MessagingService.globalNewcomer.test.ts` ;
 * ce fichier ne prouve que la traduction HTTP.
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

describe('POST /conversations/:id/messages — mode lent des nouveaux comptes (#7740)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('rend 429 avec NEWCOMER_SLOW_MODE, retryAfter et l’en-tête Retry-After', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: false,
      error: 'Bienvenue ! Les nouveaux comptes écrivent un message toutes les 30 s ici : réessayez dans 20 s',
      code: 'NEWCOMER_SLOW_MODE',
      retryAfter: 20,
      data: null,
    });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Salut tout le monde' },
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('20');
    expect(res.json()).toMatchObject({
      success: false,
      code: 'NEWCOMER_SLOW_MODE',
      retryAfter: 20,
    });
    expect(res.json().error).toContain('20 s');
  });

  // #9927 — un mineur déclaré dans Global : refus DÉFINITIF, donc 403 (jamais
  // le 400 « requête invalide » des refus génériques), avec le code et une
  // phrase lisible pour un client antérieur qui ignore le code.
  it('rend 403 GLOBAL_ADULTS_ONLY au mineur déclaré qui écrit dans Global', async () => {
    const handleMessage = jest.fn().mockResolvedValue({
      success: false,
      error: 'Meeshy Global est en lecture seule jusqu’à vos 18 ans : vous pouvez la lire et réagir, pas y écrire.',
      code: 'GLOBAL_ADULTS_ONLY',
      data: null,
    });
    app = await buildApp(handleMessage);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      payload: { content: 'Salut tout le monde' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'GLOBAL_ADULTS_ONLY' });
    expect(res.json().error).toMatch(/18 ans/);
    expect(res.headers['retry-after']).toBeUndefined();
  });
});
