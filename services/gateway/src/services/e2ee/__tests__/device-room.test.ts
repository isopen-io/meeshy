import { joinE2EEDeviceRoom, joinSessionSocketsToDeviceRoom } from '../device-room';
import { createFakeE2EEStore } from './fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const SESSION = 'c3'.repeat(12);

const fakeSocket = (sessionId?: string) => {
  const rooms: string[] = [];
  return { rooms, data: { sessionId }, join: async (room: string) => { rooms.push(room); } };
};

describe("la room socket d'un appareil E2EE (#3706)", () => {
  it("fait entrer la socket dans la room de l'appareil lié à SA session", async () => {
    const store = createFakeE2EEStore();
    store.collections.E2EEDevice.insert({ userId: ALICE, deviceId: 3, registrationId: 41, sessionId: SESSION });
    const socket = fakeSocket(SESSION);

    await expect(joinE2EEDeviceRoom(socket, store.prisma as never, { userId: ALICE, sessionId: SESSION })).resolves.toBe(3);
    expect(socket.rooms).toEqual([`device:${ALICE}:3:41`]);
  });

  it("n'entre dans aucune room sans appareil actif lié à la session", async () => {
    const store = createFakeE2EEStore();
    store.collections.E2EEDevice.insert({ userId: ALICE, deviceId: 3, sessionId: SESSION, retiredAt: new Date() });
    const socket = fakeSocket(SESSION);

    await expect(joinE2EEDeviceRoom(socket, store.prisma as never, { userId: ALICE, sessionId: SESSION })).resolves.toBeNull();
    await expect(joinE2EEDeviceRoom(socket, store.prisma as never, { userId: ALICE, sessionId: undefined })).resolves.toBeNull();
    expect(socket.rooms).toEqual([]);
  });

  it("à l'enrôlement, fait entrer les seules sockets déjà ouvertes de cette session", async () => {
    const mine = fakeSocket(SESSION);
    const other = fakeSocket('d4'.repeat(12));
    const io = { in: (room: string) => ({ fetchSockets: async () => (room === `user:${ALICE}` ? [mine, other] : []) }) };

    await joinSessionSocketsToDeviceRoom(io, { userId: ALICE, sessionId: SESSION, deviceId: 2, registrationId: 42 });

    expect(mine.rooms).toEqual([`device:${ALICE}:2:42`]);
    expect(other.rooms).toEqual([]);
  });
});
