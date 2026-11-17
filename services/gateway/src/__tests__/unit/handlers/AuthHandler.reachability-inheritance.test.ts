/**
 * #16726 — au départ d'un appareil, l'entrée du compte se RECALCULE sur les
 * sockets qui restent ; elle ne se RECOPIE pas.
 *
 * `handleDisconnection` recopiait l'entrée en ne changeant que `socketId`. Les
 * deux marqueurs de joignabilité (#16687) sont pourtant des faits de SOCKET
 * rangés dans une entrée par COMPTE : le survivant héritait donc de l'état de
 * celui qui part.
 *
 * Le sens destructeur est celui-ci : l'appareil SAIN part, le MALADE reste, et
 * il hérite d'une entrée SANS marqueur. Il est alors absent de la room ET tenu
 * pour joignable — `enqueueForOfflineParticipants` le saute, aucune diffusion
 * ne l'atteint, et rien n'est écrit, donc rien à rejouer à la reconnexion.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { AuthHandler } from '../../../socketio/handlers/AuthHandler';
import { recordSocketReachability } from '../../../socketio/socketReachability';
import type { SocketUser } from '../../../socketio/utils/socket-helpers';

const USER = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const CONV = '507f1f77bcf86cd799439022';

function makeServices() {
  return {
    statusService: { markConnected: jest.fn<any>(), markDisconnected: jest.fn<any>(), updateLastSeen: jest.fn<any>(), noteHeartbeat: jest.fn<any>() },
    maintenanceService: {
      updateUserOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
      updateAnonymousOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    },
    callService: { leaveCall: jest.fn<any>().mockResolvedValue(undefined) },
  };
}

const makePrisma = () => ({
  user: { findUnique: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>().mockResolvedValue(undefined) },
  participant: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  callParticipant: { findMany: jest.fn<any>().mockResolvedValue([]) },
}) as any;

/** Deux appareils du même compte, dont le `nsp` partagé — c'est lui que la recomposition lit. */
function deuxAppareils(malade: 'reste' | 'part') {
  const registry = new Map<string, any>();
  const makeSocket = (id: string) => {
    const socket: any = {
      id, data: {}, emit: jest.fn<any>(), join: jest.fn<any>(), on: jest.fn<any>(), disconnect: jest.fn<any>(),
      handshake: { auth: {}, headers: {} },
      nsp: { sockets: { get: (sid: string) => registry.get(sid) } },
    };
    registry.set(id, socket);
    return socket;
  };
  const sain = makeSocket('sain');
  const souffrant = makeSocket('malade');
  recordSocketReachability(souffrant, { unreachableConversations: new Set([CONV]) });

  const partant = malade === 'part' ? souffrant : sain;
  const restant = malade === 'part' ? sain : souffrant;
  registry.delete(partant.id);

  const entry: SocketUser = { id: USER, socketId: partant.id, isAnonymous: false } as SocketUser;
  const connectedUsers = new Map<string, SocketUser>([[USER, entry]]);
  const socketToUser = new Map([['sain', USER], ['malade', USER]]);
  const userSockets = new Map([[USER, new Set(['sain', 'malade'])]]);
  const handler = new AuthHandler({ prisma: makePrisma(), ...makeServices(), connectedUsers, socketToUser, userSockets } as any);
  return { handler, connectedUsers, partant, restant };
}

describe('#16726 — le survivant n hérite pas de l état de celui qui part', () => {
  it('quand l appareil SAIN part, le malade qui reste REDEVIENT injoignable pour sa conversation', async () => {
    const { handler, connectedUsers, partant } = deuxAppareils('reste');

    await handler.handleDisconnection(partant);

    const entry = connectedUsers.get(USER);
    expect(entry?.socketId).toBe('malade');
    expect(entry?.unreachableConversations?.has(CONV)).toBe(true);
  });

  it('quand l appareil MALADE part, le sain qui reste n hérite d aucun marqueur', async () => {
    const { handler, connectedUsers, partant } = deuxAppareils('part');
    connectedUsers.set(USER, { ...connectedUsers.get(USER)!, unreachableConversations: new Set([CONV]) });

    await handler.handleDisconnection(partant);

    const entry = connectedUsers.get(USER);
    expect(entry?.socketId).toBe('sain');
    expect(entry?.unreachableConversations).toBeUndefined();
  });

  it('un namespace illisible laisse l entrée telle quelle — « je ne sais pas » n efface rien', async () => {
    const { handler, connectedUsers, partant } = deuxAppareils('reste');
    connectedUsers.set(USER, { ...connectedUsers.get(USER)!, allConversationRoomsUnreachable: true });
    partant.nsp = undefined;

    await handler.handleDisconnection(partant);

    expect(connectedUsers.get(USER)?.allConversationRoomsUnreachable).toBe(true);
  });
});
