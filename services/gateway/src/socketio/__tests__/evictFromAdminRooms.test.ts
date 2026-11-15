/**
 * Un administrateur RÉTROGRADÉ sort des rooms d'administration sur-le-champ
 * (#10459 point 1) : un socket ne revérifie son rang qu'à l'abonnement, donc la
 * route qui change le rôle doit elle-même faire quitter `admin:host-metrics` et
 * `admin:agent` à chaque socket du compte.
 */
import { describe, it, expect } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { evictFromAdminRooms, isAdminRank } from '../evictFromAdminRooms';

function makeSocket(left: string[]) {
  return { leave: (room: string) => left.push(room) };
}

function makeIo(sockets: unknown[], rooms: string[] = []) {
  return {
    in: (room: string) => {
      rooms.push(room);
      return { fetchSockets: async () => sockets as never };
    },
  };
}

describe('evictFromAdminRooms', () => {
  it('fait quitter les deux rooms d’administration à chaque socket du compte, lu par sa room user', async () => {
    const left: string[] = [];
    const asked: string[] = [];
    const io = makeIo([makeSocket(left), makeSocket(left)], asked);
    const evicted = await evictFromAdminRooms({ io, userId: 'u1' });
    expect(asked).toEqual([ROOMS.user('u1')]);
    expect(evicted).toBe(2);
    expect(left.sort()).toEqual([ROOMS.adminAgent(), ROOMS.adminAgent(), ROOMS.adminHostMetrics(), ROOMS.adminHostMetrics()].sort());
  });

  it('sans serveur socket, ne fait rien et ne rejette pas', async () => {
    expect(await evictFromAdminRooms({ io: null, userId: 'u1' })).toBe(0);
    expect(await evictFromAdminRooms({ io: undefined, userId: 'u1' })).toBe(0);
  });

  it('un échec de lecture est rapporté, jamais levé', async () => {
    const errors: unknown[] = [];
    const io = { in: () => ({ fetchSockets: async () => { throw new Error('adapter down'); } }) };
    expect(await evictFromAdminRooms({ io, userId: 'u1', onError: (e) => errors.push(e) })).toBe(0);
    expect(errors).toHaveLength(1);
  });
});

describe('isAdminRank', () => {
  it('ne tient que BIGBOSS et ADMIN pour un rang d’administration — les mêmes que requireAdminRank', () => {
    expect(isAdminRank('BIGBOSS')).toBe(true);
    expect(isAdminRank('ADMIN')).toBe(true);
    for (const role of ['MODERATOR', 'AUDIT', 'ANALYST', 'USER', '', null, undefined]) expect(isAdminRank(role)).toBe(false);
  });
});
