/**
 * Témoin de ROUTE : `POST /conversations/:id/participants` vers un inconnu.
 * `decideDirectOpening` est le VRAI ; seule la loi d'accès est doublée (inconnu :
 * pas de Connaissance, demande permise).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../services/relations/pairAccess', () => ({
  pairAccessAmong: jest.fn(async (_p: unknown, params: any) =>
    new Map(params.otherIds.map((id: string) => [id, { allowed: params.feature === 'dm.request', effectiveLevel: 'PUBLIC', reason: 'level' }]))),
}));
jest.mock('../../utils/conversation-id-cache', () => ({ resolveConversationId: jest.fn(async () => '507f1f77bcf86cd799439011') }));
jest.mock('../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn() }));
jest.mock('../../socketio/emitConversationMemberCount', () => ({ emitConversationMemberCountEvent: jest.fn() }));
jest.mock('../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() })) },
}));

import Fastify from 'fastify';
import { registerParticipantWriteRoutes } from '../../routes/conversations/participants-writes';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';

function rowsMatching(rows: any[], where: any) {
  return rows.filter((row) => {
    if (where?.id !== undefined && where.id !== row.id) return false;
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (typeof where?.userId === 'string' && where.userId !== row.userId) return false;
    if (where?.userId?.notIn && where.userId.notIn.includes(row.userId)) return false;
    return true;
  });
}

const CAROL = '507f1f77bcf86cd799439044';

async function monter(extra: any[] = []) {
  const rows: any[] = [{ id: 'p-actor', conversationId: CONV_ID, userId: ACTOR, role: 'admin', isActive: true, bannedAt: null, type: 'user', displayName: 'Demo', joinedAt: new Date('2026-01-01') }, ...extra];
  const emits: Array<{ room: string; event: string; payload: unknown }> = [];
  const prisma: any = {
    conversation: {
      findUnique: jest.fn(async () => ({ id: CONV_ID, type: 'group', title: 'Viens voir mes photos', createdAt: new Date('2025-01-01'), isActive: true, closedAt: null })),
      update: jest.fn(async () => undefined),
    },
    participant: {
      findFirst: jest.fn(async (a: any) => rowsMatching(rows, a?.where)[0] ?? null),
      findMany: jest.fn(async (a: any) => rowsMatching(rows, a?.where)),
      count: jest.fn(async () => 0),
      create: jest.fn(async (a: any) => { const row = { isActive: true, bannedAt: null, type: 'user', ...a?.data, id: 'p-bob' }; rows.push(row); return row; }),
      update: jest.fn(async (a: any) => ({ id: a?.where?.id, conversationId: CONV_ID, userId: BOB, ...a?.data })),
    },
    user: {
      findMany: jest.fn(async () => [{ id: BOB, birthDate: new Date('1990-01-01') }]),
      findUnique: jest.fn(async () => ({ createdAt: new Date('2025-01-01') })),
      findFirst: jest.fn(async () => ({ id: BOB, username: 'bob', displayName: 'Bob', firstName: null, lastName: null, avatar: null, systemLanguage: 'fr' })),
    },
    message: { create: jest.fn(async (a: any) => ({ id: 'sys-1', createdAt: new Date(), ...a?.data })) },
  };
  let room = '';
  const io: any = { to: jest.fn((r: string) => { room = r; return io; }), emit: jest.fn((event: string, payload: unknown) => { emits.push({ room, event, payload }); }) };
  const app = Fastify({ logger: false });
  const notificationService = {
    createAddedToConversationNotification: jest.fn(async () => undefined),
    createMemberJoinedNotificationsBatch: jest.fn(async (_recipients: readonly string[], _common: { readonly newMemberUserId: string }) => 0),
  };
  (app as any).prisma = prisma;
  (app as any).notificationService = notificationService;
  (app as any).socketIOHandler = { getManager: () => ({ getIO: () => io, joinUserToConversationRoom: jest.fn(async () => undefined), broadcastMessage: jest.fn(async () => undefined) }) };
  const requiredAuth = async (req: any) => { req.authContext = { type: 'user', userId: ACTOR, isAuthenticated: true, registeredUser: { id: ACTOR, role: 'USER' } }; };
  registerParticipantWriteRoutes(app as any, prisma, requiredAuth);
  await app.ready();
  return { app, prisma, notificationService, emits };
}

describe('contre-audit #14107 — ajout d\'un inconnu dans un groupe (route)', () => {
  it('pose la demande sur la ligne de l\'ajouté', async () => {
    const { app, prisma } = await monter();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
    await app.close();
    expect(res.statusCode).toBe(200);
    const data = prisma.participant.create.mock.calls[0][0].data;
    expect({ at: data.messageRequestAt instanceof Date, risk: data.messageRequestRisk }).toEqual({ at: true, risk: 20 });
  });

  it('n\'annonce pas l\'ajout à la personne en demande (pas de « X vous a ajouté à <titre> »)', async () => {
    const { app, notificationService } = await monter();
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
    await app.close();
    expect(notificationService.createAddedToConversationNotification).not.toHaveBeenCalled();
  });

  it('la réponse et les événements socket ne portent ni la date ni le score de la demande', async () => {
    const { app, emits } = await monter();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
    await app.close();
    const wire = JSON.stringify({ body: res.json(), emits });
    expect(wire).not.toContain('messageRequest');
  });

  it('annonce toujours l\'arrivée aux membres déjà présents : seule la personne en demande n\'est pas prévenue (audit 3, F-b)', async () => {
    const { app, notificationService } = await monter([{ id: 'p-carol', conversationId: CONV_ID, userId: CAROL, role: 'member', isActive: true, bannedAt: null, type: 'user' }]);
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
    await app.close();
    expect(notificationService.createMemberJoinedNotificationsBatch).toHaveBeenCalledWith([CAROL], expect.objectContaining({ newMemberUserId: BOB }));
    expect(notificationService.createAddedToConversationNotification).not.toHaveBeenCalled();
  });

  it('un retour (rejoin) garde la demande que l\'ajout vient de poser : l\'état de retour ne l\'écrase pas (audit 3, M-b)', async () => {
    const { app, prisma } = await monter([{ id: 'p-bob-old', conversationId: CONV_ID, userId: BOB, role: 'member', isActive: false, bannedAt: null, type: 'user', joinedAt: new Date('2026-01-01') }]);
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
    await app.close();
    expect(res.statusCode).toBe(200);
    const data = prisma.participant.update.mock.calls[0][0].data;
    expect({ active: data.isActive, at: data.messageRequestAt instanceof Date, from: data.messageRequestFromId }).toEqual({ active: true, at: true, from: ACTOR });
  });
});
