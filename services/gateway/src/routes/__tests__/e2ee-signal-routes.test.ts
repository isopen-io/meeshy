/**
 * La route UNIQUE des signaux chiffrés (#13142) : `POST /e2ee/conversations/:id/signals`,
 * prouvée par le transport HTTP réel (Fastify) contre le magasin en mémoire.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { E2EE_ERROR_CODES, LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import { registerE2EESignalRoutes } from '../e2ee-signals';
import { createE2EESignalRelay } from '../../services/e2ee/E2EESignalRelay';
import { createFakeE2EEStore } from '../../services/e2ee/__tests__/fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const CONVERSATION = 'f6'.repeat(12);
const SESSIONS: Record<string, string> = { alice: 'c3'.repeat(12), bob: 'd4'.repeat(12) };
const USERS: Record<string, string> = { alice: ALICE, bob: BOB };

async function buildApp() {
  const store = createFakeE2EEStore();
  store.collections.E2EEDevice.insert({ userId: ALICE, deviceId: 1, registrationId: 101, sessionId: SESSIONS.alice, identityKey: 'ik', platform: 'ios' });
  store.collections.E2EEDevice.insert({ userId: BOB, deviceId: 1, registrationId: 201, sessionId: SESSIONS.bob, identityKey: 'ik', platform: 'ios' });
  store.collections.Conversation.insert({ id: CONVERSATION, encryptionMode: 'e2ee' });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: ALICE });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (request: FastifyRequest) => {
    const who = String(request.headers['x-test-user'] ?? '');
    (request as unknown as { authContext: unknown }).authContext = USERS[who]
      ? { isAuthenticated: true, isAnonymous: false, userId: USERS[who], sessionId: SESSIONS[who] }
      : { isAuthenticated: false, isAnonymous: true };
  };
  registerE2EESignalRoutes(app, { auth, signals: createE2EESignalRelay({ prisma: store.prisma as never, deliver: () => undefined }) });
  await app.ready();
  return { app, store };
}

const signal = (overrides: Record<string, unknown> = {}) => ({
  protocol: LIBSIGNAL_PROTOCOL,
  senderDeviceId: 1,
  envelopes: [{ userId: BOB, deviceId: 1, registrationId: 201, type: 2, body: 'b3BhcXVl' }],
  ...overrides,
});

describe('POST /e2ee/conversations/:conversationId/signals', () => {
  it("relaie l'enveloppe opaque et rend l'identifiant du signal", async () => {
    const { app, store } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: `/e2ee/conversations/${CONVERSATION}/signals`, headers: { 'x-test-user': 'alice' }, payload: signal(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { envelopes: 1, signalId: expect.stringMatching(/^[a-f0-9]{24}$/) } });
    expect(store.collections.MessageEnvelope.rows).toHaveLength(1);
  });

  it('ne lit aucun champ en clair à côté des enveloppes : un type de signal glissé dans la charge est retiré, jamais rangé', async () => {
    const { app, store } = await buildApp();

    await app.inject({
      method: 'POST', url: `/e2ee/conversations/${CONVERSATION}/signals`, headers: { 'x-test-user': 'alice' },
      payload: signal({ kind: 'reaction', emoji: '🙈', targetMessageId: '0a'.repeat(12) }),
    });

    expect(JSON.stringify(store.collections.MessageEnvelope.rows)).not.toMatch(/reaction|🙈/);
  });

  it('refuse une charge invalide (400), un appelant sans compte (401) et une clé privée glissée (400)', async () => {
    const { app, store } = await buildApp();
    const url = `/e2ee/conversations/${CONVERSATION}/signals`;

    const invalid = await app.inject({ method: 'POST', url, headers: { 'x-test-user': 'alice' }, payload: signal({ envelopes: [] }) });
    const anonymous = await app.inject({ method: 'POST', url, payload: signal() });
    const privateKey = await app.inject({ method: 'POST', url, headers: { 'x-test-user': 'alice' }, payload: signal({ identityKeyPrivate: 'c2VjcmV0' }) });
    const badId = await app.inject({ method: 'POST', url: '/e2ee/conversations/nope/signals', headers: { 'x-test-user': 'alice' }, payload: signal() });

    expect([invalid.statusCode, anonymous.statusCode, privateKey.statusCode, badId.statusCode]).toEqual([400, 401, 400, 400]);
    expect(invalid.json().code).toBe(E2EE_ERROR_CODES.ENVELOPES_INVALID);
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
  });

  it('rend le refus Sesame (409 E2EE_DEVICES_MISMATCH) que le scelleur sait résoudre', async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: `/e2ee/conversations/${CONVERSATION}/signals`, headers: { 'x-test-user': 'alice' },
      payload: signal({ envelopes: [{ userId: BOB, deviceId: 1, registrationId: 999, type: 2, body: 'b3BhcXVl' }] }),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe(E2EE_ERROR_CODES.DEVICES_MISMATCH);
  });
});
