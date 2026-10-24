import {
  eraseE2EEDataOfUser,
  retireDevicesOfSession,
  sweepDevicesOfEndedSessions,
} from '../device-retirement';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const NOW = new Date('2026-10-24T12:00:00Z');
const sessionIdOf = (index: number): string => index.toString(16).padStart(24, 'e');

function storeWith(devices: { userId: string; deviceId: number; session: 'live' | 'closed' | 'expired' | 'gone' }[]) {
  const store = createFakeE2EEStore();
  devices.forEach((device, index) => {
    const sessionId = sessionIdOf(index + 1);
    if (device.session !== 'gone') {
      store.collections.UserSession.insert({
        id: sessionId,
        userId: device.userId,
        isValid: device.session !== 'closed',
        expiresAt: new Date(NOW.getTime() + (device.session === 'expired' ? -1 : 86_400_000)),
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

  it("la purge du compte efface ses appareils, ses pré-clés et les enveloppes qui lui sont adressées, sans toucher un autre compte", async () => {
    const store = storeWith([{ userId: ALICE, deviceId: 1, session: 'live' }, { userId: BOB, deviceId: 1, session: 'live' }]);

    await expect(eraseE2EEDataOfUser(store.prisma as never, ALICE)).resolves.toEqual({ devices: 1, preKeys: 1, envelopes: 1 });

    expect(store.collections.E2EEDevice.rows.map((row) => row.userId)).toEqual([BOB]);
    expect(leftoversOf(store, BOB, 1)).toEqual({ preKeys: 1, envelopes: 1 });
  });
});
