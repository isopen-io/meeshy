import { describe, it, expect } from '@jest/globals';
import { resolveCallEndedRooms } from '../callEndedFanout';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const CONV = '64b7f0c2a1b2c3d4e5f60719';

const prisma = (options: { invited?: string[]; callLookupFails?: boolean }) => ({
  participant: { findMany: async () => [{ userId: 'alice' }, { userId: 'bob' }] },
  callSession: {
    findUnique: async () => {
      if (options.callLookupFails) throw new Error('db down');
      return { invitedUserIds: options.invited ?? [] };
    },
  },
});

describe('call:ended fait taire la sonnerie d’une personne invitée (#8433)', () => {
  it('ajoute la room personnelle de chaque invité, sans doublon avec les membres', async () => {
    const rooms = await resolveCallEndedRooms(prisma({ invited: ['dave', 'bob'] }) as never, CALL, CONV);

    expect(rooms).toEqual([`call:${CALL}`, `conversation:${CONV}`, 'user:alice', 'user:bob', 'user:dave']);
  });

  it('une lecture de la session en panne garde l’audience des membres', async () => {
    const rooms = await resolveCallEndedRooms(prisma({ callLookupFails: true }) as never, CALL, CONV);

    expect(rooms).toEqual([`call:${CALL}`, `conversation:${CONV}`, 'user:alice', 'user:bob']);
  });
});
