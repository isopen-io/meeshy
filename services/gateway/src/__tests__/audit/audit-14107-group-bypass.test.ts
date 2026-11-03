/**
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ADULT_BIRTH, messagingWorld } from '../helpers/messaging-circle-world';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

const MOI = '507f1f77bcf86cd799439101';
const INCONNUE = '507f1f77bcf86cd799439102';
const OLD = new Date('2025-01-01T00:00:00.000Z');

describe('audit #14107 — un « groupe » de deux contourne la boîte de demandes', () => {
  it('un inconnu qui crée un groupe avec la seule destinataire doit passer par la boîte (ou être refusé)', async () => {
    const world = messagingWorld({
      users: [
        { id: MOI, birthDate: ADULT_BIRTH, createdAt: OLD, displayName: 'Moi', username: 'moi' },
        { id: INCONNUE, birthDate: ADULT_BIRTH, createdAt: OLD, displayName: 'A', username: 'a' },
      ],
    });
    const create = jest.fn(async (args: any) => ({ id: '507f1f77bcf86cd7994391aa', identifier: 'x', type: 'group', title: 'g', createdAt: new Date(), participants: [] }));
    const invite = jest.fn(async () => undefined);
    const prisma = { ...world.prisma, conversation: { findFirst: jest.fn(async () => null), create }, notification: { create: jest.fn(async () => ({})) } } as unknown as PrismaClient;
    const fastify = Fastify({ logger: false });
    (fastify as any).decorate('notificationService', { createConversationInviteNotification: invite });
    const auth = async (request: FastifyRequest, _r: FastifyReply) => {
      (request as any).authContext = { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: MOI, registeredUser: { id: MOI }, hasFullAccess: true };
    };
    const { registerCoreRoutes } = await import('../../routes/conversations/core');
    registerCoreRoutes(fastify, prisma, auth, auth);
    await fastify.ready();
    const res = await fastify.inject({ method: 'POST', url: '/conversations', payload: { type: 'group', title: 'Salut', participantIds: [INCONNUE] } });
    await fastify.close();
    const created = (create.mock.calls[0]?.[0] as any)?.data.participants.create ?? [];
    const destinataire = created.find((p: any) => p.userId === INCONNUE);
    // Constat : 201, aucune demande posée, et une notification d'invitation part.
    expect({ status: res.statusCode, request: destinataire?.messageRequestAt instanceof Date, invited: invite.mock.calls.length })
      .toEqual({ status: 201, request: true, invited: 0 });
  });
});
