/**
 * `GET /conversations/:id` sert `viewerWriteRestriction` (#9927) : un mineur
 * déclaré ouvre Meeshy Global en lecture seule (`'minor-global'`), tout autre
 * lecteur ou toute autre conversation reçoit `null`. La valeur passe la
 * sérialisation de la route (déclarée dans `conversationSchema`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439aaa';

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: async () => CONV_ID,
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: async () => true,
  resolveCallerParticipant: async () => ({ id: 'p-1', role: 'member' }),
}));

jest.mock('../../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCount() { return Promise.resolve(0); }
  },
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => ({ id: USER_ID, role: 'USER' }),
  presenceFor: () => ({ showOnline: false, showLastSeenTimestamp: false }),
}));

import { registerConversationDetailRoute } from '../../../../routes/conversations/core-detail';

const row = (type: string) => ({
  id: CONV_ID,
  identifier: type === 'global' ? 'meeshy' : 'mee_demo',
  type,
  title: 'Le salon',
  isActive: true,
  createdAt: new Date('2026-07-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  participants: [],
  _count: { participants: 3 },
});

async function buildApp(params: { readonly type: string; readonly birthDate: Date | null; readonly anonymous?: boolean }) {
  const prisma = {
    conversation: { findFirst: jest.fn(async () => row(params.type)) },
    participant: { findFirst: jest.fn(async () => null) },
    user: { findUnique: jest.fn(async () => ({ birthDate: params.birthDate })) },
  };
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('notificationService', { markConversationNotificationsAsRead: async () => undefined } as never);
  app.decorate('presenceChecker', undefined as never);
  const optionalAuth = async (req: { authContext?: unknown }) => {
    req.authContext = params.anonymous
      ? { isAuthenticated: true, isAnonymous: true, type: 'anonymous', userId: 'anon-1', participantId: 'p-anon' }
      : { isAuthenticated: true, isAnonymous: false, type: 'user', userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  registerConversationDetailRoute(app, prisma as never, optionalAuth);
  await app.ready();
  return { app, prisma };
}

const TEEN = new Date('2010-02-01T00:00:00.000Z');

describe('GET /conversations/:id — viewerWriteRestriction (#9927)', () => {
  it('mineur déclaré dans Global : minor-global', async () => {
    const { app } = await buildApp({ type: 'global', birthDate: TEEN });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewerWriteRestriction).toBe('minor-global');
    await app.close();
  });

  it('âge inconnu dans Global : null', async () => {
    const { app } = await buildApp({ type: 'global', birthDate: null });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
    expect(res.json().data.viewerWriteRestriction).toBeNull();
    await app.close();
  });

  it('mineur dans un groupe : null, et sa date de naissance n’est pas lue', async () => {
    const { app, prisma } = await buildApp({ type: 'group', birthDate: TEEN });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
    expect(res.json().data.viewerWriteRestriction).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('un invité anonyme dans Global : null, aucune lecture de compte', async () => {
    const { app, prisma } = await buildApp({ type: 'global', birthDate: TEEN, anonymous: true });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
    expect(res.json().data.viewerWriteRestriction).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('`?fields=id` ne la calcule pas', async () => {
    const { app, prisma } = await buildApp({ type: 'global', birthDate: TEEN });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id` });
    expect(res.json().data.viewerWriteRestriction).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await app.close();
  });
});
