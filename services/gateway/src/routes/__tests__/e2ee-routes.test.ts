/**
 * Les routes `/api/v1/e2ee/*` (#3706) : l'annuaire par appareil et la lecture
 * des enveloppes, prouvés par le transport HTTP réel (Fastify) contre le magasin
 * en mémoire.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { registerE2EERoutes } from '../e2ee';
import { createE2EEDirectory } from '../../services/e2ee/E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../../services/e2ee/E2EEEnvelopeRelay';
import { createFakeE2EEStore } from '../../services/e2ee/__tests__/fake-e2ee-store';
import { fakeDeviceKeys, fakeVerifier } from '../../services/e2ee/__tests__/fake-signatures';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const STRANGER = 'e5'.repeat(12);
const SESSIONS: Record<string, string> = { alice: 'c3'.repeat(12), aliceAndroid: 'c7'.repeat(12), aliceWeb: 'c8'.repeat(12), bob: 'd4'.repeat(12), stranger: 'f6'.repeat(12) };
const USERS: Record<string, string> = { alice: ALICE, aliceAndroid: ALICE, aliceWeb: ALICE, bob: BOB, stranger: STRANGER };

async function buildApp(options: { sessionClosable?: () => boolean } = {}) {
  const store = createFakeE2EEStore();
  const closedSessions: { userId: string; sessionId: string }[] = [];
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (request: FastifyRequest) => {
    const who = String(request.headers['x-test-user'] ?? '');
    (request as unknown as { authContext: unknown }).authContext = USERS[who]
      ? { isAuthenticated: true, isAnonymous: false, userId: USERS[who], sessionId: SESSIONS[who] }
      : { isAuthenticated: false, isAnonymous: true };
  };
  registerE2EERoutes(app, {
    auth,
    directory: createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier }),
    relay: createE2EEEnvelopeRelay({ prisma: store.prisma as never }),
    mayReadKeysOf: async (requester, target) => requester === target || target !== STRANGER,
    closeSession: async (closed) => {
      if (options.sessionClosable?.() === false) return false;
      closedSessions.push(closed);
      return true;
    },
  });
  await app.ready();
  return { app, store, closedSessions };
}

const enrollment = (userId: string, keys = fakeDeviceKeys({ oneTime: 2, kyber: 2 })) => ({
  binding: keys.binding(userId),
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios',
  oneTimePreKeys: keys.oneTimePreKeys,
  kyberPreKeys: keys.kyberPreKeys,
});

describe('routes /e2ee', () => {
  it("enrôle l'appareil de la session et refuse un appelant sans compte", async () => {
    const { app } = await buildApp();

    const enrolled = await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });
    const anonymous = await app.inject({ method: 'POST', url: '/e2ee/devices', payload: enrollment(ALICE) });

    expect(enrolled.statusCode).toBe(201);
    expect(enrolled.json()).toMatchObject({ success: true, data: { deviceId: 1, created: true } });
    expect(anonymous.statusCode).toBe(401);
  });

  it('refuse un champ de clé privée au lieu de le stocker en silence', async () => {
    const { app, store } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' },
      payload: { ...enrollment(ALICE), identityKeyPrivate: 'c2VjcmV0' },
    });

    expect(res.statusCode).toBe(400);
    expect(store.collections.E2EEDevice.rows).toHaveLength(0);
  });

  it('sert les bundles réservés à un contact autorisé, et 403 à un inconnu', async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: enrollment(BOB) });

    const served = await app.inject({ method: 'GET', url: `/e2ee/keys/${BOB}`, headers: { 'x-test-user': 'alice' } });
    const forbidden = await app.inject({ method: 'GET', url: `/e2ee/keys/${STRANGER}`, headers: { 'x-test-user': 'alice' } });

    expect(served.statusCode).toBe(200);
    expect(served.json().data.devices).toEqual([expect.objectContaining({ deviceId: 1, preKey: expect.objectContaining({ keyId: 1 }) })]);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe(E2EE_ERROR_CODES.KEYS_FORBIDDEN);
  });

  it('liste les appareils sans consommer de pré-clé, puis filtre les bundles par deviceIds', async () => {
    const { app, store } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: enrollment(BOB) });

    const listed = await app.inject({ method: 'GET', url: `/e2ee/keys/${BOB}/devices`, headers: { 'x-test-user': 'alice' } });
    const none = await app.inject({ method: 'GET', url: `/e2ee/keys/${BOB}?deviceIds=7`, headers: { 'x-test-user': 'alice' } });

    expect(listed.json().data.devices).toEqual([expect.objectContaining({ deviceId: 1 })]);
    expect(none.json().data.devices).toEqual([]);
    expect(store.collections.E2EEOneTimePreKey.rows.every((row) => row.usedAt === null)).toBe(true);
  });

  it("publie des clés et rend le stock à la seule session de l'appareil", async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });

    const count = await app.inject({ method: 'GET', url: '/e2ee/devices/self/prekey-count', headers: { 'x-test-user': 'alice' } });
    const foreign = await app.inject({ method: 'PUT', url: '/e2ee/devices/1/keys', headers: { 'x-test-user': 'bob' }, payload: { oneTimePreKeys: [] } });

    expect(count.json().data).toEqual({ deviceId: 1, oneTimePreKeys: 2, kyberPreKeys: 2 });
    expect(foreign.statusCode).toBe(403);
  });

  it("sert à un appareil ses enveloppes, puis les efface à l'accusé", async () => {
    const { app, store } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: enrollment(BOB) });
    const [bobDevice] = store.collections.E2EEDevice.rows;
    store.collections.MessageEnvelope.insert({
      messageId: '0a'.repeat(12), conversationId: '0b'.repeat(12), recipientUserId: BOB, recipientDeviceId: 1, recipientRegistrationId: bobDevice.registrationId,
      senderUserId: ALICE, senderDeviceId: 1, type: 3, body: 'Y2lwaGVy',
    });

    const listed = await app.inject({ method: 'GET', url: '/e2ee/envelopes', headers: { 'x-test-user': 'bob' } });
    const ids = listed.json().data.envelopes.map((envelope: { id: string }) => envelope.id);
    const acked = await app.inject({ method: 'POST', url: '/e2ee/envelopes/ack', headers: { 'x-test-user': 'bob' }, payload: { ids } });

    expect(ids).toHaveLength(1);
    expect(acked.json().data).toEqual({ deleted: 1 });
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
  });

  it("retire un appareil du compte", async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });

    const res = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'alice' } });
    const again = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'alice' } });

    expect(res.statusCode).toBe(200);
    expect(again.statusCode).toBe(404);
  });

  it("liste MES appareils chiffrés avec plateforme, libellé, dates et l'appareil courant — à moi seul, sans aucune clé", async () => {
    const { app } = await buildApp();
    await app.inject({
      method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' },
      payload: { ...enrollment(ALICE), label: 'iPhone d’Alice' },
    });
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: enrollment(BOB) });

    const fromEnrolledDevice = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' } });
    const fromAnotherSession = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'aliceAndroid' } });
    const anonymous = await app.inject({ method: 'GET', url: '/e2ee/devices' });

    expect(fromEnrolledDevice.statusCode).toBe(200);
    const [device] = fromEnrolledDevice.json().data.devices;
    expect(fromEnrolledDevice.json().data.devices).toHaveLength(1);
    expect(device).toEqual({
      deviceId: 1,
      registrationId: expect.any(Number),
      platform: 'ios',
      label: 'iPhone d’Alice',
      enrolledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      lastSeenAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      current: true,
    });
    expect(fromAnotherSession.json().data.devices).toEqual([expect.objectContaining({ deviceId: 1, current: false })]);
    expect(JSON.stringify(fromEnrolledDevice.json())).not.toMatch(/identityKey|sessionId|signedPreKey|kyber/);
    expect(anonymous.statusCode).toBe(401);
  });

  it("ne liste plus un appareil retiré, et ne sert le libellé d'un appareil à aucun contact", async () => {
    const { app } = await buildApp();
    await app.inject({
      method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' },
      payload: { ...enrollment(BOB), label: 'Pixel de Bob' },
    });

    const seenByContact = await app.inject({ method: 'GET', url: `/e2ee/keys/${BOB}/devices`, headers: { 'x-test-user': 'alice' } });
    await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'bob' } });
    const afterRetirement = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' } });

    expect(JSON.stringify(seenByContact.json())).not.toMatch(/Pixel de Bob|platform|lastSeenAt/);
    expect(afterRetirement.json().data.devices).toEqual([]);
  });

  it("ne sert à un compte sans appareil chiffré qu'une liste vide, et refuse un appelant sans compte", async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });

    const stranger = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'stranger' } });
    const anonymous = await app.inject({ method: 'GET', url: '/e2ee/devices' });

    expect(stranger.json().data).toEqual({ devices: [] });
    expect(anonymous.statusCode).toBe(401);
  });

  it("retire un de mes appareils depuis une autre session du compte, jamais celui d'autrui", async () => {
    const { app } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });

    const foreign = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'bob' } });
    const stillListed = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'aliceWeb' } });
    const own = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'aliceWeb' } });
    const after = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' } });

    expect(foreign.statusCode).toBe(404);
    expect(stillListed.json().data.devices).toHaveLength(1);
    expect(own.statusCode).toBe(200);
    expect(after.json().data.devices).toEqual([]);
  });

  it("retirer un appareil depuis une autre session ferme AUSSI la session de l'appareil : un appareil volé ne se réenrôle pas", async () => {
    const { app, closedSessions } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });

    const res = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'aliceWeb' } });

    expect(res.json().data).toEqual({ deviceId: 1, retired: true, signedOut: true });
    expect(closedSessions).toEqual([{ userId: ALICE, sessionId: SESSIONS.alice }]);
  });

  it("retirer l'appareil de sa PROPRE session ne déconnecte pas celui qui retire", async () => {
    const { app, closedSessions } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });

    const res = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'alice' } });

    expect(res.json().data).toEqual({ deviceId: 1, retired: true, signedOut: false });
    expect(closedSessions).toEqual([]);
  });

  it("une session qui ne se ferme pas fait ÉCHOUER le retrait, sans rien révoquer : jamais « déconnecté » sur une session vivante", async () => {
    const closable = { value: false };
    const { app, store } = await buildApp({ sessionClosable: () => closable.value });
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });

    const refused = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'aliceWeb' } });
    const stillListed = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'aliceWeb' } });
    const revokedBeforeRetry = store.collections.E2EERevokedIdentity.rows.length;
    closable.value = true;
    const retried = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1', headers: { 'x-test-user': 'aliceWeb' } });

    expect(refused.statusCode).toBe(503);
    expect(refused.json()).toMatchObject({ success: false, code: E2EE_ERROR_CODES.DEVICE_SESSION_NOT_CLOSED });
    expect(revokedBeforeRetry).toBe(0);
    expect(stillListed.json().data.devices).toHaveLength(1);
    expect(retried.json().data).toEqual({ deviceId: 1, retired: true, signedOut: true });
  });

  it("un retrait qui nomme une génération périmée ne ferme ni ne retire l'appareil qui a repris la place", async () => {
    const { app, store, closedSessions } = await buildApp();
    await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: enrollment(ALICE) });
    const [device] = store.collections.E2EEDevice.rows;
    const stale = Number(device.registrationId) === 1 ? 2 : 1;

    const refused = await app.inject({ method: 'DELETE', url: `/e2ee/devices/1?registrationId=${stale}`, headers: { 'x-test-user': 'aliceAndroid' } });
    const listed = await app.inject({ method: 'GET', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' } });

    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe(E2EE_ERROR_CODES.DEVICE_CHANGED);
    expect(listed.json().data.devices).toHaveLength(1);
    expect(store.collections.E2EERevokedIdentity.rows).toHaveLength(0);
    expect(closedSessions).toEqual([]);

    const matching = await app.inject({
      method: 'DELETE', url: `/e2ee/devices/1?registrationId=${device.registrationId}`, headers: { 'x-test-user': 'aliceAndroid' },
    });
    const malformed = await app.inject({ method: 'DELETE', url: '/e2ee/devices/1?registrationId=abc', headers: { 'x-test-user': 'aliceAndroid' } });

    expect(matching.statusCode).toBe(200);
    expect(malformed.statusCode).toBe(400);
  });
});
