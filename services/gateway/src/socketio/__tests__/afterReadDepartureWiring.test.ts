/**
 * #18556 — le regard d'un lecteur est publié aux autres nœuds par une room, et
 * un départ ne se déclare que si elle est vide dans toute la grappe.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  afterReadViewRoom,
  isAfterReadViewedAnywhere,
  markAfterReadViewing,
  type AfterReadViewIO,
} from '../afterReadDepartureWiring';

const READER = { conversationId: '507f1f77bcf86cd799439011', participantId: 'p-1', readerKey: 'u-1' };
const ROOM = 'after-read-view:507f1f77bcf86cd799439011:u-1';

function ioWith(rooms: Record<string, unknown[]> = {}) {
  const socket = { join: jest.fn(), leave: jest.fn() };
  const io: AfterReadViewIO = {
    sockets: { sockets: { get: (socketId: string) => (socketId === 's-1' ? socket : undefined) } },
    in: (room: string) => ({ fetchSockets: async () => rooms[room] ?? [] }),
  };
  return { io, socket };
}

describe('la room du regard (#18556)', () => {
  it('nomme la conversation ET le lecteur : deux lecteurs d’une conversation ne se retiennent pas', () => {
    expect(afterReadViewRoom(READER)).toBe(ROOM);
    expect(afterReadViewRoom({ ...READER, readerKey: 'u-2' })).not.toBe(ROOM);
  });

  it('un regard fait entrer le socket dans la room, sa fin l’en sort', () => {
    const { io, socket } = ioWith();

    markAfterReadViewing(io, 's-1', READER, true, () => undefined);
    markAfterReadViewing(io, 's-1', READER, false, () => undefined);

    expect(socket.join).toHaveBeenCalledWith(ROOM);
    expect(socket.leave).toHaveBeenCalledWith(ROOM);
  });

  it('un socket inconnu de ce nœud est ignoré', () => {
    const { io, socket } = ioWith();

    markAfterReadViewing(io, 's-absent', READER, true, () => undefined);

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('une entrée en room qui rejette est remise au journal, jamais levée', async () => {
    const { io, socket } = ioWith();
    const errors: unknown[] = [];
    socket.join.mockImplementation(() => Promise.reject(new Error('adapter down')));

    markAfterReadViewing(io, 's-1', READER, true, (error) => errors.push(error));
    await new Promise((resolve) => setImmediate(resolve));

    expect(errors).toHaveLength(1);
  });

  it('la conversation est regardée ailleurs dès qu’un socket de la grappe tient la room', async () => {
    expect(await isAfterReadViewedAnywhere(ioWith({ [ROOM]: [{}] }).io, READER)).toBe(true);
    expect(await isAfterReadViewedAnywhere(ioWith().io, READER)).toBe(false);
  });

  it('sans serveur joignable, la question lève : l’appelant ne consomme rien', async () => {
    await expect(isAfterReadViewedAnywhere(null, READER)).rejects.toThrow('unreachable');
  });
});
