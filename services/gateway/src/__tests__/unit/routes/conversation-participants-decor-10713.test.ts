/**
 * #10713 — la liste PAGINÉE des participants (`GET /conversations/:id/participants`,
 * fiche des membres, listes hors fil) sert le contour équipé de chacun, comme la
 * liste et la fiche de conversation : `profileDecor.avatarRing`, additif, jamais
 * la colonne brute. Témoin par la route et le vrai contrat de fil.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const PEER_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439aaa';

jest.mock('../../../routes/conversations/utils/conversation-read-gate', () => ({
  ouvrirConversationLisible: async () => CONV_ID,
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { registerParticipantReadRoutes } from '../../../routes/conversations/participants-reads';

const row = (id: string, userId: string | null, equippedAvatarRing: string | null) => ({
  id,
  conversationId: CONV_ID,
  userId,
  type: userId === null ? 'anonymous' : 'user',
  displayName: id,
  avatar: null,
  role: 'member',
  language: 'fr',
  permissions: null,
  isActive: true,
  isOnline: false,
  lastActiveAt: null,
  joinedAt: new Date('2026-10-01T10:00:00Z'),
  user: userId === null ? null : { id: userId, username: id, firstName: null, lastName: null, displayName: id, avatar: null, role: 'USER', isOnline: false, lastActiveAt: null, systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, isActive: true, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), deactivatedAt: null, equippedAvatarRing },
});

function makePrisma() {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'p-me', role: 'admin', userId: USER_ID }),
      findMany: jest.fn<any>().mockResolvedValue([row('p-me', USER_ID, null), row('p-peer', PEER_ID, 'contours-essentiels/perle'), row('p-guest', null, null)]),
      count: jest.fn<any>().mockResolvedValue(3),
    },
  } as any;
}

async function served(): Promise<{ participants: Record<string, unknown>[]; prisma: any }> {
  const prisma = makePrisma();
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const optionalAuth = async (req: any) => {
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  registerParticipantReadRoutes(app, prisma, optionalAuth);
  await app.ready();
  const response = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/participants` });
  await app.close();
  expect(response.statusCode).toBe(200);
  return { participants: response.json().data, prisma };
}

describe('#10713 — GET /conversations/:id/participants sert le contour de chacun', () => {
  it('sert le contour équipé du participant, résolu au registre', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === 'p-peer')?.profileDecor).toEqual({
      avatarRing: { pack: 'contours-essentiels', item: 'perle', origin: 'builtin', contract: null },
    });
  });

  it('sans contour, ou sans compte, aucune clé', async () => {
    const { participants } = await served();
    expect(participants.find((p) => p.id === 'p-me')).not.toHaveProperty('profileDecor');
    expect(participants.find((p) => p.id === 'p-guest')).not.toHaveProperty('profileDecor');
  });

  it('ne sert jamais la colonne brute, et la demande au chargement', async () => {
    const { participants, prisma } = await served();
    expect(JSON.stringify(participants)).not.toContain('equippedAvatarRing');
    expect(JSON.stringify(prisma.participant.findMany.mock.calls[0][0])).toContain('"equippedAvatarRing":true');
  });
});
