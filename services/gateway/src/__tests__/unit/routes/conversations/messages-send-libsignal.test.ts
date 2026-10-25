/**
 * `POST /conversations/:id/messages` — le transport HTTP d'un envoi libsignal
 * (#3706) : la session de l'appelant accompagne les enveloppes jusqu'au
 * service, et chaque refus du relais garde son statut et son code stable —
 * 409 Sesame avec l'écart à résoudre, 400 `E2EE_CLIENT_OUTDATED` lisible pour
 * un ancien client, 403 pour un appareil qui n'est pas celui de la session.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { E2EE_CLIENT_OUTDATED_MESSAGE, E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';

import { registerSendMessageRoute } from '../../../../routes/conversations/messages-send';

const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439099';
const BOB = 'b2'.repeat(12);

async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  (request as any).authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, sessionId: SESSION_ID };
}

async function buildApp(handleMessage: jest.Mock): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = {
    participant: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: PARTICIPANT_ID }) },
    conversation: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ type: 'group', participants: [] }), findFirst: jest.fn() },
    messageAttachment: { findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue([]) },
    userBlock: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null), findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue([]) },
  } as never;
  registerSendMessageRoute(app as never, prisma, fakeOptionalAuth as never, () => ({ handleMessage }) as never, null as never);
  await app.ready();
  return app;
}

const libsignalBody = {
  content: '',
  encryptionMode: 'e2ee',
  encryptionProtocol: 'libsignal-v1',
  encryptedContent: 'libsignal-v1',
  encryptionMetadata: { protocol: 'libsignal-v1', senderDeviceId: 1, regimeEpoch: 0 },
  envelopes: [{ userId: BOB, deviceId: 1, registrationId: 42, type: 3, body: 'Y2lwaGVy' }],
};

describe('POST /conversations/:id/messages — envoi libsignal (#3706)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const send = (payload: Record<string, unknown>) =>
    app!.inject({ method: 'POST', url: `/conversations/${CONV_ID}/messages`, payload });

  it("remet au service les enveloppes et la session de l'appelant", async () => {
    const handleMessage = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ success: true, data: { id: 'm1', conversationId: CONV_ID } });
    app = await buildApp(handleMessage);

    await send(libsignalBody);

    const request = handleMessage.mock.calls[0][0] as { encryptedPayload: { relay: Record<string, unknown> } };
    expect(request.encryptedPayload.relay).toMatchObject({ senderDeviceId: 1, sessionId: SESSION_ID, envelopes: libsignalBody.envelopes });
  });

  it('rend 409 E2EE_DEVICES_MISMATCH avec les appareils manquants, en trop et périmés', async () => {
    const mismatch = { missing: [{ userId: BOB, deviceId: 2 }], extra: [], stale: [{ userId: BOB, deviceId: 1 }] };
    const handleMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      success: false, error: 'écart', code: E2EE_ERROR_CODES.DEVICES_MISMATCH, e2eeMismatch: mismatch, data: null,
    });
    app = await buildApp(handleMessage);

    const res = await send(libsignalBody);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: E2EE_ERROR_CODES.DEVICES_MISMATCH, ...mismatch });
  });

  it('rend 400 E2EE_CLIENT_OUTDATED avec une phrase lisible pour un ancien client', async () => {
    const handleMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      success: false, error: E2EE_CLIENT_OUTDATED_MESSAGE, code: E2EE_ERROR_CODES.CLIENT_OUTDATED, data: null,
    });
    app = await buildApp(handleMessage);

    const res = await send({ content: '', encryptedContent: 'ancien-chiffré', encryptionMode: 'e2ee', encryptionMetadata: { v: 1 } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: E2EE_ERROR_CODES.CLIENT_OUTDATED, error: E2EE_CLIENT_OUTDATED_MESSAGE });
  });

  it("rend 409 E2EE_REGIME_CHANGED quand le régime a basculé depuis la rédaction (#12522, #12562)", async () => {
    const handleMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      success: false, error: 'Le chiffrement de cette conversation a changé', code: E2EE_ERROR_CODES.REGIME_CHANGED, data: null,
    });
    app = await buildApp(handleMessage);

    const res = await send({ ...libsignalBody, encryptionMetadata: { protocol: 'libsignal-v1', senderDeviceId: 1, regimeEpoch: 4 } });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: E2EE_ERROR_CODES.REGIME_CHANGED });
    const request = handleMessage.mock.calls[0] as unknown as [{ encryptedPayload: Record<string, unknown> }];
    expect(request[0].encryptedPayload).toMatchObject({ regimeEpoch: 4 });
  });

  it("rend 403 E2EE_DEVICE_NOT_BOUND quand l'appareil émetteur n'est pas celui de la session", async () => {
    const handleMessage = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      success: false, error: 'non lié', code: E2EE_ERROR_CODES.DEVICE_NOT_BOUND, data: null,
    });
    app = await buildApp(handleMessage);

    const res = await send(libsignalBody);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: E2EE_ERROR_CODES.DEVICE_NOT_BOUND });
  });
});
