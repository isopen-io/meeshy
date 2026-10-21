/**
 * #10099 — décision porteur du 2026-10-11 : « par défaut dans World Wide on a
 * canViewHistory: true ». Qui entre par `mshy_world`, invité comme inscrit,
 * reçoit l'historique (entrée, et droits pour l'invité — un inscrit n'en reçoit
 * pas le détail) et son plancher d'historique est nul :
 * les messages écrits avant son arrivée lui sont lisibles — c'est la règle que
 * `GET /conversations/:id/messages` applique (`historyFloor.ts`).
 *
 * Le lien n'est pas recopié à la main : ses termes sont ceux que le seed écrit
 * (`WORLD_SHARE_LINK_TERMS`). Les droits d'envoi d'un invité (texte et audio
 * seulement) ne bougent pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s),
    sanitizeUsername: jest.fn((s: string) => s),
  },
}));

import { registerLinkAdmissionRoutes } from '../../../routes/conversations/link-admission';
import { WORLD_SHARE_LINK_TERMS } from '../../../services/world/worldConversation';
import { historyFloorFor, type HistoryFloorJoin } from '../../../services/historyFloor';

const LINK_KEY = 'mshy_world';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const REGISTERED_USER_ID = '507f1f77bcf86cd799439044';

function seededWorldLink() {
  return {
    ...WORLD_SHARE_LINK_TERMS,
    allowedAttachmentKinds: [...WORLD_SHARE_LINK_TERMS.allowedAttachmentKinds],
    id: SHARE_LINK_DB_ID, linkId: 'mshy_abc', identifier: LINK_KEY,
    conversationId: CONV_ID, expiresAt: null, maxUses: null, currentUses: 0,
    maxConcurrentUsers: null, currentConcurrentUsers: 0, maxUniqueSessions: null, currentUniqueSessions: 0,
    allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
    conversation: {
      id: CONV_ID, identifier: 'world', title: 'World Wide', description: null, type: 'global',
      avatar: null, banner: null, isActive: true, closedAt: null, createdAt: new Date('2026-10-01T00:00:00.000Z'),
    },
    creator: { id: 'creator', username: 'meeshy', firstName: 'Meeshy', lastName: 'Sama', displayName: 'Meeshy', avatar: null },
  };
}

async function identityFromHeader(request: FastifyRequest): Promise<void> {
  const registered = request.headers['x-test-identity'] === 'registered';
  (request as unknown as { authContext: unknown }).authContext = registered
    ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId: REGISTERED_USER_ID, displayName: 'Ana', userLanguage: 'fr', hasFullAccess: true, canSendMessages: true }
    : undefined;
}

type CreatedParticipant = HistoryFloorJoin & { readonly permissions: Record<string, boolean> };

async function worldApp(): Promise<{ app: FastifyInstance; created: CreatedParticipant[] }> {
  const created: CreatedParticipant[] = [];
  const link = seededWorldLink();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(link),
      findUnique: jest.fn().mockResolvedValue(link),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Ana Registered', username: 'ana', systemLanguage: 'fr' }) },
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `participant-${created.length + 1}`, avatar: null, joinedAt: new Date(), ...data } as unknown as CreatedParticipant;
        created.push(row);
        return row;
      }),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', avatar: null, ...data })),
    },
    message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
  } as never);
  registerLinkAdmissionRoutes(app as never, (app as unknown as { prisma: never }).prisma, identityFromHeader, identityFromHeader);
  await app.ready();
  return { app, created };
}

describe('World Wide — un entrant lit l’historique du salon (#10099)', () => {
  it('un invité reçoit canViewHistory à l’entrée et dans ses droits, et son plancher est nul', async () => {
    const { app, created } = await worldApp();
    const res = await app.inject({ method: 'POST', url: `/links/${LINK_KEY}/members`, payload: { nickname: 'Ama', language: 'fr' } });
    await app.close();

    expect(res.statusCode).toBe(201);
    const { entry } = res.json().data;
    expect(entry.canViewHistory).toBe(true);
    expect(entry.rights.canViewHistory).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].permissions.canViewHistory).toBe(true);
    expect(historyFloorFor(created[0], { allowViewHistory: WORLD_SHARE_LINK_TERMS.allowViewHistory })).toBeNull();
  });

  it('les droits d’envoi d’un invité ne bougent pas : texte et audio, ni fichier ni image ni vidéo', async () => {
    const { app, created } = await worldApp();
    const res = await app.inject({ method: 'POST', url: `/links/${LINK_KEY}/members`, payload: { nickname: 'Ama', language: 'fr' } });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(created[0].permissions).toMatchObject({
      canSendMessages: true,
      canSendAudios: true,
      canSendFiles: false,
      canSendImages: false,
      canSendVideos: false,
    });
  });

  it('un membre inscrit reçoit aussi l’historique, et son plancher est nul', async () => {
    const { app, created } = await worldApp();
    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_KEY}/members`,
      payload: {},
      headers: { 'x-test-identity': 'registered' },
    });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(res.json().data.entry.canViewHistory).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].permissions.canViewHistory).toBe(true);
    expect(historyFloorFor(created[0], { allowViewHistory: WORLD_SHARE_LINK_TERMS.allowViewHistory })).toBeNull();
  });
});
