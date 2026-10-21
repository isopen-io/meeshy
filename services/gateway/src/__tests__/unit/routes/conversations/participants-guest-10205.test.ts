/**
 * #10205 — un INVITÉ (session de lien, sans compte Meeshy) ne lit ni la liste
 * des membres de sa conversation, ni la fiche d'un autre participant : 403
 * `ACCOUNT_REQUIRED`, lisible, AVANT toute lecture de la base. Sa propre fiche
 * lui reste ouverte. Un compte n'est pas concerné par ce refus.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
    resolveForTargets: async () => new Map(),
  }),
}));

import { registerParticipantReadRoutes } from '../../../../routes/conversations/participants-reads';

const CONV_ID = '507f1f77bcf86cd799439033';
const GUEST_ID = '507f1f77bcf86cd799439044';
const OTHER_ID = '507f1f77bcf86cd799439055';

const GUEST = { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: GUEST_ID, participantId: GUEST_ID };

const prismaQuiNeDoitPasServir = () => ({
  conversation: { findFirst: jest.fn(async () => ({ id: CONV_ID, type: 'group' })) },
  participant: {
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  },
});

const monter = async (prisma: unknown, authContext: Record<string, unknown>): Promise<FastifyInstance> => {
  const app = Fastify();
  const optionalAuth = async (request: any) => {
    request.authContext = authContext;
  };
  registerParticipantReadRoutes(app, prisma as never, optionalAuth);
  await app.ready();
  return app;
};

const lire = async (url: string) => {
  const prisma = prismaQuiNeDoitPasServir();
  const app = await monter(prisma, GUEST);
  const res = await app.inject({ method: 'GET', url });
  await app.close();
  return { res, prisma };
};

describe('#10205 — les membres et leurs fiches restent fermés à un invité', () => {
  it('GET /conversations/:id/participants répond 403 ACCOUNT_REQUIRED sans lire un membre', async () => {
    const { res, prisma } = await lire(`/conversations/${CONV_ID}/participants`);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'ACCOUNT_REQUIRED' });
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('GET /conversations/:id/participants/:participantId/profile d’un AUTRE répond 403 ACCOUNT_REQUIRED', async () => {
    const { res } = await lire(`/conversations/${CONV_ID}/participants/${OTHER_ID}/profile`);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'ACCOUNT_REQUIRED' });
  });

  it('sa propre fiche n’est pas refusée pour ce motif', async () => {
    const { res } = await lire(`/conversations/${CONV_ID}/participants/${GUEST_ID}/profile`);

    expect(res.json().code).not.toBe('ACCOUNT_REQUIRED');
  });
});
