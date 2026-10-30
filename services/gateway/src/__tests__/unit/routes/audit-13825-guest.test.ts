/**
 * Audit adversarial #13825 (2e passage) — témoins qui DOIVENT échouer sur le lot.
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { registerLinkAdmissionRoutes } from '../../../routes/conversations/link-admission';
import { anonymousRoutes } from '../../../routes/anonymous';
import { executeurImmediat } from '../../helpers/after-response';
import { visibleNameLength } from '@meeshy/shared/utils/visible-name-length';
import { AuthSchemas } from '@meeshy/shared/utils/validation';
import { SecuritySanitizer } from '../../../utils/sanitize';

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


describe('W1 — la mesure « visible » ne correspond pas a ce que sanitizeText STOCKE (jonction invitee)', () => {
  it.each([['balise non fermee', 'A<xy'], ['contenu interdit', 'A<script>bc</script>']])(
    'POST /anonymous/join/:linkId — prenom %s : ne doit pas creer un invite au prenom d une lettre',
    async (_cas, prenom) => {
      const created: Record<string, unknown>[] = [];
      const app = await anonymousJoinApp(created);
      const res = await app.inject({ method: 'POST', url: `/anonymous/join/${LINK_KEY}`, payload: { firstName: prenom, lastName: 'Ko', language: 'fr' } });
      await app.close();
      const stockes = JSON.stringify(created);
      expect(SecuritySanitizer.sanitizeText(prenom)).toBe('A');
      expect(res.statusCode).toBe(400);
      expect(stockes).not.toContain('"firstName":"A"');
    },
  );
});

describe('W2 — un caractere de FORMAT (Cf) compte pour un graphème visible', () => {
  it.each([['LRM', 'A‎'], ['WORD JOINER', 'A⁠'], ['SOFT HYPHEN', 'A­'], ['RLO', 'A‮'], ['LRI', 'A⁦']])(
    '« A » + %s ne fait pas un nom de 2', (_cas, v) => {
      expect(visibleNameLength(v)).toBe(1);
    },
  );
  it('un HANGUL FILLER (lettre invisible) passe meme l inscription, motif compris', () => {
    expect(AuthSchemas.register.safeParse({ email: 'lena@example.com', firstName: 'Aㅤ' }).success).toBe(false);
    expect(AuthSchemas.register.safeParse({ email: 'lena@example.com', displayName: 'ㅤㅤ' }).success).toBe(false);
  });
});

describe('W5 — le pseudo invite se mesure sur la base qui le SERT (sanitizeUsername)', () => {
  it('POST /links/:key/members — « Al# » (base servie « Al ») rend 400, minimum 3, rien n est cree', async () => {
    const created: Record<string, unknown>[] = [];
    const app = await linkMembersApp(created);
    const res = await app.inject({ method: 'POST', url: `/links/${LINK_KEY}/members`, payload: { nickname: 'Al#', language: 'fr' } });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().violations).toEqual([{ path: 'nickname', message: expect.stringContaining('3'), minimum: 3 }]);
    expect(created).toEqual([]);
  });

  it('POST /links/:key/members — « Ali# » (base servie « Ali ») est admis', async () => {
    const created: Record<string, unknown>[] = [];
    const app = await linkMembersApp(created);
    const res = await app.inject({ method: 'POST', url: `/links/${LINK_KEY}/members`, payload: { nickname: 'Ali#', language: 'fr' } });
    await app.close();
    expect(res.statusCode).toBe(201);
  });

  it('POST /anonymous/join/:linkId — pseudo « Al! » rend 400 avec son minimum', async () => {
    const created: Record<string, unknown>[] = [];
    const app = await anonymousJoinApp(created);
    const res = await app.inject({ method: 'POST', url: `/anonymous/join/${LINK_KEY}`, payload: { firstName: 'Ama', lastName: 'Ko', username: 'Al!', language: 'fr' } });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().violations).toEqual([{ path: 'username', message: expect.stringContaining('3'), minimum: 3 }]);
    expect(created).toEqual([]);
  });

  it('POST /anonymous/join/:linkId — « Ama Ko » sans pseudo reste admis', async () => {
    const created: Record<string, unknown>[] = [];
    const app = await anonymousJoinApp(created);
    const res = await app.inject({ method: 'POST', url: `/anonymous/join/${LINK_KEY}`, payload: { firstName: 'Ama', lastName: 'Ko', language: 'fr' } });
    await app.close();
    expect(res.statusCode).toBeLessThan(300);
  });
});
