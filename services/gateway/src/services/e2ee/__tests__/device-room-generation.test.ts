/**
 * LA ROOM SOCKET D'UN APPAREIL EST CELLE DE SA GÉNÉRATION (#12592, #12560).
 *
 * Une place `(userId, deviceId)` se reprend par une autre installation. Une
 * room nommée par la seule place laissait la socket de l'ancien occupant — un
 * appareil retiré par le propriétaire, dont la session vit encore — recevoir
 * les enveloppes du nouveau : chiffrées pour une autre identité, mais avec
 * l'expéditeur, la conversation, l'heure et la taille de chaque message.
 */
import { LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import { joinE2EEDeviceRoom } from '../device-room';
import { createE2EEDirectory } from '../E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../E2EEEnvelopeRelay';
import { deliverEnvelopes, setE2EEEnvelopeIOProvider } from '../envelope-delivery';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeVerifier } from './fake-signatures';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const CONVERSATION = 'f6'.repeat(12);
const MESSAGE = '0a'.repeat(12);
const NOW = new Date('2026-10-24T12:00:00Z');
const sessionIdOf = (index: number): string => index.toString(16).padStart(24, 'e');

type FakeSocket = { readonly data: { sessionId: string }; readonly received: string[]; join(room: string): void };

function fakeServer() {
  const rooms = new Map<string, Set<FakeSocket>>();
  const membersOf = (room: string): Set<FakeSocket> => rooms.get(room) ?? rooms.set(room, new Set()).get(room)!;
  const io = {
    to: (room: string) => ({ emit: (_event: string, envelope: { id: string }) => membersOf(room).forEach((socket) => socket.received.push(envelope.id)) }),
    in: (room: string) => ({
      fetchSockets: async () => [...membersOf(room)],
      socketsLeave: (left: string | string[]) => {
        const members = [...membersOf(room)];
        [left].flat().forEach((name) => members.forEach((socket) => membersOf(name).delete(socket)));
      },
    }),
  };
  const socket = (sessionId: string): FakeSocket => {
    const created: FakeSocket = { data: { sessionId }, received: [], join: (room) => { membersOf(room).add(created); } };
    return created;
  };
  const roomsOf = (target: FakeSocket): string[] => [...rooms.entries()].filter(([, members]) => members.has(target)).map(([name]) => name);
  return { io, socket, roomsOf };
}

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

const openSession = (store: FakeE2EEStore, id: string) =>
  store.collections.UserSession.insert({ id, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) });

async function aliceRevokedThenSlotRetaken() {
  const store = createFakeE2EEStore();
  const server = fakeServer();
  setE2EEEnvelopeIOProvider(() => server.io as never);
  [1, 2, 3].forEach((index) => openSession(store, sessionIdOf(index)));
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: ALICE });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
  const directory = createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => NOW });
  const relay = createE2EEEnvelopeRelay({ prisma: store.prisma as never, now: () => NOW });

  const revoked = await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(1), request: enrollmentOf(fakeDeviceKeys({ registrationId: 100 }), ALICE) });
  const oldSocket = server.socket(sessionIdOf(1));
  await joinE2EEDeviceRoom(oldSocket, store.prisma as never, { userId: ALICE, sessionId: sessionIdOf(1) });
  await directory.retireDevice({ userId: ALICE, deviceId: revoked.deviceId });

  const retaken = await directory.enrollDevice({ userId: ALICE, sessionId: sessionIdOf(2), request: enrollmentOf(fakeDeviceKeys({ registrationId: 200 }), ALICE) });
  const newSocket = server.socket(sessionIdOf(2));
  await joinE2EEDeviceRoom(newSocket, store.prisma as never, { userId: ALICE, sessionId: sessionIdOf(2) });
  await directory.enrollDevice({ userId: BOB, sessionId: sessionIdOf(3), request: enrollmentOf(fakeDeviceKeys({ registrationId: 300 }), BOB) });

  return { server, relay, oldSocket, newSocket, revoked, retaken };
}

describe("la room socket d'un appareil est celle de sa génération (#12592)", () => {
  afterEach(() => setE2EEEnvelopeIOProvider(() => null));

  it("la socket de l'appareil retiré ne reçoit aucune enveloppe de l'installation qui a repris sa place", async () => {
    const { relay, oldSocket, newSocket, revoked, retaken } = await aliceRevokedThenSlotRetaken();
    expect(retaken.deviceId).toBe(revoked.deviceId);

    const admitted = await relay.admit({
      conversationId: CONVERSATION,
      senderUserId: BOB,
      relay: {
        protocol: LIBSIGNAL_PROTOCOL,
        senderDeviceId: 1,
        sessionId: sessionIdOf(3),
        unapprovedOwnDevices: [],
        envelopes: [{ userId: ALICE, deviceId: retaken.deviceId, registrationId: 200, type: 3, body: 'Y2lwaGVy' }],
      },
    });
    deliverEnvelopes(await relay.persist({ messageId: MESSAGE, conversationId: CONVERSATION, admitted }));

    expect(newSocket.received).toHaveLength(1);
    expect(oldSocket.received).toEqual([]);
  });

  it("le retrait fait sortir la socket de l'appareil de sa room", async () => {
    const { server, oldSocket } = await aliceRevokedThenSlotRetaken();

    expect(server.roomsOf(oldSocket)).toEqual([]);
  });

  it("la room nomme la génération : la place ET la registrationId", async () => {
    const { server, newSocket, retaken } = await aliceRevokedThenSlotRetaken();

    expect(server.roomsOf(newSocket)).toEqual([`device:${ALICE}:${retaken.deviceId}:200`]);
  });
});
