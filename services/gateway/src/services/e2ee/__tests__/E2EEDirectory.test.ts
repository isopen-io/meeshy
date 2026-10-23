import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
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

function directoryWith(options: { store?: FakeE2EEStore; verifier?: SignatureVerifier } = {}) {
  const store = options.store ?? createFakeE2EEStore();
  const directory = createE2EEDirectory({
    prisma: store.prisma as never,
    verifier: options.verifier ?? fakeVerifier,
    now: () => new Date('2026-10-23T12:00:00Z'),
  });
  return { store, directory };
}

const enrollmentOf = (keys: ReturnType<typeof fakeDeviceKeys>) => ({
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios' as const,
  oneTimePreKeys: keys.oneTimePreKeys,
  kyberPreKeys: keys.kyberPreKeys,
});

async function enroll(directory: E2EEDirectory, userId: string, sessionId: string, keys = fakeDeviceKeys({ oneTime: 10, kyber: 10 })) {
  const result = await directory.enrollDevice({ userId, sessionId, request: enrollmentOf(keys) });
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
      const forged = { ...enrollmentOf(keys), kyberPreKeys: [...keys.kyberPreKeys.slice(1), { ...keys.kyberPreKeys[0], signature: fakeSign(randomKey(), 'x') }] };

      const error = await refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_1, request: forged }));

      expect(error.code).toBe(E2EE_ERROR_CODES.SIGNATURE_INVALID);
      expect(error.status).toBe(400);
      expect(store.collections.E2EEDevice.rows).toHaveLength(0);
      expect(store.collections.E2EEDeviceCounter.rows).toHaveLength(0);
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
      const again = await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_2, request: enrollmentOf(first.keys) });

      expect(again).toEqual({ deviceId: first.deviceId, created: false });
      expect(store.collections.E2EEDevice.rows).toHaveLength(1);
      expect(store.collections.E2EEDevice.rows[0].sessionId).toBe(SESSION_2);
    });

    it("retire l'appareil précédent de la MÊME session et ne réutilise jamais son numéro", async () => {
      const { directory, store } = directoryWith();
      const first = await enroll(directory, ALICE, SESSION_1);
      const replaced = await enroll(directory, ALICE, SESSION_1);

      expect(replaced.deviceId).toBe(2);
      const old = store.collections.E2EEDevice.rows.find((row) => row.deviceId === first.deviceId);
      expect(old?.retiredAt).toBeInstanceOf(Date);
      expect(store.collections.E2EEOneTimePreKey.rows.filter((row) => row.deviceId === first.deviceId)).toHaveLength(0);
    });

    it('refuse un 128e appareil (plage 1…127 de libsignal)', async () => {
      const store = createFakeE2EEStore();
      store.collections.E2EEDeviceCounter.insert({ userId: ALICE, lastDeviceId: 127 });
      const { directory } = directoryWith({ store });

      const error = await refusal(enroll(directory, ALICE, SESSION_1));

      expect(error.code).toBe(E2EE_ERROR_CODES.DEVICE_LIMIT_REACHED);
      expect(store.collections.E2EEDevice.rows).toHaveLength(0);
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
      const { directory } = directoryWith();
      await enroll(directory, BOB, SESSION_1);
      await enroll(directory, BOB, SESSION_1);
      await enroll(directory, BOB, SESSION_2);

      const all = await directory.reserveBundles({ requesterUserId: ALICE, targetUserId: BOB });
      const only3 = await directory.reserveBundles({ requesterUserId: ALICE, targetUserId: BOB, deviceIds: [3] });

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

    it("ne retire pas l'appareil d'un autre compte", async () => {
      const { directory } = directoryWith();
      const { deviceId } = await enroll(directory, BOB, SESSION_1);

      const error = await refusal(directory.retireDevice({ userId: ALICE, deviceId }));

      expect(error.status).toBe(404);
    });
  });
});
