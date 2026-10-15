/**
 * #10472 — ce que COÛTE une passe de révocation sur un lien qui a beaucoup
 * servi.
 *
 * Depuis c9d3a07bc4, chaque passe évince TOUS les invités inactifs du lien —
 * c'est ce qui rattrape un invité devenu inactif hors de toute écriture de la
 * passe et encore connecté. Mais elle le faisait invité par invité, en série :
 * `endConversationMembership` (une lecture d'appel, un `fetchSockets`) puis un
 * second `fetchSockets` pour la coupure. Un lien public avec 3 000 départs
 * coûtait ~9 000 opérations à chaque fermeture, pour des invités dont l'immense
 * majorité n'a plus ni socket ni appel.
 *
 * Ce que la suite tient : le nombre d'appels au registre de sockets et à la
 * base ne dépend PAS du nombre d'inactifs déconnectés — et l'inactif encore
 * connecté, ou encore dans un appel, est toujours évincé.
 *
 * Fichier séparé : `revokeShareLinkGuests.test.ts` approche du budget de taille
 * des suites (`gateway-test-file-size-budget.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

jest.mock('../emitConversationMemberCount', () => ({
  emitConversationMemberCountEvent: jest.fn(),
}));

import { revokeShareLinkGuests } from '../revokeShareLinkGuests';
import { resetParticipantLookupCache } from '../../utils/participant-lookup-cache';

const LINK_ID = '507f1f77bcf86cd799439099';
const CONV_ID = '507f1f77bcf86cd799439011';
const CONNECTED = 'participant-guest-connected';
const IN_CALL = 'participant-guest-in-call';

type Guest = { id: string; conversationId: string; displayName: string };

const guest = (id: string): Guest => ({ id, conversationId: CONV_ID, displayName: id });

const departedGuests = (count: number): Guest[] => [
  guest(CONNECTED),
  guest(IN_CALL),
  ...Array.from({ length: count }, (_unused, index) => guest(`participant-guest-gone-${index}`)),
];

function makePrisma(inactive: Guest[]) {
  return {
    participant: {
      findMany: jest.fn<any>(async ({ where }: any) => (where?.OR && where.isActive === false ? inactive : [])),
      updateMany: jest.fn<any>(async () => ({ count: 0 })),
    },
    callParticipant: {
      findMany: jest.fn<any>(async ({ where }: any) =>
        (where?.participantId?.in ?? []).includes(IN_CALL) ? [{ participantId: IN_CALL }] : []
      ),
    },
  };
}

function makeIo(order: string[]) {
  const connected = new Set([ROOMS.user(CONNECTED)]);
  const socketOf = (room: string) => ({
    rooms: new Set([room]),
    leave: jest.fn<any>((left: string) => { order.push(`leave:${room}:${left}`); }),
    disconnect: jest.fn<any>(() => { order.push(`disconnect:${room}`); }),
  });
  const fetchSockets = jest.fn<any>();
  const broadcast: any = { emit: jest.fn<any>(), to: jest.fn<any>(() => broadcast) };
  return {
    fetchSockets,
    to: jest.fn<any>(() => broadcast),
    in: jest.fn<any>((rooms: string | string[]) => ({
      fetchSockets: fetchSockets.mockImplementation(async () =>
        [rooms].flat().filter(room => connected.has(room)).map(socketOf)
      ),
    })),
  };
}

function makeManager(order: string[]) {
  return {
    endLiveLocationForDepartedMember: jest.fn<any>(),
    endCallParticipationForDepartedMember: jest.fn<any>(async (conversationId: string, userId: string) => {
      order.push(`end-call:${conversationId}:${userId}`);
    }),
    invalidateParticipantCache: jest.fn<any>(),
  };
}

async function revokeWith(inactiveCount: number) {
  const order: string[] = [];
  const prisma = makePrisma(departedGuests(inactiveCount));
  const io = makeIo(order);
  const manager = makeManager(order);
  await revokeShareLinkGuests({ prisma: prisma as never, io, manager, shareLinkId: LINK_ID });
  return { order, prisma, io, manager };
}

describe('revokeShareLinkGuests — le coût d’une passe ne dépend pas du nombre d’inactifs déconnectés (#10472)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
  });

  it('autant de fetchSockets et de lectures pour 3 000 inactifs déconnectés que pour 10', async () => {
    const few = await revokeWith(10);
    const many = await revokeWith(3000);

    expect(many.io.fetchSockets.mock.calls.length).toBe(few.io.fetchSockets.mock.calls.length);
    expect(many.io.fetchSockets.mock.calls.length).toBeLessThanOrEqual(3);
    expect(many.prisma.participant.findMany.mock.calls.length).toBe(few.prisma.participant.findMany.mock.calls.length);
    expect(many.prisma.callParticipant.findMany.mock.calls.length).toBe(few.prisma.callParticipant.findMany.mock.calls.length);
    expect(many.prisma.callParticipant.findMany.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("l'inactif encore CONNECTÉ est toujours évincé : appel éteint, sorti de la room, déconnecté", async () => {
    const { order } = await revokeWith(3000);

    expect(order).toContain(`end-call:${CONV_ID}:${CONNECTED}`);
    expect(order).toContain(`leave:${ROOMS.user(CONNECTED)}:${ROOMS.conversation(CONV_ID)}`);
    expect(order).toContain(`disconnect:${ROOMS.user(CONNECTED)}`);
  });

  it("l'inactif DÉCONNECTÉ mais encore dans un appel en est sorti", async () => {
    const { order } = await revokeWith(3000);

    expect(order).toContain(`end-call:${CONV_ID}:${IN_CALL}`);
  });

  it("l'inactif sans socket ni appel ne coûte aucun aller-retour : ni sortie d'appel, ni coupure", async () => {
    const { manager, order } = await revokeWith(3000);

    expect(manager.endCallParticipationForDepartedMember).toHaveBeenCalledTimes(2);
    expect(order.filter(step => step.startsWith('disconnect:'))).toEqual([`disconnect:${ROOMS.user(CONNECTED)}`]);
  });

  it('la position vive et les caches de chaque inactif tombent quand même — un état serveur, sans réseau', async () => {
    const { manager } = await revokeWith(5);

    for (const { id } of departedGuests(5)) {
      expect(manager.endLiveLocationForDepartedMember).toHaveBeenCalledWith(CONV_ID, id);
      expect(manager.invalidateParticipantCache).toHaveBeenCalledWith(id, CONV_ID);
    }
  });
});
