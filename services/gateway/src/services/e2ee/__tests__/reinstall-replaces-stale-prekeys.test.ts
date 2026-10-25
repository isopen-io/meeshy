/**
 * UNE RÉINSTALLATION NE FAIT JAMAIS SERVIR LES PRÉ-CLÉS DE L'INSTALLATION MORTE (#12882).
 *
 * Une installation iOS réinstallée garde son identité (le trousseau survit à la
 * désinstallation) mais perd `e2ee.sqlite` : son compteur d'identifiants de
 * pré-clés repart de 1, et elle s'enrôle avec un lot NEUF sous les MÊMES
 * `keyId`. L'annuaire trouvait l'appareil actif de la même identité et
 * écartait en silence chaque `keyId` déjà présent : il servait les clés
 * PUBLIQUES de l'installation morte, dont plus personne n'a la clé privée.
 *
 * Un enrôlement COMPLET (un lot de pré-clés uniques) d'une identité déjà active
 * ouvre une nouvelle génération de pré-clés : il remplace celles de sa nature.
 * Un réenrôlement sans lot (session nouvelle, base intacte) garde le stock.
 */
import { createE2EEDirectory } from '../E2EEDirectory';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeSign, randomKey, fakeVerifier } from './fake-signatures';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const SESSION_BEFORE = 'c3'.repeat(12);
const SESSION_AFTER = 'd4'.repeat(12);
const NOW = new Date('2026-10-25T12:00:00Z');

type Keys = ReturnType<typeof fakeDeviceKeys>;
type EcKey = { keyId: number; publicKey: string };
type KyberKey = { keyId: number; publicKey: string; signature: string };

const openSessions = (store: FakeE2EEStore) =>
  [SESSION_BEFORE, SESSION_AFTER].forEach((id) =>
    store.collections.UserSession.insert({ id, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) }));

/** L'installation signe une preuve neuve à chaque enrôlement (#12933). */
const requestOf = (keys: Keys, batches: { oneTimePreKeys: EcKey[]; kyberPreKeys: KyberKey[] }, signedAt = NOW.getTime()) => ({
  binding: keys.binding(ALICE, signedAt),
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios' as const,
  ...batches,
});

const publishedBatchOf = (keys: Keys) => ({ oneTimePreKeys: keys.oneTimePreKeys, kyberPreKeys: keys.kyberPreKeys });

const reinstalledBatchOf = (keys: Keys) => ({
  oneTimePreKeys: keys.oneTimePreKeys.map(({ keyId }) => ({ keyId, publicKey: randomKey() })),
  kyberPreKeys: keys.kyberPreKeys.map(({ keyId }) => {
    const publicKey = randomKey(1569);
    return { keyId, publicKey, signature: fakeSign(keys.identityKey, publicKey) };
  }),
});

const unusedOf = (store: FakeE2EEStore, kind: 'ec' | 'kyber') =>
  store.collections.E2EEOneTimePreKey.rows.filter((row) => row.kind === kind && row.usedAt === null).map((row) => row.publicKey);

async function enrolledThenReinstalled() {
  const store = createFakeE2EEStore();
  openSessions(store);
  const directory = createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => NOW });
  const keys = fakeDeviceKeys({ oneTime: 3, kyber: 3 });
  await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_BEFORE, request: requestOf(keys, publishedBatchOf(keys)) });
  const reinstalled = reinstalledBatchOf(keys);
  await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_AFTER, request: requestOf(keys, reinstalled, NOW.getTime() + 1) });
  return { store, directory, keys, reinstalled };
}

describe('#12882 — une réinstallation ne fait jamais servir les pré-clés de l’installation morte', () => {
  it('après un réenrôlement de la même identité avec un lot neuf, le bundle porte une clé que l’appareil détient', async () => {
    const { directory, reinstalled } = await enrolledThenReinstalled();

    const [bundle] = await directory.reserveBundles({ requesterUserId: BOB, targetUserId: ALICE });

    expect(reinstalled.oneTimePreKeys.map((key) => key.publicKey)).toContain(bundle.preKey?.publicKey);
    expect(reinstalled.kyberPreKeys.map((key) => key.publicKey)).toContain(bundle.kyberPreKey.publicKey);
  });

  it('le stock servi est exactement le lot neuf : aucune clé morte n’y reste', async () => {
    const { store, reinstalled } = await enrolledThenReinstalled();

    expect(unusedOf(store, 'ec').sort()).toEqual(reinstalled.oneTimePreKeys.map((key) => key.publicKey).sort());
    expect(unusedOf(store, 'kyber').sort()).toEqual(reinstalled.kyberPreKeys.map((key) => key.publicKey).sort());
  });

  it('un réenrôlement SANS lot (session nouvelle, base intacte) garde le stock publié', async () => {
    const store = createFakeE2EEStore();
    openSessions(store);
    const directory = createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => NOW });
    const keys = fakeDeviceKeys({ oneTime: 3, kyber: 3 });
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_BEFORE, request: requestOf(keys, publishedBatchOf(keys)) });

    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_AFTER, request: requestOf(keys, { oneTimePreKeys: [], kyberPreKeys: [] }, NOW.getTime() + 1) });

    expect(unusedOf(store, 'ec').sort()).toEqual(keys.oneTimePreKeys.map((key) => key.publicKey).sort());
    expect(unusedOf(store, 'kyber').sort()).toEqual(keys.kyberPreKeys.map((key) => key.publicKey).sort());
  });
});
