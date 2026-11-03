/**
 * #14107 (MSG-02) — `POST /conversations/:id/message-request/accept` : le
 * destinataire accepte une demande ; l'expéditeur passe au moins en
 * Connaissance et `relation:level-raised` part aux deux. Rejouer l'acceptation
 * ne fait rien et répond pareil ; un non-membre ne distingue rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../../../services/participantRights';
import { registerMessageRequestRoutes } from '../../../../routes/conversations/message-request';
import { ADULT_BIRTH, messagingWorld } from '../../../helpers/messaging-circle-world';

const ALICE = '6300000000000000000000a1';
const BOB = '6300000000000000000000a2';
const INTRUS = '6300000000000000000000a3';
const DM = '6300000000000000000000d1';

function monde() {
  return messagingWorld({
    users: [ALICE, BOB, INTRUS].map((id) => ({ id, birthDate: ADULT_BIRTH })),
    conversations: [{ id: DM, type: 'direct' }],
    participants: [
      { id: '6300000000000000000000e1', conversationId: DM, userId: ALICE, role: 'creator', isActive: true, permissions: { ...FOUNDING_MEMBER_PERMISSIONS } },
      { id: '6300000000000000000000e2', conversationId: DM, userId: BOB, role: 'member', isActive: true, messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: 10 },
    ],
  });
}

async function accepter(userId: string, world = monde()) {
  const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }) }) };
  const fastify = Fastify({ logger: false });
  (fastify as unknown as Record<string, unknown>).socketIOHandler = { getManager: () => ({ getIO: () => io }) };
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId }, hasFullAccess: true,
    };
  };
  registerMessageRequestRoutes(fastify, world.prisma as unknown as PrismaClient, auth);
  await fastify.ready();
  const res = await fastify.inject({ method: 'POST', url: `/conversations/${DM}/message-request/accept` });
  await fastify.close();
  return { res, emissions, world };
}

describe('POST /conversations/:id/message-request/accept', () => {
  it('le destinataire accepte : 200, la demande s\'efface, le lien monte et les deux l\'apprennent', async () => {
    const { res, emissions, world } = await accepter(BOB);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ conversationId: DM, accepted: true });
    expect(world.participant.rows.find((p) => p.userId === BOB)?.messageRequestAt).toBeNull();
    expect(emissions.filter((e) => e.event === SERVER_EVENTS.RELATION_LEVEL_RAISED).map((e) => e.room).sort()).toEqual([`user:${ALICE}`, `user:${BOB}`].sort());
  });

  it('rejouer l\'acceptation répond 200 sans rien relever ni annoncer', async () => {
    const world = monde();
    await accepter(BOB, world);
    const { res, emissions } = await accepter(BOB, world);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ conversationId: DM, accepted: false });
    expect(emissions).toHaveLength(0);
  });

  it('l\'expéditeur n\'accepte pas sa propre demande', async () => {
    const { res, world } = await accepter(ALICE);
    expect(res.json().data).toEqual({ conversationId: DM, accepted: false });
    expect(world.participant.rows.find((p) => p.userId === BOB)?.messageRequestAt).toBeInstanceOf(Date);
  });

  it('un non-membre reçoit 404, comme une conversation qui n\'existe pas', async () => {
    const { res } = await accepter(INTRUS);
    expect(res.statusCode).toBe(404);
  });
});
