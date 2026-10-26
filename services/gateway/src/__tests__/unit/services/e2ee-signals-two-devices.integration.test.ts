/**
 * LES SIGNAUX CHIFFRÉS À DEUX APPAREILS, libsignal RÉEL (#13142).
 *
 * Alice et Bob sont deux appareils `@signalapp/libsignal-client` d'un processus
 * Node à part. La passerelle est la VRAIE : routes `/e2ee` (annuaire, enveloppes)
 * et route UNIQUE des signaux, relais, distribution socket, réveil push.
 *
 * Alice pose une RÉACTION (un emoji sentinelle) puis MODIFIE un message (un
 * texte sentinelle), deux messages de contrôle remplis au même palier ; Bob les
 * relit par la route et les déchiffre. Puis on cherche les sentinelles — en
 * clair, en base64, en hexa — dans tout ce que la passerelle a écrit, journalisé,
 * émis sur la socket, poussé en notification et confié au cache. On vérifie
 * aussi que les deux enveloppes ont la même taille et que le réveil ne porte que
 * son type opaque.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const pushCalls: unknown[] = [];
jest.mock('../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({
    sendToUser: async (options: unknown) => {
      pushCalls.push(options);
      return [];
    },
  }),
}));

const redisCalls: unknown[] = [];
jest.mock('../../../services/CacheStore', () => {
  const actual = jest.requireActual('../../../services/CacheStore') as Record<string, unknown>;
  const spy = new Proxy({}, {
    get: (_target, method) => async (...args: unknown[]) => { redisCalls.push({ method: String(method), args }); return null; },
  });
  return { ...actual, getCacheStore: () => spy };
});

import { randomBytes } from 'crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { E2EE_SEND_SHAPE, LIBSIGNAL_PROTOCOL, e2eeEnvelopeSchema, type E2EEDeviceBundle } from '@meeshy/shared/types/e2ee-directory';
import { E2EE_PADDING_TIERS, e2eePaddedLength, e2eePaddingCeiling } from '@meeshy/shared/types/e2ee-signals';
import { registerE2EERoutes } from '../../../routes/e2ee';
import { registerE2EESignalRoutes } from '../../../routes/e2ee-signals';
import { createE2EEDirectory } from '../../../services/e2ee/E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../../../services/e2ee/E2EEEnvelopeRelay';
import { createE2EESignalRelay } from '../../../services/e2ee/E2EESignalRelay';
import { wakeE2EEDevices } from '../../../services/e2ee/e2ee-wake';
import { libsignalSignatureVerifier } from '../../../services/e2ee/signature-verifier';
import { setE2EEEnvelopeIOProvider } from '../../../services/e2ee/envelope-delivery';
import { createFakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';
import { LibsignalDevices, realLibsignal } from '../../../services/e2ee/__tests__/libsignal-devices';

const ALICE = '507f1f77bcf86cd799439018';
const BOB = '507f1f77bcf86cd799439019';
const ALICE_SESSION = '507f1f77bcf86cd799439020';
const BOB_SESSION = '507f1f77bcf86cd799439021';
const CONVERSATION = '507f1f77bcf86cd799439012';
const TARGET_MESSAGE = '507f1f77bcf86cd799439013';

/** Le clair d'un signal, rempli d'espaces jusqu'au premier palier qui le contient (JSON reste valide). */
const padded = (signal: Record<string, unknown>): string => {
  const json = JSON.stringify(signal);
  const tier = E2EE_PADDING_TIERS.find((size) => size >= json.length) ?? json.length;
  return json.padEnd(tier, ' ');
};

describe('signaux chiffrés de bout en bout à deux appareils, libsignal réel (#13142)', () => {
  jest.setTimeout(60_000);

  let devices: LibsignalDevices;
  beforeAll(() => { devices = new LibsignalDevices(); });
  afterAll(() => devices.close());

  it("ne laisse ni l'emoji ni le texte modifié nulle part côté serveur, et Bob les déchiffre", async () => {
    const emoji = `🫥${randomBytes(12).toString('hex')}`;
    const editedText = `texte-modifié-${randomBytes(16).toString('hex')}`;
    const forms = [emoji, editedText].flatMap((secret) => [secret, Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('hex')]);

    const logs: string[] = [];
    const capture = (sink: (chunk: any, ...rest: any[]) => boolean) => (chunk: any, ...rest: any[]) => {
      logs.push(String(chunk));
      return sink(chunk, ...rest);
    };
    const writeOut = process.stdout.write.bind(process.stdout);
    const writeErr = process.stderr.write.bind(process.stderr);
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture(writeOut) as never);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture(writeErr) as never);
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(JSON.stringify(args)); }));

    const store = createFakeE2EEStore();
    store.collections.Conversation.insert({ id: CONVERSATION, encryptionMode: 'e2ee' });
    store.collections.Participant.insert({ conversationId: CONVERSATION, userId: ALICE });
    store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
    const emitted: unknown[] = [];
    setE2EEEnvelopeIOProvider(() => ({
      to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }),
      in: () => ({ fetchSockets: async () => [], socketsLeave: () => undefined }),
    }));

    const users: Record<string, { userId: string; sessionId: string }> = {
      alice: { userId: ALICE, sessionId: ALICE_SESSION },
      bob: { userId: BOB, sessionId: BOB_SESSION },
    };
    const auth = async (request: FastifyRequest) => {
      const who = users[String(request.headers['x-test-user'])];
      (request as unknown as { authContext: unknown }).authContext = { isAuthenticated: true, isAnonymous: false, ...who };
    };
    const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    registerE2EERoutes(app, {
      auth,
      directory: createE2EEDirectory({ prisma: store.prisma as never, verifier: libsignalSignatureVerifier(() => realLibsignal) }),
      relay: createE2EEEnvelopeRelay({ prisma: store.prisma as never }),
      mayReadKeysOf: async () => true,
      closeSession: async () => true,
    });
    registerE2EESignalRoutes(app, { auth, signals: createE2EESignalRelay({ prisma: store.prisma as never, wake: wakeE2EEDevices(store.prisma as never), blockedBetween: async () => false }) });
    await app.ready();

    const aliceKeys = await devices.request<Record<string, unknown>>('create', { name: 'alice', userId: ALICE, oneTime: 2 });
    const bobKeys = await devices.request<Record<string, unknown>>('create', { name: 'bob', userId: BOB, oneTime: 2 });
    const aliceEnrolled = await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: aliceKeys });
    const bobEnrolled = await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: bobKeys });
    expect([aliceEnrolled.statusCode, bobEnrolled.statusCode]).toEqual([201, 201]);
    const served = await app.inject({ method: 'GET', url: `/e2ee/keys/${BOB}`, headers: { 'x-test-user': 'alice' } });
    const [bobBundle] = served.json().data.devices as E2EEDeviceBundle[];

    const signals = [
      { s: 1, kind: 'reaction', conversationId: CONVERSATION, target: TARGET_MESSAGE, emoji, removed: false },
      { s: 1, kind: 'edit', conversationId: CONVERSATION, target: TARGET_MESSAGE, text: editedText },
    ].map(padded);
    const relayed: { status: number; bodyLength: number }[] = [];
    for (const [index, plaintext] of signals.entries()) {
      const ciphertext = await devices.request<{ type: 2 | 3; body: string }>('encrypt', {
        from: 'alice', fromAddress: { name: ALICE, deviceId: 1 }, toAddress: { name: BOB, deviceId: 1 },
        bundle: index === 0 ? bobBundle : undefined, plaintext,
      });
      const res = await app.inject({
        method: 'POST', url: `/e2ee/conversations/${CONVERSATION}/signals`, headers: { 'x-test-user': 'alice' },
        payload: {
          protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, wake: true,
          envelopes: [{ userId: BOB, deviceId: 1, registrationId: bobKeys.registrationId as number, type: ciphertext.type, body: ciphertext.body }],
        },
      });
      relayed.push({ status: res.statusCode, bodyLength: ciphertext.body.length });
    }
    expect(relayed.map((entry) => entry.status)).toEqual([200, 200]);
    // Deux signaux de nature différente, remplis au même palier : même taille d'enveloppe.
    expect(new Set(relayed.map((entry) => entry.bodyLength)).size).toBe(1);

    const listed = await app.inject({ method: 'GET', url: '/e2ee/envelopes', headers: { 'x-test-user': 'bob' } });
    const envelopes = listed.json().data.envelopes as { id: string; type: number; body: string }[];
    const opened: string[] = [];
    for (const envelope of envelopes) {
      const decrypted = await devices.request<{ plaintext: string }>('decrypt', {
        to: 'bob', toAddress: { name: BOB, deviceId: 1 }, fromAddress: { name: ALICE, deviceId: 1 }, type: envelope.type, body: envelope.body,
      });
      opened.push(decrypted.plaintext);
    }
    expect(opened.map((plaintext) => JSON.parse(plaintext))).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'reaction', emoji }),
      expect.objectContaining({ kind: 'edit', text: editedText }),
    ]));
    expect(opened).toHaveLength(2);
    const storedBeforeAck = JSON.stringify(store.collections.MessageEnvelope.rows);
    await app.inject({ method: 'POST', url: '/e2ee/envelopes/ack', headers: { 'x-test-user': 'bob' }, payload: { ids: envelopes.map((e) => e.id) } });

    // Le réveil ne porte que son type opaque : ni signal, ni conversation, ni expéditeur.
    expect(pushCalls).toEqual(
      expect.arrayContaining([{ userId: BOB, platforms: ['ios'], payload: { title: '', body: '', silent: true, data: { type: 'e2ee_wake' } } }]),
    );
    expect(JSON.stringify(pushCalls)).not.toContain(CONVERSATION);

    await new Promise((resolve) => setTimeout(resolve, 50));
    stdout.mockRestore();
    stderr.mockRestore();
    consoleSpies.forEach((spy) => spy.mockRestore());
    const database = JSON.stringify({ storedBeforeAck, collections: Object.fromEntries(Object.entries(store.collections).map(([name, c]) => [name, c.rows])) });
    const surfaces = { database, logs: logs.join('\n'), socket: JSON.stringify(emitted), push: JSON.stringify(pushCalls), redis: JSON.stringify(redisCalls) };
    Object.entries(surfaces).forEach(([surface, text]) => {
      forms.forEach((form) => expect({ surface, leaked: text.includes(form) }).toEqual({ surface, leaked: false }));
    });
    expect(JSON.stringify(surfaces)).not.toMatch(/"kind"|reaction|"edit"/);
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
    await app.close();
  });
  it('un clair rempli au plafond tient encore dans les bornes des enveloppes, même en premier message (PreKey, Kyber)', async () => {
    const aliceKeys = await devices.request<Record<string, unknown>>('create', { name: 'alice-plafond', userId: ALICE, oneTime: 2 });
    const bobKeys = await devices.request<Record<string, unknown>>('create', { name: 'bob-plafond', userId: BOB, oneTime: 2 });
    const bundle = {
      registrationId: bobKeys.registrationId, deviceId: 1, identityKey: bobKeys.identityKey,
      signedPreKey: bobKeys.signedPreKey, kyberPreKey: (bobKeys.kyberPreKeys as unknown[])[0],
      preKey: (bobKeys.oneTimePreKeys as unknown[])[0],
    };
    expect(aliceKeys).toBeDefined();
    const results: { recipients: number; type: number; fits: boolean }[] = [];
    for (const [index, recipients] of [1, 2, 8, 16, 31].entries()) {
      const size = e2eePaddedLength(e2eePaddingCeiling(recipients) - 1, recipients);
      const ciphertext = await devices.request<{ type: 2 | 3; body: string }>('encrypt', {
        from: 'alice-plafond', fromAddress: { name: ALICE, deviceId: 1 }, toAddress: { name: BOB, deviceId: 1 },
        bundle: index === 0 ? bundle : undefined, plaintext: ' '.repeat(size),
      });
      const envelope = { userId: BOB, deviceId: 1, registrationId: 1, type: ciphertext.type, body: ciphertext.body };
      const fits = e2eeEnvelopeSchema.safeParse(envelope).success
        && E2EE_SEND_SHAPE.envelopes.safeParse(Array.from({ length: recipients }, () => envelope)).success;
      results.push({ recipients, type: ciphertext.type, fits });
    }
    expect(results.every((result) => result.type === 3)).toBe(true);
    expect(results.filter((result) => !result.fits)).toEqual([]);
  });
});
