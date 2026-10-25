/**
 * UN ENRÔLEMENT REJOUÉ NE REND JAMAIS DEUX FOIS LA MÊME PRÉ-CLÉ UNIQUE (#12933).
 *
 * Audit adversarial de c442cd8e7a (#12882) : un enrôlement avec lot d'une
 * identité active supprimait TOUTES les pré-clés uniques de sa génération,
 * réservées comprises, puis réinsérait le lot reçu. La preuve de liaison valant
 * dix minutes de part et d'autre, rejouer la requête capturée remettait en
 * service une clé déjà remise à un pair : deux pairs ouvraient leur session sur
 * la même pré-clé « unique ».
 *
 * Deux fermetures, chacune suffisante :
 * - une pré-clé réservée n'est jamais effacée par un remplacement, et son
 *   `keyId` n'est jamais réinséré dans la même génération ;
 * - une preuve de liaison ne sert qu'une fois par installation : un horodatage
 *   qui n'est pas STRICTEMENT plus récent que la dernière preuve acceptée est
 *   refusé, sauf la reprise idempotente de la même requête par la même session.
 */
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { createE2EEDirectory, type E2EEDirectory } from '../E2EEDirectory';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeSign, fakeVerifier, randomKey } from './fake-signatures';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const CAROL = 'e5'.repeat(12);
const SESSION_ALICE = 'c3'.repeat(12);
const SESSION_REPLAY = 'd4'.repeat(12);
const SESSION_LATER = 'f6'.repeat(12);
const NOW = new Date('2026-10-25T12:00:00Z');
const MINUTE = 60_000;

type Keys = ReturnType<typeof fakeDeviceKeys>;

const openSessions = (store: FakeE2EEStore) =>
  [SESSION_ALICE, SESSION_REPLAY, SESSION_LATER].forEach((id) =>
    store.collections.UserSession.insert({ id, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) }));

const enrollmentOf = (keys: Keys, signedAt: number, batches: Pick<Keys, 'oneTimePreKeys' | 'kyberPreKeys'> = keys) => ({
  binding: keys.binding(ALICE, signedAt),
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios' as const,
  oneTimePreKeys: batches.oneTimePreKeys,
  kyberPreKeys: batches.kyberPreKeys,
});

const reinstalledBatchOf = (keys: Keys) => ({
  oneTimePreKeys: keys.oneTimePreKeys.map(({ keyId }) => ({ keyId, publicKey: randomKey() })),
  kyberPreKeys: keys.kyberPreKeys.map(({ keyId }) => {
    const publicKey = randomKey(1569);
    return { keyId, publicKey, signature: fakeSign(keys.identityKey, publicKey) };
  }),
});

function setup() {
  const store = createFakeE2EEStore();
  openSessions(store);
  const clock = { now: NOW };
  const directory = createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => clock.now });
  return { store, clock, directory };
}

const advance = (clock: { now: Date }, minutes: number) => {
  clock.now = new Date(clock.now.getTime() + minutes * MINUTE);
};

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);

const activeDevices = (store: FakeE2EEStore) => store.collections.E2EEDevice.rows.filter((row) => row.retiredAt === null);

const bundleFor = async (directory: E2EEDirectory, requesterUserId: string) => {
  const [bundle] = await directory.reserveBundles({ requesterUserId, targetUserId: ALICE });
  return bundle;
};

describe('#12933 — une pré-clé unique remise à un pair n’est jamais remise en service', () => {
  it('la pré-clé remise à Bob n’est pas remise à Carol après le rejeu de la même requête (témoin de l’audit)', async () => {
    const { directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 1, kyber: 1 });
    const captured = enrollmentOf(keys, NOW.getTime());
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: captured });
    const toBob = await bundleFor(directory, BOB);
    expect(toBob.preKey).not.toBeNull();

    advance(clock, 5);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_REPLAY, request: captured }).catch(() => undefined);
    const toCarol = await bundleFor(directory, CAROL);

    expect(toCarol.preKey?.publicKey).not.toBe(toBob.preKey?.publicKey);
    expect(toCarol.kyberPreKey.lastResort || toCarol.kyberPreKey.publicKey !== toBob.kyberPreKey.publicKey).toBe(true);
  });

  it('un réenrôlement complet par une preuve FRAÎCHE ne réinsère jamais un keyId déjà remis', async () => {
    const { directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 2, kyber: 2 });
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: enrollmentOf(keys, NOW.getTime()) });
    const toBob = await bundleFor(directory, BOB);

    advance(clock, 1);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_LATER, request: enrollmentOf(keys, clock.now.getTime(), reinstalledBatchOf(keys)) });
    const served = [await bundleFor(directory, CAROL), await bundleFor(directory, CAROL), await bundleFor(directory, CAROL)];

    expect(served.map((bundle) => bundle.preKey?.keyId)).not.toContain(toBob.preKey?.keyId);
    expect(served.filter((bundle) => !bundle.kyberPreKey.lastResort).map((bundle) => bundle.kyberPreKey.keyId)).not.toContain(toBob.kyberPreKey.keyId);
  });

  it('le remplacement garde la trace de la réservation : la ligne remise à Bob reste réservée à Bob', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 2, kyber: 0 });
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: enrollmentOf(keys, NOW.getTime()) });
    const toBob = await bundleFor(directory, BOB);

    advance(clock, 1);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_LATER, request: enrollmentOf(keys, clock.now.getTime(), reinstalledBatchOf(keys)) });

    const reserved = store.collections.E2EEOneTimePreKey.rows.filter((row) => row.kind === 'ec' && row.usedAt !== null);
    expect(reserved).toHaveLength(1);
    expect(reserved[0]).toMatchObject({ keyId: toBob.preKey?.keyId, publicKey: toBob.preKey?.publicKey, usedBy: BOB });
  });

  it('une pré-clé héritée sans champ usedAt (ligne d’avant #12547) est remplacée, jamais servie après une réinstallation', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 1, kyber: 0 });
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: enrollmentOf(keys, NOW.getTime(), { oneTimePreKeys: [], kyberPreKeys: [] }) });
    const [device] = activeDevices(store);
    const dead = randomKey();
    const legacy = store.collections.E2EEOneTimePreKey.insert({
      userId: ALICE, deviceId: device.deviceId, registrationId: keys.registrationId, kind: 'ec', keyId: 1, publicKey: dead,
    });
    delete legacy.usedAt;
    delete legacy.usedBy;

    advance(clock, 1);
    const reinstalled = reinstalledBatchOf(keys);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_LATER, request: enrollmentOf(keys, clock.now.getTime(), reinstalled) });

    expect((await bundleFor(directory, BOB)).preKey?.publicKey).toBe(reinstalled.oneTimePreKeys[0].publicKey);
  });
});

describe('#12933 — une preuve de liaison ne sert qu’une fois par installation', () => {
  it('la même requête rejouée depuis une AUTRE session est refusée, et l’appareil reste lié à la sienne', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 2, kyber: 2 });
    const captured = enrollmentOf(keys, NOW.getTime());
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: captured });

    advance(clock, 5);
    const error = await refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_REPLAY, request: captured }));

    expect(error).toMatchObject({ code: E2EE_ERROR_CODES.BINDING_INVALID, status: 400 });
    expect(activeDevices(store).map((row) => row.sessionId)).toEqual([SESSION_ALICE]);
  });

  it('une preuve plus ANCIENNE que la dernière acceptée est refusée, même dans la fenêtre', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 1, kyber: 1 });
    const older = enrollmentOf(keys, NOW.getTime());
    advance(clock, 2);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: enrollmentOf(keys, clock.now.getTime()) });

    const error = await refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_REPLAY, request: older }));

    expect(error).toMatchObject({ code: E2EE_ERROR_CODES.BINDING_INVALID });
    expect(activeDevices(store).map((row) => row.sessionId)).toEqual([SESSION_ALICE]);
  });

  it('la reprise de la MÊME requête par la MÊME session (réponse perdue) réussit sans rien changer', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 2, kyber: 2 });
    const request = enrollmentOf(keys, NOW.getTime());
    const first = await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request });
    await bundleFor(directory, BOB);
    const before = store.collections.E2EEOneTimePreKey.rows.map((row) => ({ ...row }));

    advance(clock, 1);
    const retried = await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request });

    expect(retried).toEqual({ deviceId: first.deviceId, created: false });
    expect(store.collections.E2EEOneTimePreKey.rows).toEqual(before);
  });

  it('une preuve plus récente, d’une session nouvelle, est acceptée et rebranche l’appareil', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 1, kyber: 1 });
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: enrollmentOf(keys, NOW.getTime()) });

    advance(clock, 3);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_LATER, request: enrollmentOf(keys, clock.now.getTime(), { oneTimePreKeys: [], kyberPreKeys: [] }) });

    expect(activeDevices(store).map((row) => row.sessionId)).toEqual([SESSION_LATER]);
  });

  it('un appareil enrôlé avant ce correctif (aucune preuve retenue) accepte la prochaine preuve, puis la retient', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 1, kyber: 1 });
    const request = enrollmentOf(keys, NOW.getTime());
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request });
    activeDevices(store).forEach((row) => delete row.bindingSignedAt);

    advance(clock, 1);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_LATER, request });
    const error = await refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_REPLAY, request }));

    expect(activeDevices(store).map((row) => row.sessionId)).toEqual([SESSION_LATER]);
    expect(error).toMatchObject({ code: E2EE_ERROR_CODES.BINDING_INVALID });
  });

  it('une preuve rejouée après le retrait de l’appareil (session finie) ne lui rend pas sa place ; une preuve fraîche, si', async () => {
    const { store, directory, clock } = setup();
    const keys = fakeDeviceKeys({ oneTime: 1, kyber: 1 });
    const captured = enrollmentOf(keys, NOW.getTime());
    const first = await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: captured });
    store.collections.UserSession.rows.filter((row) => row.id === SESSION_ALICE).forEach((row) => Object.assign(row, { isValid: false }));
    advance(clock, 1);
    await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_LATER, request: enrollmentOf(fakeDeviceKeys(), clock.now.getTime()) }).catch(() => undefined);
    expect(store.collections.E2EEDevice.rows.find((row) => row.deviceId === first.deviceId)?.retiredAt).not.toBeNull();

    const error = await refusal(directory.enrollDevice({ userId: ALICE, sessionId: SESSION_REPLAY, request: captured }));
    expect(error).toMatchObject({ code: E2EE_ERROR_CODES.BINDING_INVALID });

    advance(clock, 1);
    const fresh = await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_REPLAY, request: enrollmentOf(keys, clock.now.getTime()) });
    expect(fresh.deviceId).toBe(first.deviceId);
  });

  it('deux rejeux SIMULTANÉS depuis deux sessions : un seul appareil, une seule session', async () => {
    const { store, directory } = setup();
    const keys = fakeDeviceKeys({ oneTime: 2, kyber: 2 });
    const captured = enrollmentOf(keys, NOW.getTime());

    const outcomes = await Promise.allSettled([
      directory.enrollDevice({ userId: ALICE, sessionId: SESSION_ALICE, request: captured }),
      directory.enrollDevice({ userId: ALICE, sessionId: SESSION_REPLAY, request: captured }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({ reason: { code: E2EE_ERROR_CODES.BINDING_INVALID } });
    expect(activeDevices(store)).toHaveLength(1);
    expect(store.collections.E2EEOneTimePreKey.rows.filter((row) => row.kind === 'ec')).toHaveLength(2);
  });
});
