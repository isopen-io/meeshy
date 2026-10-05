/**
 * Le classement des PERSONNES se replie par compte AVANT d'être borné, et
 * nomme ses invités (audit de contrat du 2026-10-04).
 *
 * 1. `message.groupBy` est keyé par PARTICIPANT (un par conversation). Borné
 *    à `limit` AVANT le repli par compte, il laissait hors du calcul les
 *    participations d'un membre classées au-delà de la borne : un membre actif
 *    dans trente conversations était sous-compté, parfois absent.
 * 2. Un invité (Participant sans `userId`) sortait « Unknown » : il est servi
 *    `guest: true` avec le nom que porte sa participation.
 * 3. `conversations_joined` groupait par `userId`, invités compris : leur
 *    groupe `userId: null` sortait comme une ligne sans personne.
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../validation/helpers', () => ({
  validateQuery: () => async () => {},
  validateBody: () => async () => {},
  validateParams: () => async () => {},
}));

import { systemRankingsRoutes } from '../../../../routes/admin/system-rankings';

type AnyRecord = Record<string, unknown>;
const mockPrisma = {
  message: { groupBy: jest.fn<(a: AnyRecord) => Promise<unknown>>(), findMany: jest.fn(async () => []) },
  reaction: { groupBy: jest.fn<(a: AnyRecord) => Promise<unknown>>() },
  participant: { groupBy: jest.fn<(a: AnyRecord) => Promise<unknown>>(), findMany: jest.fn<(a: AnyRecord) => Promise<unknown>>() },
  user: { findMany: jest.fn<(a: AnyRecord) => Promise<unknown>>() },
  conversation: { findMany: jest.fn(async () => []) },
};

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma as never);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: 'admin', role: 'ADMIN', username: 'admin' } };
  });
  app.register(systemRankingsRoutes);
  return app;
}

const inject = (app: FastifyInstance, criterion: string, limit = '1') =>
  app.inject({ method: 'GET', url: `/ranking?entityType=users&criterion=${criterion}&limit=${limit}` });

// Alice : trois participations de 10 ; Bob : une de 25. Borné à 1 avant le
// repli, Bob gagnait (25 contre 10) ; replié d'abord, Alice gagne (30).
const GROUPES = [
  { senderId: 'pB', participantId: 'pB', _count: { id: 25 } },
  { senderId: 'pA1', participantId: 'pA1', _count: { id: 10 } },
  { senderId: 'pA2', participantId: 'pA2', _count: { id: 10 } },
  { senderId: 'pA3', participantId: 'pA3', _count: { id: 10 } },
  { senderId: 'pG', participantId: 'pG', _count: { id: 4 } },
];
const PARTICIPANTS = [
  { id: 'pB', userId: 'uB', displayName: 'Bob' },
  { id: 'pA1', userId: 'uA', displayName: 'Alice' },
  { id: 'pA2', userId: 'uA', displayName: 'Alice' },
  { id: 'pA3', userId: 'uA', displayName: 'Alice' },
  { id: 'pG', userId: null, displayName: 'Invité du lien' },
];

beforeEach(() => {
  jest.clearAllMocks();
  // Le double honore `take` : c'est lui qui portait le défaut.
  const groupBy = async (args: AnyRecord) => (typeof args.take === 'number' ? GROUPES.slice(0, args.take) : GROUPES);
  mockPrisma.message.groupBy.mockImplementation(groupBy);
  mockPrisma.reaction.groupBy.mockImplementation(groupBy);
  mockPrisma.participant.findMany.mockImplementation(async (args: AnyRecord) => {
    const ids = ((args.where as AnyRecord).id as { in: string[] }).in;
    return PARTICIPANTS.filter((p) => ids.includes(p.id));
  });
  mockPrisma.user.findMany.mockImplementation(async (args: AnyRecord) => {
    const ids = ((args.where as AnyRecord).id as { in: string[] }).in;
    return [
      { id: 'uA', username: 'alice', displayName: 'Alice', avatar: null, lastActiveAt: null },
      { id: 'uB', username: 'bob', displayName: 'Bob', avatar: null, lastActiveAt: null },
    ].filter((u) => ids.includes(u.id));
  });
});

describe('classement des personnes — le repli précède la borne', () => {
  it.each(['messages_sent', 'reactions_given'])('%s : le membre aux participations multiples est compté en entier', async (criterion) => {
    const app = buildApp();
    const res = await inject(app, criterion, '1');
    expect(res.statusCode).toBe(200);
    const rankings = res.json().data.rankings as AnyRecord[];
    expect(rankings).toHaveLength(1);
    expect(rankings[0]).toMatchObject({ id: 'uA', username: 'alice', count: 30 });
    await app.close();
  });

  it('un invité est servi guest: true avec le nom de sa participation', async () => {
    const app = buildApp();
    const res = await inject(app, 'messages_sent', '10');
    const invite = (res.json().data.rankings as AnyRecord[]).find((r) => r.id === 'pG');
    expect(invite).toMatchObject({ guest: true, displayName: 'Invité du lien', count: 4 });
    const membre = (res.json().data.rankings as AnyRecord[]).find((r) => r.id === 'uA');
    expect(membre?.guest).toBe(false);
    await app.close();
  });

  it('conversations_joined écarte le groupe sans compte côté serveur', async () => {
    mockPrisma.participant.groupBy.mockResolvedValue([
      { userId: 'uA', _count: { id: 3 } },
    ]);
    const app = buildApp();
    const res = await inject(app, 'conversations_joined', '10');
    expect(res.statusCode).toBe(200);
    const args = mockPrisma.participant.groupBy.mock.calls[0][0] as { where: AnyRecord };
    expect(args.where.userId).toEqual({ not: null });
    await app.close();
  });
});
