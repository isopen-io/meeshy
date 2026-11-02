/**
 * #14107 (MSG-01, RG-21) — `POST /conversations` d'un tête-à-tête NEUF : direct
 * dès Connaissance, demande dans la boîte du destinataire en dessous, refus
 * muet du Public vers un mineur. La décision est la VRAIE
 * (`decideDirectOpening`), jouée sur un monde en mémoire ; le témoin lit les
 * lignes `Participant` remises à `conversation.create`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../../services/participantRights';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld, type CircleLink } from '../../helpers/messaging-circle-world';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

const MOI = '507f1f77bcf86cd799439101';
const INCONNU = '507f1f77bcf86cd799439102';
const CONNAISSANCE = '507f1f77bcf86cd799439103';
const MINEUR = '507f1f77bcf86cd799439104';

type CreatedParticipant = { userId: string; role: string; permissions: Record<string, boolean>; messageRequestAt?: Date; messageRequestRisk?: number };

function app(links: readonly CircleLink[] = []) {
  const world = messagingWorld({
    links,
    users: [
      { id: MOI, birthDate: ADULT_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z'), displayName: 'Moi', username: 'moi' },
      { id: INCONNU, birthDate: ADULT_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z'), displayName: 'Inconnu', username: 'inconnu' },
      { id: CONNAISSANCE, birthDate: ADULT_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z'), displayName: 'Connue', username: 'connue' },
      { id: MINEUR, birthDate: MINOR_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z'), displayName: 'Jeune', username: 'jeune' },
    ],
  });
  const conversationCreate = jest.fn(async (_args: unknown) => ({ id: '507f1f77bcf86cd7994391aa', identifier: 'mshy_x', type: 'direct', title: null, participants: [] }));
  const prisma = {
    ...world.prisma,
    conversation: { findFirst: jest.fn(async () => null), create: conversationCreate },
    notification: { create: jest.fn(async () => ({})) },
  } as unknown as PrismaClient;
  return { prisma, conversationCreate };
}

async function server(prisma: PrismaClient): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false, userId: MOI, registeredUser: { id: MOI }, hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(fastify, prisma, auth, auth);
  await fastify.ready();
  return fastify;
}

async function ouvrir(peer: string, links: readonly CircleLink[] = []) {
  const { prisma, conversationCreate } = app(links);
  const fastify = await server(prisma);
  const res = await fastify.inject({ method: 'POST', url: '/conversations', payload: { type: 'direct', participantIds: [peer] } });
  await fastify.close();
  const call = conversationCreate.mock.calls[0]?.[0] as { data: { participants: { create: CreatedParticipant[] } } } | undefined;
  return { res, participants: call?.data.participants.create ?? [] };
}

describe('POST /conversations — la boîte de demandes (#14107)', () => {
  it('un inconnu ouvre une DEMANDE : la ligne du destinataire porte sa date et son score', async () => {
    const { res, participants } = await ouvrir(INCONNU);
    expect(res.statusCode).toBe(201);
    const destinataire = participants.find((p) => p.userId === INCONNU);
    expect(destinataire?.messageRequestAt).toBeInstanceOf(Date);
    expect(typeof destinataire?.messageRequestRisk).toBe('number');
    expect(participants.find((p) => p.userId === MOI)).not.toHaveProperty('messageRequestAt');
    expect(destinataire).toMatchObject({ messageRequestFromId: MOI });
  });

  it('une Connaissance écrit directement : aucune demande', async () => {
    const { participants } = await ouvrir(CONNAISSANCE, [[MOI, CONNAISSANCE, 'ACQUAINTANCE']]);
    expect(participants.find((p) => p.userId === CONNAISSANCE)?.messageRequestAt).toBeNull();
  });

  it('vers un mineur, la porte répond comme vers un majeur (audit B2) : 201, demande contenue, expéditeur sans média', async () => {
    const { res, participants } = await ouvrir(MINEUR);
    expect(res.statusCode).toBe(201);
    const jeune = participants.find((p) => p.userId === MINEUR);
    expect(jeune?.messageRequestRisk).toBe(100);
    expect(participants.find((p) => p.userId === MOI)?.permissions).toMatchObject({ canSendImages: false, canSendFiles: false });
  });

  it('un groupe ne débloque rien (RG-22) : l\'inconnu et le mineur entrent par leur boîte, rien ne s\'annonce', async () => {
    const { prisma, conversationCreate } = app();
    const fastify = await server(prisma);
    const res = await fastify.inject({ method: 'POST', url: '/conversations', payload: { type: 'group', title: 'Club', participantIds: [INCONNU, MINEUR, CONNAISSANCE] } });
    await fastify.close();
    expect(res.statusCode).toBe(201);
    const created = (conversationCreate.mock.calls[0]?.[0] as { data: { participants: { create: CreatedParticipant[] } } }).data.participants.create;
    expect(created.find((p) => p.userId === INCONNU)?.messageRequestAt).toBeInstanceOf(Date);
    expect(created.find((p) => p.userId === MINEUR)?.messageRequestAt).toBeInstanceOf(Date);
  });

  it('vers un majeur comme vers un mineur, l\'expéditeur d\'une demande n\'envoie aucun média : rien ne distingue l\'âge (contre-audit C1)', async () => {
    const versMajeur = (await ouvrir(INCONNU)).participants.find((p) => p.userId === MOI)?.permissions;
    const versMineur = (await ouvrir(MINEUR)).participants.find((p) => p.userId === MOI)?.permissions;
    expect(versMajeur).toEqual(versMineur);
    expect(versMajeur).toMatchObject({ canSendMessages: true, canSendImages: false, canSendFiles: false, canSendVideos: false, canSendAudios: false });
  });

  it('vers une Connaissance, l\'expéditeur garde ses droits fondateurs', async () => {
    const { participants } = await ouvrir(CONNAISSANCE, [[MOI, CONNAISSANCE, 'ACQUAINTANCE']]);
    expect(participants.find((p) => p.userId === MOI)?.permissions).toEqual({ ...FOUNDING_MEMBER_PERMISSIONS });
  });
});
