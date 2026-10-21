/**
 * #10001 — les termes d'un lien EXPOSÉS au client portent la liste des
 * familles qu'un invité peut joindre : à l'aperçu (`GET /anonymous/link/:id`),
 * à l'entrée (`POST /links/:key/members`) et au rafraîchissement de session
 * (`PATCH /guest-sessions/me`). C'est la liste EFFECTIVE — World Wide est
 * plafonnée à `text` + `audio` par sa conversation — et `null` dit « pas de
 * restriction par famille ». Les schémas partagés ne sont pas mockés : le
 * champ doit traverser la vraie sérialisation.
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

import { anonymousRoutes } from '../../../routes/anonymous';
import { registerLinkAdmissionRoutes } from '../../../routes/conversations/link-admission';
import { executeurImmediat } from '../../helpers/after-response';

const LINK_ID = 'mshy_world';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const worldLink = (overrides: Record<string, unknown> = {}) => ({
  id: SHARE_LINK_DB_ID, linkId: 'mshy_abc', identifier: LINK_ID, name: 'World Wide', description: null,
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null, currentUses: 0,
  maxConcurrentUsers: null, currentConcurrentUsers: 0, maxUniqueSessions: null, currentUniqueSessions: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false, allowViewHistory: false,
  allowedAttachmentKinds: ['text', 'audio'],
  conversation: {
    id: CONV_ID, identifier: 'world', title: 'World Wide', description: null, type: 'global',
    avatar: null, banner: null, isActive: true, closedAt: null, createdAt: new Date('2026-10-01T00:00:00.000Z'),
  },
  creator: { id: 'creator', username: 'meeshy', firstName: 'Meeshy', lastName: 'Sama', displayName: 'Meeshy', avatar: null },
  ...overrides,
});

const teamLink = () =>
  worldLink({
    identifier: 'mshy_team',
    allowedAttachmentKinds: [],
    conversation: { ...worldLink().conversation, identifier: 'team', type: 'group' },
  });

async function anonymousOptionalAuth(request: FastifyRequest): Promise<void> {
  (request as unknown as { authContext: unknown }).authContext = { type: 'anonymous', isAuthenticated: false, isAnonymous: true };
}

async function previewApp(row: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: { findFirst: jest.fn(async () => row), findUnique: jest.fn(async () => row) },
    participant: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    $runCommandRaw: jest.fn(async () => ({ ok: 1, n: 1, nModified: 1 })),
  } as never);
  await anonymousRoutes(app, {
    afterResponse: executeurImmediat().afterResponse,
    optionalAuth: anonymousOptionalAuth,
    linkVisits: { recordLinkVisit: jest.fn(async () => 0) },
  });
  await app.ready();
  return app;
}

async function admissionApp(row: unknown, guest: unknown = null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(row),
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    participant: {
      findFirst: jest.fn().mockResolvedValue(guest),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'participant-1', avatar: null, ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'participant-1', avatar: null, ...data })),
    },
    message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
  } as never);
  const noIdentity = async () => undefined;
  registerLinkAdmissionRoutes(app as never, (app as any).prisma, noIdentity, noIdentity);
  await app.ready();
  return app;
}

describe('GET /anonymous/link/:identifier — l’aperçu dit ce qu’un invité peut joindre', () => {
  it('World Wide : texte et audio', async () => {
    const app = await previewApp(worldLink());
    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.allowedAttachmentKinds).toEqual(['text', 'audio']);
  });

  it('World Wide reste plafonnée même quand son lien ne liste rien', async () => {
    const app = await previewApp(worldLink({ allowedAttachmentKinds: [] }));
    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });
    await app.close();

    expect(res.json().data.allowedAttachmentKinds).toEqual(['text', 'audio']);
  });

  it('un lien sans familles sert null : les drapeaux d’avant s’appliquent', async () => {
    const app = await previewApp(teamLink());
    const res = await app.inject({ method: 'GET', url: `/anonymous/link/mshy_team` });
    await app.close();

    expect(res.json().data).toHaveProperty('allowedAttachmentKinds', null);
  });
});

describe('POST /links/:key/members — l’entrée d’un invité porte ses familles', () => {
  it('World Wide : texte et audio, à côté des droits', async () => {
    const app = await admissionApp(worldLink());
    const res = await app.inject({ method: 'POST', url: `/links/${LINK_ID}/members`, payload: { nickname: 'Ama' } });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(res.json().data.entry.allowedAttachmentKinds).toEqual(['text', 'audio']);
  });
});

describe('PATCH /guest-sessions/me — la session rafraîchie porte les familles du lien', () => {
  it('World Wide : texte et audio', async () => {
    const guest = {
      id: 'p1', isActive: true, displayName: 'Ama', language: 'fr', avatar: null,
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
      anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: { firstName: 'Ama', lastName: '', username: 'Ama' }, session: {} },
    };
    const app = await admissionApp(worldLink(), guest);
    const res = await app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': 'tok' } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.conversation.allowedAttachmentKinds).toEqual(['text', 'audio']);
  });
});
