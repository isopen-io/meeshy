import { E2EE_ENVELOPE_BOUNDS, E2EE_ERROR_CODES, E2EE_MAX_ACTIVE_DEVICES, E2EE_SEND_SHAPE } from '@meeshy/shared/types/e2ee-directory';
import {
  createE2EEDirectory,
  E2EEDirectoryError,
  type E2EEDirectory,
} from '../E2EEDirectory';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeSign, fakeVerifier, randomKey } from './fake-signatures';
import type { SignatureVerifier } from '../signature-verifier';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const SESSION_1 = 'c3'.repeat(12);
const SESSION_2 = 'd4'.repeat(12);

const sessionIdOf = (index: number): string => index.toString(16).padStart(24, 'e');

const liveSession = (store: FakeE2EEStore, id: string) =>
  store.collections.UserSession.insert({ id, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) });

function directoryWith(options: { store?: FakeE2EEStore; verifier?: SignatureVerifier } = {}) {
  const store = options.store ?? createFakeE2EEStore();
  [SESSION_1, SESSION_2].filter((id) => !store.collections.UserSession.rows.some((row) => row.id === id)).forEach((id) => liveSession(store, id));
  const directory = createE2EEDirectory({
    prisma: store.prisma as never,
    verifier: options.verifier ?? fakeVerifier,
    now: () => NOW,
  });
  return { store, directory };
}

const NOW = new Date('2026-10-23T12:00:00Z');

/** iOS signe une preuve neuve à chaque enrôlement : `signedAt` avance d'un enrôlement à l'autre (#12933). */
const enrollmentOf = (keys: ReturnType<typeof fakeDeviceKeys>, userId: string, signedAt = NOW.getTime()) => ({
  binding: keys.binding(userId, signedAt),
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios' as const,
  oneTimePreKeys: keys.oneTimePreKeys,
  kyberPreKeys: keys.kyberPreKeys,
});

async function enroll(directory: E2EEDirectory, userId: string, sessionId: string, keys = fakeDeviceKeys({ oneTime: 10, kyber: 10 })) {
  const result = await directory.enrollDevice({ userId, sessionId, request: enrollmentOf(keys, userId) });
  return { ...result, keys };
}

const refusal = async (promise: Promise<unknown>): Promise<E2EEDirectoryError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof E2EEDirectoryError) return error;
    throw error;
  }
  throw new Error('refus attendu');
};

describe("l'annuaire E2EE par appareil", () => {
  describe('enrôlement', () => {
    it('attribue 1 au premier appareil, 2 au suivant, et range ses pré-clés uniques', async () => {
      const { directory, store } = directoryWith();
      const first = await enroll(directory, ALICE, SESSION_1);
      const second = await enroll(directory, ALICE, SESSION_2);

      expect([first.deviceId, second.deviceId]).toEqual([1, 2]);
      expect(store.collections.E2EEOneTimePreKey.rows.filter((row) => row.deviceId === 1)).toHaveLength(20);
    });

    it("refuse un lot dont une signature XEdDSA est fausse, sans rien écrire ni consommer de numéro d'appareil", async () => {
      const { directory, store } = directoryWith();
      const keys = fakeDeviceKeys({ kyber: 3 });
      const forged = { ...enrollmentOf(keys, ALICE), kyberPreKeys: [...keys.kyberPreKeys.slice(1), { ...keys.kyberPreKeys[0], signature: fakeSign(randomKey(), 'x') }] };

      const error = await refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_1, request: forged }));

      expect(error.code).toBe(E2EE_ERROR_CODES.SIGNATURE_INVALID);
      expect(error.status).toBe(400);
      expect(store.collections.E2EEDevice.rows).toHaveLength(0);
    });

    it("échoue FERMÉ quand la vérification est impossible (bibliothèque absente)", async () => {
      const { directory, store } = directoryWith({ verifier: { verify: async () => { throw new Error('libsignal indisponible'); } } });

      const error = await refusal(enroll(directory, ALICE, SESSION_1));

      expect(error.code).toBe(E2EE_ERROR_CODES.SIGNATURE_UNVERIFIABLE);
      expect(error.status).toBe(503);
      expect(store.collections.E2EEDevice.rows).toHaveLength(0);
    });

    it("est idempotent pour la même identité : même deviceId, session rattachée à la nouvelle connexion", async () => {
      const { directory, store } = directoryWith();
      const first = await enroll(directory, ALICE, SESSION_1);
      const again = await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_2, request: enrollmentOf(first.keys, ALICE, NOW.getTime() + 1) });

      expect(again).toEqual({ deviceId: first.deviceId, created: false });
      expect(store.collections.E2EEDevice.rows).toHaveLength(1);
      expect(store.collections.E2EEDevice.rows[0].sessionId).toBe(SESSION_2);
    });

    it("refuse de lier une identité PUBLIQUE à une autre session sans la preuve de sa clé privée", async () => {
      const { directory, store } = directoryWith();
      const victim = await enroll(directory, ALICE, SESSION_1);
      const replayed = { ...enrollmentOf(victim.keys, ALICE), binding: { timestamp: NOW.getTime(), signature: fakeSign(randomKey(), 'x') } };

      const error = await refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_2, request: replayed }));

      expect(error.code).toBe(E2EE_ERROR_CODES.BINDING_INVALID);
      expect(store.collections.E2EEDevice.rows[0].sessionId).toBe(SESSION_1);
    });

    it('refuse une preuve signée pour un autre compte ou trop ancienne', async () => {
      const { directory } = directoryWith();
      const keys = fakeDeviceKeys();
      const otherAccount = { ...enrollmentOf(keys, ALICE), binding: keys.binding(BOB, NOW.getTime()) };
      const stale = { ...enrollmentOf(keys, ALICE), binding: keys.binding(ALICE, NOW.getTime() - 11 * 60 * 1000) };

      await expect(refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_1, request: otherAccount }))).resolves.toMatchObject({ code: E2EE_ERROR_CODES.BINDING_INVALID });
      await expect(refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_1, request: stale }))).resolves.toMatchObject({ code: E2EE_ERROR_CODES.BINDING_INVALID });
    });

    it("retire l'appareil précédent de la MÊME session et rend son numéro à l'appareil qui le remplace", async () => {
      const { directory, store } = directoryWith();
      const first = await enroll(directory, ALICE, SESSION_1, fakeDeviceKeys({ oneTime: 10, registrationId: 100 }));
      const replaced = await enroll(directory, ALICE, SESSION_1, fakeDeviceKeys({ oneTime: 3, registrationId: 200 }));

      expect(replaced.deviceId).toBe(first.deviceId);
      expect(store.collections.E2EEDevice.rows).toHaveLength(1);
      expect(store.collections.E2EEDevice.rows[0]).toMatchObject({ registrationId: 200, retiredAt: null, identityKey: replaced.keys.identityKey });
      expect(store.collections.E2EEOneTimePreKey.rows.map((row) => row.publicKey)).toEqual(replaced.keys.oneTimePreKeys.map((key) => key.publicKey));
    });

    it("ne rend jamais un numéro retiré à la MÊME registrationId : l'appareil périmé resterait indécelable (stale du 409)", async () => {
      const { directory } = directoryWith();
      await enroll(directory, ALICE, SESSION_1, fakeDeviceKeys({ registrationId: 100 }));
      const again = await enroll(directory, ALICE, SESSION_1, fakeDeviceKeys({ registrationId: 100 }));

      expect(again.deviceId).toBe(2);
    });

    it('réallouer le plus petit numéro libre : 127 enrôlements suivis chacun d’un retrait laissent le 128e réussir', async () => {
      const { directory } = directoryWith();
      const sessionOf = (round: number) => round.toString(16).padStart(24, '0');
      for (let round = 1; round <= 127; round += 1) {
        const { deviceId } = await enroll(directory, ALICE, sessionOf(round), fakeDeviceKeys({ registrationId: round }));
        await directory.retireDevice({ userId: ALICE, deviceId });
      }

      const last = await enroll(directory, ALICE, sessionOf(128), fakeDeviceKeys({ registrationId: 128 }));

      expect(last).toMatchObject({ deviceId: 1, created: true });
    });

    it(`borne les appareils actifs d'un compte à ${E2EE_MAX_ACTIVE_DEVICES} : au-delà, un code lisible et rien d'écrit`, async () => {
      const { directory, store } = directoryWith();
      const sessions = Array.from({ length: E2EE_MAX_ACTIVE_DEVICES + 1 }, (_, index) => sessionIdOf(index + 1));
      sessions.forEach((id) => liveSession(store, id));
      for (const sessionId of sessions.slice(0, -1)) await enroll(directory, ALICE, sessionId);

      const error = await refusal(enroll(directory, ALICE, sessions[sessions.length - 1]));

      expect(error).toMatchObject({ code: E2EE_ERROR_CODES.DEVICE_LIMIT_REACHED, status: 409 });
      expect(error.message).toMatch(/retirez/i);
      expect(store.collections.E2EEDevice.rows).toHaveLength(E2EE_MAX_ACTIVE_DEVICES);
    });

    it('tient la borne sous la concurrence : des enrôlements simultanés ne dépassent jamais le plafond ni ne partagent un numéro', async () => {
      const { directory, store } = directoryWith();
      const sessions = Array.from({ length: E2EE_MAX_ACTIVE_DEVICES * 2 }, (_, index) => sessionIdOf(index + 1));
      sessions.forEach((id) => liveSession(store, id));

      const outcomes = await Promise.allSettled(sessions.map((sessionId) => enroll(directory, ALICE, sessionId)));

      const enrolled = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value.deviceId] : []));
      const active = store.collections.E2EEDevice.rows.filter((row) => row.retiredAt === null);
      expect(active).toHaveLength(E2EE_MAX_ACTIVE_DEVICES);
      expect(new Set(enrolled).size).toBe(enrolled.length);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => (outcome as PromiseRejectedResult).reason.code))
        .toEqual(Array(sessions.length - enrolled.length).fill(E2EE_ERROR_CODES.DEVICE_LIMIT_REACHED));
    });

    it("garde un destinataire joignable : même 33 enrôlements sur 33 sessions ne demandent jamais plus d'enveloppes qu'un envoi n'en porte", async () => {
      const { directory, store } = directoryWith();
      const sessions = Array.from({ length: 33 }, (_, index) => sessionIdOf(index + 1));
      sessions.forEach((id) => liveSession(store, id));
      await Promise.allSettled(sessions.map((sessionId) => enroll(directory, BOB, sessionId)));
      const sender = await enroll(directory, ALICE, SESSION_1);
      await Promise.allSettled(sessions.map((sessionId) => enroll(directory, ALICE, sessionId)));

      const recipients = [...(await directory.listDevices(BOB)).map((device) => ({ ...device, userId: BOB })),
        ...(await directory.listDevices(ALICE)).filter((device) => device.deviceId !== sender.deviceId).map((device) => ({ ...device, userId: ALICE }))];
      const envelopes = recipients.map((device) => ({ userId: device.userId, deviceId: device.deviceId, registrationId: device.registrationId, type: 3, body: 'Y2lwaGVy' }));

      expect(envelopes.length).toBeLessThanOrEqual(E2EE_ENVELOPE_BOUNDS.maxEnvelopes);
      expect(E2EE_SEND_SHAPE.envelopes.safeParse(envelopes).success).toBe(true);
    });

    it("retire, à l'enrôlement suivant du compte, l'appareil dont la session est close ou expirée, et lui rend sa place", async () => {
      const { directory, store } = directoryWith();
      const closed = await enroll(directory, ALICE, SESSION_1);
      liveSession(store, sessionIdOf(9));
      const expired = await enroll(directory, ALICE, sessionIdOf(9));
      Object.assign(store.collections.UserSession.rows.find((row) => row.id === SESSION_1)!, { isValid: false, invalidatedAt: NOW });
      Object.assign(store.collections.UserSession.rows.find((row) => row.id === sessionIdOf(9))!, { expiresAt: new Date(NOW.getTime() - 1) });

      const next = await enroll(directory, ALICE, SESSION_2);

      expect([closed.deviceId, expired.deviceId]).toEqual([1, 2]);
      expect(next.deviceId).toBe(1);
      expect(await directory.listDevices(ALICE)).toEqual([{ deviceId: 1, registrationId: next.keys.registrationId }]);
    });
  });

  describe('publication des clés', () => {
    it("n'accepte que la session qui a enrôlé l'appareil", async () => {
      const { directory } = directoryWith();
      const { deviceId } = await enroll(directory, ALICE, SESSION_1);

      const error = await refusal(directory.publishKeys({ userId: ALICE, sessionId: SESSION_2, deviceId, request: { oneTimePreKeys: [] } }));

      expect(error.code).toBe(E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
      expect(error.status).toBe(403);
    });

    it('ajoute des pré-clés sans doubler un keyId déjà publié, et rend le stock restant', async () => {
      const { directory } = directoryWith();
      const { deviceId, keys } = await enroll(directory, ALICE, SESSION_1);
      const more = fakeDeviceKeys({ oneTime: 5, firstKeyId: 9 }).oneTimePreKeys;

      const stock = await directory.publishKeys({ userId: ALICE, sessionId: SESSION_1, deviceId, request: { oneTimePreKeys: more } });

      expect(stock).toEqual({ deviceId, oneTimePreKeys: 13, kyberPreKeys: 10 });
      expect(keys.oneTimePreKeys).toHaveLength(10);
    });

    it('refuse un stock de pré-clés uniques au-delà de 200 par nature', async () => {
      const { directory } = directoryWith();
      const { deviceId } = await enroll(directory, ALICE, SESSION_1, fakeDeviceKeys({ oneTime: 100 }));
      await directory.publishKeys({ userId: ALICE, sessionId: SESSION_1, deviceId, request: { oneTimePreKeys: fakeDeviceKeys({ oneTime: 100, firstKeyId: 101 }).oneTimePreKeys } });

      const error = await refusal(directory.publishKeys({ userId: ALICE, sessionId: SESSION_1, deviceId, request: { oneTimePreKeys: fakeDeviceKeys({ oneTime: 1, firstKeyId: 201 }).oneTimePreKeys } }));

      expect(error.code).toBe(E2EE_ERROR_CODES.PREKEY_STOCK_FULL);
    });

    it('remplace la pré-clé signée seulement si sa signature est celle de l’identité enrôlée', async () => {
      const { directory, store } = directoryWith();
      const { deviceId, keys } = await enroll(directory, ALICE, SESSION_1);
      const foreign = fakeDeviceKeys().signedPreKey;

      const error = await refusal(directory.publishKeys({ userId: ALICE, sessionId: SESSION_1, deviceId, request: { signedPreKey: { ...foreign, keyId: 2 } } }));
      expect(error.code).toBe(E2EE_ERROR_CODES.SIGNATURE_INVALID);

      await directory.publishKeys({ userId: ALICE, sessionId: SESSION_1, deviceId, request: { signedPreKey: keys.signed(2) } });
      expect(store.collections.E2EEDevice.rows[0].signedPreKeyId).toBe(2);
    });
  });

  describe('bundles', () => {
    it('50 demandes concurrentes sur 10 pré-clés uniques rendent exactement 10 bundles à clé distincte', async () => {
      const { directory } = directoryWith();
      await enroll(directory, BOB, SESSION_1);

      const results = await Promise.all(
        Array.from({ length: 50 }, () => directory.reserveBundles({ requesterUserId: ALICE, targetUserId: BOB })),
      );
      const bundles = results.flat();

      const ec = bundles.map((bundle) => bundle.preKey?.keyId).filter((id): id is number => id !== undefined);
      const kyber = bundles.filter((bundle) => !bundle.kyberPreKey.lastResort).map((bundle) => bundle.kyberPreKey.keyId);
      expect(bundles).toHaveLength(50);
      expect(ec).toHaveLength(10);
      expect(new Set(ec).size).toBe(10);
      expect(kyber).toHaveLength(10);
      expect(new Set(kyber).size).toBe(10);
      expect(bundles.filter((bundle) => bundle.preKey === null)).toHaveLength(40);
    });

    it('sert la pré-clé Kyber de dernier recours, signée, quand le stock unique est vide', async () => {
      const { directory } = directoryWith();
      const { keys } = await enroll(directory, BOB, SESSION_1, fakeDeviceKeys());

      const [bundle] = await directory.reserveBundles({ requesterUserId: ALICE, targetUserId: BOB });

      expect(bundle.preKey).toBeNull();
      expect(bundle.kyberPreKey).toEqual({ ...keys.kyberLastResort, lastResort: true });
      expect(bundle.identityKey).toBe(keys.identityKey);
      expect(bundle.signedPreKey).toEqual(keys.signedPreKey);
    });

    it("ne sert ni un appareil retiré, ni un appareil hors de la liste demandée", async () => {
      const { directory, store } = directoryWith();
      liveSession(store, sessionIdOf(3));
      await enroll(directory, BOB, SESSION_1);
      await enroll(directory, BOB, SESSION_2);
      await enroll(directory, BOB, sessionIdOf(3));
      await directory.retireDevice({ userId: BOB, deviceId: 1 });

      const all = await directory.reserveBundles({ requesterUserId: ALICE, targetUserId: BOB });
      const only3 = await directory.reserveBundles({ requesterUserId: ALICE, targetUserId: BOB, deviceIds: [3, 1] });

      expect(all.map((bundle) => bundle.deviceId)).toEqual([2, 3]);
      expect(only3.map((bundle) => bundle.deviceId)).toEqual([3]);
    });

    it('liste les appareils actifs sans consommer de pré-clé', async () => {
      const { directory, store } = directoryWith();
      const { keys } = await enroll(directory, BOB, SESSION_1);

      const devices = await directory.listDevices(BOB);

      expect(devices).toEqual([{ deviceId: 1, registrationId: keys.registrationId }]);
      expect(store.collections.E2EEOneTimePreKey.rows.every((row) => row.usedAt === null)).toBe(true);
    });
  });

  describe('retrait', () => {
    it("pose retiredAt et efface les pré-clés restantes d'un appareil du compte", async () => {
      const { directory, store } = directoryWith();
      const { deviceId } = await enroll(directory, ALICE, SESSION_1);

      await directory.retireDevice({ userId: ALICE, deviceId });

      expect(store.collections.E2EEDevice.rows[0].retiredAt).toBeInstanceOf(Date);
      expect(store.collections.E2EEOneTimePreKey.rows).toHaveLength(0);
      await expect(directory.listDevices(ALICE)).resolves.toEqual([]);
    });

    it("efface les enveloppes encore en attente de l'appareil retiré, et seulement les siennes", async () => {
      const { directory, store } = directoryWith();
      const { deviceId, keys } = await enroll(directory, ALICE, SESSION_1);
      const envelope = (recipientDeviceId: number) => store.collections.MessageEnvelope.insert({
        messageId: `${recipientDeviceId}`.repeat(24).slice(0, 24), conversationId: 'f'.repeat(24), recipientUserId: ALICE, recipientDeviceId,
        recipientRegistrationId: keys.registrationId,
        senderUserId: BOB, senderDeviceId: 1, type: 3, body: 'Y2lwaGVy',
      });
      envelope(deviceId);
      envelope(9);

      await directory.retireDevice({ userId: ALICE, deviceId });

      expect(store.collections.MessageEnvelope.rows.map((row) => row.recipientDeviceId)).toEqual([9]);
    });

    it("ne retire pas l'appareil d'un autre compte", async () => {
      const { directory } = directoryWith();
      const { deviceId } = await enroll(directory, BOB, SESSION_1);

      const error = await refusal(directory.retireDevice({ userId: ALICE, deviceId }));

      expect(error.status).toBe(404);
    });
  });
});
