/**
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld } from '../helpers/messaging-circle-world';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));
jest.mock('../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

const MOI = '507f1f77bcf86cd799439101';
const MAJEUR = '507f1f77bcf86cd799439102';
const MINEUR = '507f1f77bcf86cd799439104';
const OLD = new Date('2025-01-01T00:00:00.000Z');

async function ouvrir(peer: string) {
  const world = messagingWorld({
    users: [
      { id: MOI, birthDate: ADULT_BIRTH, createdAt: OLD, displayName: 'Moi', username: 'moi' },
      { id: MAJEUR, birthDate: ADULT_BIRTH, createdAt: OLD, displayName: 'A', username: 'a' },
      { id: MINEUR, birthDate: MINOR_BIRTH, createdAt: OLD, displayName: 'J', username: 'j' },
    ],
  });
  const create = jest.fn(async (args: any) => ({
    id: '507f1f77bcf86cd7994391aa', identifier: 'mshy_x', type: 'direct', title: null, createdAt: new Date(),
    participants: args.data.participants.create.map((p: any, i: number) => ({ id: `p${i}`, ...p, user: { id: p.userId } })),
  }));
  const prisma = { ...world.prisma, conversation: { findFirst: jest.fn(async () => null), create }, notification: { create: jest.fn(async () => ({})) } } as unknown as PrismaClient;
  const fastify = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _r: FastifyReply) => {
    (request as any).authContext = { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: MOI, registeredUser: { id: MOI }, hasFullAccess: true };
  };
  const { registerCoreRoutes } = await import('../../routes/conversations/core');
  registerCoreRoutes(fastify, prisma, auth, auth);
  await fastify.ready();
  const res = await fastify.inject({ method: 'POST', url: '/conversations', payload: { type: 'direct', participantIds: [peer] } });
  await fastify.close();
  return res;
}

describe('contre-audit #14107 — la 201 dit encore l\'âge par les droits de l\'expéditeur', () => {
  it('les droits servis à l\'expéditeur ne distinguent pas un inconnu mineur d\'un inconnu majeur', async () => {
    const versMajeur = (await ouvrir(MAJEUR)).json().data.participants.find((p: any) => p.userId === MOI);
    const versMineur = (await ouvrir(MINEUR)).json().data.participants.find((p: any) => p.userId === MOI);
    expect(versMineur.permissions).toEqual(versMajeur.permissions);
  });
});
