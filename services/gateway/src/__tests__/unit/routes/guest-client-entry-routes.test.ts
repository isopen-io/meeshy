/**
 * #10102 — le poste RÉDUIT d'un invité est relevé par les PORTES d'entrée, pas
 * seulement par le cœur `performLinkJoin` : c'est la route qui lit l'en-tête
 * `User-Agent` et le remet au cœur. Un témoin du seul cœur resterait vert le
 * jour où une porte cesserait de transmettre l'en-tête — et la fiche de
 * modération dirait « aucun poste » pour tout invité entré par elle.
 *
 * Les deux portes invitées : `POST /links/:key/members` (canonique, celle de la
 * landing de World Wide) et `POST /anonymous/join/:linkId` (alias déprécié).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s),
    sanitizeUsername: jest.fn((s: string) => s),
  },
}));

import { registerLinkAdmissionRoutes } from '../../../routes/conversations/link-admission';
import { anonymousRoutes } from '../../../routes/anonymous';
import { executeurImmediat } from '../../helpers/after-response';

const LINK_KEY = 'mshy_world';
const CONV_ID = '507f1f77bcf86cd799439022';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';

const REDUCED_IPHONE = { browser: 'Mobile Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile' };

const shareLinkRow = () => ({
  id: '507f1f77bcf86cd799439011', linkId: 'mshy_abc', identifier: LINK_KEY, createdBy: '507f1f77bcf86cd799439099',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false,
  allowViewHistory: true,
  conversation: { id: CONV_ID, identifier: 'world', title: 'World Wide', type: 'global', isActive: true, closedAt: null },
});

function fakePrisma(created: Record<string, unknown>[]) {
  const link = shareLinkRow();
  return {
    conversationShareLink: {
      findFirst: jest.fn(async () => link),
      findUnique: jest.fn(async () => link),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    participant: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'participant-1', avatar: null, joinedAt: new Date(), ...data };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', ...data })),
    },
    message: { create: jest.fn(async () => ({ id: 'msg-1' })) },
    conversation: { update: jest.fn(async () => ({})) },
  };
}

const noIdentity = async (): Promise<void> => undefined;

async function linkMembersApp(created: Record<string, unknown>[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', fakePrisma(created) as never);
  registerLinkAdmissionRoutes(app as never, (app as unknown as { prisma: never }).prisma, noIdentity, noIdentity);
  await app.ready();
  return app;
}

async function anonymousJoinApp(created: Record<string, unknown>[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', fakePrisma(created) as never);
  await anonymousRoutes(app, {
    afterResponse: executeurImmediat().afterResponse,
    optionalAuth: noIdentity,
    linkVisits: { recordLinkVisit: async () => 0 },
  });
  await app.ready();
  return app;
}

const sessionClientOf = (created: Record<string, unknown>[]): unknown =>
  (created[0]?.anonymousSession as { session?: { client?: unknown } } | undefined)?.session?.client;

describe('les portes invitées transmettent le User-Agent de la requête au relevé du poste', () => {
  it('POST /links/:key/members — la porte de World Wide grave le poste réduit, jamais la chaîne', async () => {
    const created: Record<string, unknown>[] = [];
    const app = await linkMembersApp(created);
    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_KEY}/members`,
      payload: { nickname: 'Ama', language: 'fr' },
      headers: { 'user-agent': IPHONE_UA },
    });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(sessionClientOf(created)).toEqual(REDUCED_IPHONE);
    expect(JSON.stringify(created)).not.toContain('AppleWebKit');
  });

  it('POST /anonymous/join/:linkId — l’alias grave le même poste réduit', async () => {
    const created: Record<string, unknown>[] = [];
    const app = await anonymousJoinApp(created);
    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_KEY}`,
      payload: { firstName: 'Ama', lastName: 'K', language: 'fr' },
      headers: { 'user-agent': IPHONE_UA },
    });
    await app.close();

    expect(res.statusCode).toBeLessThan(300);
    expect(sessionClientOf(created)).toEqual(REDUCED_IPHONE);
    expect(JSON.stringify(created)).not.toContain('AppleWebKit');
  });
});
