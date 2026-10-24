/**
 * UNE PLACE N'EST PAS UN APPAREIL (#12592, #12593).
 *
 * Une place `(userId, deviceId)` se reprend : la génération qui l'occupe est
 * désignée par sa `registrationId`. Un retrait, un effacement ou une
 * distribution qui viserait la PLACE frapperait le nouvel occupant. Et une
 * installation qui revient (même identité, même `registrationId`) retrouve sa
 * propre place au lieu d'en consommer une nouvelle à chaque reconnexion.
 */
import { E2EE_MAX_ACTIVE_DEVICES, LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import { retireDevicesAfterSessionEnd, sweepDevicesOfEndedSessions } from '../device-retirement';
import { createE2EEDirectory } from '../E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../E2EEEnvelopeRelay';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeVerifier } from './fake-signatures';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const CONVERSATION = 'f6'.repeat(12);
const MESSAGE = '0a'.repeat(12);
const NOW = new Date('2026-10-24T12:00:00Z');
const sessionIdOf = (index: number): string => index.toString(16).padStart(24, 'e');

const openSession = (store: FakeE2EEStore, id: string) =>
  store.collections.UserSession.insert({ id, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) });

const closeSession = (store: FakeE2EEStore, id: string) =>
  Object.assign(store.collections.UserSession.rows.find((row) => row.id === id)!, { isValid: false, invalidatedAt: NOW });

const directoryOn = (store: FakeE2EEStore) => createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => NOW });

const enrollmentOf = (keys: ReturnType<typeof fakeDeviceKeys>, userId: string) => ({
  binding: keys.binding(userId, NOW.getTime()),
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios' as const,
  oneTimePreKeys: keys.oneTimePreKeys,
  kyberPreKeys: keys.kyberPreKeys,
});

/**
 * Le prisma vu par un retrait qui a LU les appareils, puis a perdu la main :
 * pendant ce temps, `meanwhile` s'exécute sur le vrai magasin.
 */
function pausedAfterFirstDeviceRead(store: FakeE2EEStore, meanwhile: () => Promise<unknown>) {
  let paused = false;
  const findMany = async (args: unknown) => {
    const rows = await store.prisma.e2EEDevice.findMany(args as never);
    if (!paused) {
      paused = true;
      await meanwhile();
    }
    return rows;
  };
  return { ...store.prisma, e2EEDevice: { ...store.prisma.e2EEDevice, findMany } };
}

const stateOf = (store: FakeE2EEStore, userId: string) => ({
  active: store.collections.E2EEDevice.rows
    .filter((row) => row.userId === userId && row.retiredAt === null)
    .map((row) => `${row.deviceId}:${row.registrationId}`),
  preKeys: store.collections.E2EEOneTimePreKey.rows.filter((row) => row.userId === userId).length,
});

async function slotOneRetakenWhileRetiring(retire: (prisma: never) => Promise<unknown>) {
  const store = createFakeE2EEStore();
  openSession(store, sessionIdOf(1));
  openSession(store, sessionIdOf(2));
  const directory = directoryOn(store);
  const old = fakeDeviceKeys({ oneTime: 5, registrationId: 100 });
  await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(1), request: enrollmentOf(old, ALICE) });
  closeSession(store, sessionIdOf(1));
  const fresh = fakeDeviceKeys({ oneTime: 10, registrationId: 200 });

  await retire(
    pausedAfterFirstDeviceRead(store, () =>
      directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(2), request: enrollmentOf(fresh, ALICE) }),
    ) as never,
  );

  return stateOf(store, ALICE);
}

describe("un retrait vise l'appareil qu'il a lu, jamais la place reprise entre-temps (#12592)", () => {
  it("le balayage qui a lu la place 1 avant sa reprise laisse le nouvel occupant actif, pré-clés comprises", async () => {
    const state = await slotOneRetakenWhileRetiring((prisma) => sweepDevicesOfEndedSessions(prisma, { now: NOW }));

    expect(state).toEqual({ active: ['1:200'], preKeys: 10 });
  });

  it("la déconnexion de l'ancienne session, lue avant la reprise, ne retire pas le nouvel occupant", async () => {
    const state = await slotOneRetakenWhileRetiring((prisma) =>
      retireDevicesAfterSessionEnd(prisma, { sessionId: sessionIdOf(1) }, (error) => {
        throw error;
      }),
    );

    expect(state).toEqual({ active: ['1:200'], preKeys: 10 });
  });

  it("le retrait d'un compte entier, lu avant la reprise, ne retire pas le nouvel occupant", async () => {
    const state = await slotOneRetakenWhileRetiring((prisma) =>
      retireDevicesAfterSessionEnd(prisma, { userId: ALICE }, (error) => {
        throw error;
      }),
    );

    expect(state).toEqual({ active: ['1:200'], preKeys: 10 });
  });
});

describe("une enveloppe appartient à la génération qu'elle visait (#12592)", () => {
  async function envelopeForOldOccupantPersistedAfterRetake() {
    const store = createFakeE2EEStore();
    [1, 2, 3].forEach((index) => openSession(store, sessionIdOf(index)));
    store.collections.Participant.insert({ conversationId: CONVERSATION, userId: ALICE });
    store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
    const directory = directoryOn(store);
    const relay = createE2EEEnvelopeRelay({ prisma: store.prisma as never, now: () => NOW });
    await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(1), request: enrollmentOf(fakeDeviceKeys(), ALICE) });
    const oldBob = fakeDeviceKeys({ registrationId: 100 });
    await directory.enrollDevice({ userId: BOB, sessionId: sessionIdOf(2), request: enrollmentOf(oldBob, BOB) });

    const admitted = await relay.admit({
      conversationId: CONVERSATION,
      senderUserId: ALICE,
      relay: {
        protocol: LIBSIGNAL_PROTOCOL,
        senderDeviceId: 1,
        sessionId: sessionIdOf(1),
        unapprovedOwnDevices: [],
        envelopes: [{ userId: BOB, deviceId: 1, registrationId: 100, type: 3, body: 'Y2lwaGVy' }],
      },
    });
    closeSession(store, sessionIdOf(2));
    await directory.enrollDevice({ userId: BOB, sessionId: sessionIdOf(3), request: enrollmentOf(fakeDeviceKeys({ registrationId: 200 }), BOB) });
    const deliveries = await relay.persist({ messageId: MESSAGE, conversationId: CONVERSATION, admitted });
    return { store, relay, deliveries };
  }

  it("le nouvel occupant de la place ne reçoit pas l'enveloppe chiffrée pour l'ancien", async () => {
    const { relay } = await envelopeForOldOccupantPersistedAfterRetake();

    await expect(relay.listFor({ userId: BOB, sessionId: sessionIdOf(3) })).resolves.toEqual([]);
  });

  it("l'enveloppe servie dit à quelle registrationId elle est destinée, pour que l'appareil écarte celle d'un autre", async () => {
    const { deliveries, store } = await envelopeForOldOccupantPersistedAfterRetake();

    expect(deliveries.map((delivery) => delivery.envelope.recipientRegistrationId)).toEqual([100]);
    expect(store.collections.MessageEnvelope.rows.map((row) => row.recipientRegistrationId)).toEqual([100]);
  });

  it("le nouvel occupant ne peut pas accuser réception de l'enveloppe d'un autre", async () => {
    const { relay, deliveries } = await envelopeForOldOccupantPersistedAfterRetake();

    await expect(relay.ack({ userId: BOB, sessionId: sessionIdOf(3), ids: deliveries.map((delivery) => delivery.envelope.id) })).resolves.toBe(0);
  });
});

describe('une installation qui revient retrouve sa place (#12593)', () => {
  it(`${E2EE_MAX_ACTIVE_DEVICES + 1} cycles connexion → enrôlement → déconnexion ne font jamais refuser l'enrôlement`, async () => {
    const store = createFakeE2EEStore();
    const directory = directoryOn(store);
    const keys = fakeDeviceKeys({ oneTime: 3, registrationId: 4242 });
    const deviceIds: number[] = [];
    for (let cycle = 1; cycle <= E2EE_MAX_ACTIVE_DEVICES + 1; cycle += 1) {
      const sessionId = sessionIdOf(cycle);
      openSession(store, sessionId);
      const { deviceId } = await directory.enrollDevice({ userId: ALICE, sessionId, request: enrollmentOf(keys, ALICE) });
      deviceIds.push(deviceId);
      closeSession(store, sessionId);
      await retireDevicesAfterSessionEnd(store.prisma as never, { sessionId }, (error) => {
        throw error;
      });
    }

    expect(new Set(deviceIds)).toEqual(new Set([1]));
    expect(store.collections.E2EEDevice.rows).toHaveLength(1);
  });

  it("l'installation revenue est de nouveau active, liée à sa nouvelle session, avec ses pré-clés republiées", async () => {
    const store = createFakeE2EEStore();
    [1, 2].forEach((index) => openSession(store, sessionIdOf(index)));
    const directory = directoryOn(store);
    const keys = fakeDeviceKeys({ oneTime: 4, registrationId: 4242 });
    await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(1), request: enrollmentOf(keys, ALICE) });
    closeSession(store, sessionIdOf(1));
    await retireDevicesAfterSessionEnd(store.prisma as never, { sessionId: sessionIdOf(1) }, (error) => {
      throw error;
    });

    const back = await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(2), request: enrollmentOf(keys, ALICE) });

    expect(back).toEqual({ deviceId: 1, created: false });
    expect(store.collections.E2EEDevice.rows[0]).toMatchObject({ retiredAt: null, sessionId: sessionIdOf(2), registrationId: 4242 });
    expect(stateOf(store, ALICE)).toEqual({ active: ['1:4242'], preKeys: 4 });
  });

  it("une AUTRE identité sous la même registrationId ne reprend pas la place retirée", async () => {
    const store = createFakeE2EEStore();
    [1, 2].forEach((index) => openSession(store, sessionIdOf(index)));
    const directory = directoryOn(store);
    await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(1), request: enrollmentOf(fakeDeviceKeys({ registrationId: 4242 }), ALICE) });
    closeSession(store, sessionIdOf(1));
    await retireDevicesAfterSessionEnd(store.prisma as never, { sessionId: sessionIdOf(1) }, (error) => {
      throw error;
    });

    const other = await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(2), request: enrollmentOf(fakeDeviceKeys({ registrationId: 4242 }), ALICE) });

    expect(other).toEqual({ deviceId: 2, created: true });
  });

  it("la borne ne compte que les appareils ACTIFS : des places retirées sous la même registrationId ne la font pas tomber", async () => {
    const store = createFakeE2EEStore();
    const directory = directoryOn(store);
    for (let index = 1; index <= E2EE_MAX_ACTIVE_DEVICES; index += 1) {
      openSession(store, sessionIdOf(index));
      await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(index), request: enrollmentOf(fakeDeviceKeys({ registrationId: 4242 }), ALICE) });
      closeSession(store, sessionIdOf(index));
      await retireDevicesAfterSessionEnd(store.prisma as never, { sessionId: sessionIdOf(index) }, (error) => {
        throw error;
      });
    }
    openSession(store, sessionIdOf(99));

    const enrolled = await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(99), request: enrollmentOf(fakeDeviceKeys({ registrationId: 4242 }), ALICE) });

    expect(enrolled.created).toBe(true);
    expect(stateOf(store, ALICE).active).toHaveLength(1);
  });
});

describe("un appareil retiré par le propriétaire du compte ne revient pas (revue de sécurité, #12546)", () => {
  async function revokedByOwner() {
    const store = createFakeE2EEStore();
    [1, 2, 3].forEach((index) => openSession(store, sessionIdOf(index)));
    const directory = directoryOn(store);
    const keys = fakeDeviceKeys({ oneTime: 3, registrationId: 4242 });
    const { deviceId } = await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(1), request: enrollmentOf(keys, ALICE) });
    await directory.retireDevice({ userId: ALICE, deviceId });
    return { store, directory, keys };
  }

  it("refuse le réenrôlement de l'identité révoquée, même sur une session neuve avec une preuve fraîche", async () => {
    const { store, directory, keys } = await revokedByOwner();

    await expect(directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(2), request: enrollmentOf(keys, ALICE) }))
      .rejects.toMatchObject({ code: 'E2EE_IDENTITY_REVOKED', status: 409 });
    expect(stateOf(store, ALICE).active).toEqual([]);
  });

  it("la révocation survit à la reprise de la place par une autre installation", async () => {
    const { directory, keys } = await revokedByOwner();
    await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(2), request: enrollmentOf(fakeDeviceKeys({ registrationId: 77 }), ALICE) });

    await expect(directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(3), request: enrollmentOf(keys, ALICE) }))
      .rejects.toMatchObject({ code: 'E2EE_IDENTITY_REVOKED' });
  });

  it("une nouvelle identité sur le même appareil s'enrôle normalement", async () => {
    const { directory } = await revokedByOwner();

    await expect(directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(2), request: enrollmentOf(fakeDeviceKeys({ registrationId: 4242 }), ALICE) }))
      .resolves.toMatchObject({ created: true });
  });

  it("la purge du compte efface aussi ses identités révoquées", async () => {
    const { store } = await revokedByOwner();
    const { eraseE2EEDataOfUser } = await import('../device-retirement');

    await eraseE2EEDataOfUser(store.prisma as never, ALICE);

    expect(store.collections.E2EERevokedIdentity.rows).toHaveLength(0);
  });
});
