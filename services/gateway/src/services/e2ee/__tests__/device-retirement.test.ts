import {
  eraseE2EEDataOfUser,
  retireDevicesOfSession,
  sweepDevicesOfEndedSessions,
} from '../device-retirement';
import { createE2EEDirectory } from '../E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../E2EEEnvelopeRelay';
import { fakeDeviceKeys, fakeVerifier } from './fake-signatures';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const NOW = new Date('2026-10-24T12:00:00Z');
const sessionIdOf = (index: number): string => index.toString(16).padStart(24, 'e');

/**
 * `closed` : close sans motif ; `evicted` et `revoked` : closes par
 * `SessionService` avec le motif qu'il écrit ; `expired` : échue, pas encore balayée.
 */
type SessionState = 'live' | 'closed' | 'expired' | 'evicted' | 'revoked' | 'gone';

const REASONS: Partial<Record<SessionState, string>> = { evicted: 'session_limit_exceeded', revoked: 'user_revoked' };

function storeWith(devices: { userId: string; deviceId: number; session: SessionState }[]) {
  const store = createFakeE2EEStore();
  devices.forEach((device, index) => {
    const sessionId = sessionIdOf(index + 1);
    if (device.session !== 'gone') {
      store.collections.UserSession.insert({
        id: sessionId,
        userId: device.userId,
        isValid: device.session === 'live' || device.session === 'expired',
        expiresAt: new Date(NOW.getTime() + (device.session === 'expired' ? -1 : 86_400_000)),
        ...(REASONS[device.session] ? { invalidatedReason: REASONS[device.session] } : {}),
      });
    }
    store.collections.E2EEDevice.insert({ userId: device.userId, deviceId: device.deviceId, registrationId: 10 + index, sessionId, identityKey: 'ik', platform: 'ios' });
    store.collections.E2EEOneTimePreKey.insert({ userId: device.userId, deviceId: device.deviceId, registrationId: 10 + index, kind: 'ec', keyId: 1, publicKey: 'cGs=' });
    store.collections.MessageEnvelope.insert({
      messageId: `${index + 1}`.padStart(24, '0'), conversationId: 'f'.repeat(24), recipientUserId: device.userId, recipientDeviceId: device.deviceId, recipientRegistrationId: 10 + index,
      senderUserId: BOB, senderDeviceId: 1, type: 3, body: 'Y2lwaGVy',
    });
  });
  return store;
}

const activeOf = (store: FakeE2EEStore) =>
  store.collections.E2EEDevice.rows.filter((row) => row.retiredAt === null).map((row) => `${row.userId === ALICE ? 'alice' : 'bob'}:${row.deviceId}`);

const leftoversOf = (store: FakeE2EEStore, userId: string, deviceId: number) => ({
  preKeys: store.collections.E2EEOneTimePreKey.rows.filter((row) => row.userId === userId && row.deviceId === deviceId).length,
  envelopes: store.collections.MessageEnvelope.rows.filter((row) => row.recipientUserId === userId && row.recipientDeviceId === deviceId).length,
});

describe("le retrait d'un appareil chiffré à la fin de sa session (#12543)", () => {
  it("retire l'appareil d'une session close avec ses pré-clés et ses enveloppes, et laisse les autres", async () => {
    const store = storeWith([{ userId: ALICE, deviceId: 1, session: 'closed' }, { userId: ALICE, deviceId: 2, session: 'live' }]);

    await expect(retireDevicesOfSession(store.prisma as never, { sessionId: sessionIdOf(1), now: NOW })).resolves.toBe(1);

    expect(activeOf(store)).toEqual(['alice:2']);
    expect(leftoversOf(store, ALICE, 1)).toEqual({ preKeys: 0, envelopes: 0 });
    expect(leftoversOf(store, ALICE, 2)).toEqual({ preKeys: 1, envelopes: 1 });
  });

  it("ne retire rien quand la session nommée est encore vivante", async () => {
    const store = storeWith([{ userId: ALICE, deviceId: 1, session: 'live' }]);

    await expect(retireDevicesOfSession(store.prisma as never, { sessionId: sessionIdOf(1), now: NOW })).resolves.toBe(0);

    expect(activeOf(store)).toEqual(['alice:1']);
  });

  it('le balayage retire, sur tous les comptes et par lots, chaque appareil dont la session est close, expirée ou effacée', async () => {
    const store = storeWith([
      { userId: ALICE, deviceId: 1, session: 'closed' },
      { userId: ALICE, deviceId: 2, session: 'live' },
      { userId: ALICE, deviceId: 3, session: 'expired' },
      { userId: BOB, deviceId: 1, session: 'gone' },
      { userId: BOB, deviceId: 2, session: 'live' },
    ]);

    await expect(sweepDevicesOfEndedSessions(store.prisma as never, { now: NOW, batchSize: 2 })).resolves.toBe(3);

    expect(activeOf(store)).toEqual(['alice:2', 'bob:2']);
    expect(leftoversOf(store, BOB, 1)).toEqual({ preKeys: 0, envelopes: 0 });
  });

  // GW-13 (#19016) — l'enveloppe d'une génération qui peut revenir reste jusqu'au
  // balayage de 30 jours ; une fin explicite, sans motif ou une session disparue l'efface.
  it('le balayage garde les enveloppes des sessions échues ou évincées, efface celles des sessions révoquées, closes sans motif ou disparues', async () => {
    const store = storeWith([
      { userId: ALICE, deviceId: 1, session: 'expired' },
      { userId: ALICE, deviceId: 2, session: 'evicted' },
      { userId: ALICE, deviceId: 3, session: 'revoked' },
      { userId: ALICE, deviceId: 4, session: 'closed' },
      { userId: BOB, deviceId: 1, session: 'gone' },
    ]);

    await expect(sweepDevicesOfEndedSessions(store.prisma as never, { now: NOW })).resolves.toBe(5);

    expect(activeOf(store)).toEqual([]);
    expect([1, 2, 3, 4].map((deviceId) => leftoversOf(store, ALICE, deviceId))).toEqual([
      { preKeys: 0, envelopes: 1 },
      { preKeys: 0, envelopes: 1 },
      { preKeys: 0, envelopes: 0 },
      { preKeys: 0, envelopes: 0 },
    ]);
    expect(leftoversOf(store, BOB, 1)).toEqual({ preKeys: 0, envelopes: 0 });
  });

  it("la purge du compte efface ses appareils, ses pré-clés et les enveloppes qui lui sont adressées, sans toucher un autre compte", async () => {
    const store = storeWith([{ userId: ALICE, deviceId: 1, session: 'live' }, { userId: BOB, deviceId: 1, session: 'live' }]);

    await expect(eraseE2EEDataOfUser(store.prisma as never, ALICE)).resolves.toEqual({ devices: 1, preKeys: 1, envelopes: 1 });

    expect(store.collections.E2EEDevice.rows.map((row) => row.userId)).toEqual([BOB]);
    expect(leftoversOf(store, BOB, 1)).toEqual({ preKeys: 1, envelopes: 1 });
  });

  // #12544 — après la purge, aucun correspondant ne réserve plus de bundle vers le
  // compte : l'annuaire n'a plus aucun de ses appareils.
  it('après la purge du compte, plus aucune réservation de bundle n’aboutit vers lui (contrôle : une avant)', async () => {
    const store = createFakeE2EEStore();
    const SESSION = 'a5'.repeat(12);
    store.collections.UserSession.insert({ id: SESSION, userId: ALICE, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) });
    const directory = createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => NOW });
    const keys = fakeDeviceKeys({ oneTime: 2, kyber: 2 });
    await directory.enrollDevice({
      userId: ALICE,
      sessionId: SESSION,
      request: {
        binding: keys.binding(ALICE, NOW.getTime()), registrationId: keys.registrationId, identityKey: keys.identityKey,
        signedPreKey: keys.signedPreKey, kyberLastResort: keys.kyberLastResort, platform: 'ios',
        oneTimePreKeys: keys.oneTimePreKeys, kyberPreKeys: keys.kyberPreKeys,
      },
    });
    await expect(directory.reserveBundles({ requesterUserId: BOB, targetUserId: ALICE })).resolves.toHaveLength(1);

    await eraseE2EEDataOfUser(store.prisma as never, ALICE);

    await expect(directory.reserveBundles({ requesterUserId: BOB, targetUserId: ALICE })).resolves.toEqual([]);
    expect(store.collections.E2EEOneTimePreKey.rows.filter((row) => row.userId === ALICE)).toEqual([]);
  });

  // GWX-02 (#12544) — les messages d'un compte effacé sont anonymisés pour tout
  // le monde : un appareil de son correspondant qui se reconnecte ne doit pas en
  // recevoir encore les enveloppes, déchiffrables, pendant 30 jours.
  it('la purge du compte efface aussi les enveloppes qu’il a ÉMISES : son correspondant ne les reçoit plus, celles d’un tiers restent', async () => {
    const CAROL = 'c3'.repeat(12);
    const BOB_SESSION = 'b5'.repeat(12);
    const store = createFakeE2EEStore();
    store.collections.E2EEDevice.insert({ userId: BOB, deviceId: 1, registrationId: 7, sessionId: BOB_SESSION, identityKey: 'ik', platform: 'ios' });
    const envelope = (n: number, senderUserId: string, recipientUserId: string, recipientRegistrationId: number) =>
      store.collections.MessageEnvelope.insert({
        messageId: `${n}`.padStart(24, '0'), conversationId: 'f'.repeat(24), recipientUserId, recipientDeviceId: 1, recipientRegistrationId,
        senderUserId, senderDeviceId: 1, type: 2, body: Buffer.from(`de ${n}`).toString('base64'),
      });
    envelope(1, ALICE, BOB, 7);
    envelope(2, CAROL, BOB, 7);
    envelope(3, BOB, ALICE, 9);

    await expect(eraseE2EEDataOfUser(store.prisma as never, ALICE)).resolves.toMatchObject({ envelopes: 2 });

    const served = await createE2EEEnvelopeRelay({ prisma: store.prisma as never }).listFor({ userId: BOB, sessionId: BOB_SESSION });
    expect(served.map((row) => row.senderUserId)).toEqual([CAROL]);
    expect(store.collections.MessageEnvelope.rows.map((row) => row.messageId)).toEqual(['2'.padStart(24, '0')]);
  });
});
