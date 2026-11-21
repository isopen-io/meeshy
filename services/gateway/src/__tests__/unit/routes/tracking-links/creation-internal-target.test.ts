/**
 * `POST /tracking-links` vers une cible MEESHY choisie (#19418) — planche
 * Lien-Suivi-Creer : publication, réel, story, statut, conversation, ma vitrine.
 *
 * La passerelle vérifie que l'appelant peut PARTAGER la cible avant toute
 * frappe, compose elle-même l'adresse (celle du client est ignorée), garde le
 * nom, les UTM et l'échéance, et réutilise le lien de l'appelant pour la même
 * cible. Sans `targetType`, rien ne change (lien EXTERNAL).
 *
 * Les lois d'audience (lecture d'un post, blocage, appartenance) sont des
 * doubles ici : elles ont leurs propres témoins ; ce qui est témoigné est que
 * la route les CONSULTE et que leur refus ne laisse rien derrière lui.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: jest.fn(() => Promise.resolve()),
  })),
}));

const registeredContext = (id: string) => ({
  type: 'registered' as const,
  isAuthenticated: true,
  isAnonymous: false,
  userId: id,
  hasFullAccess: true,
  registeredUser: { id, username: id, role: 'USER' },
});

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async (req: any) => {
    const userId = req.headers['x-test-user'];
    req.authContext = userId ? registeredContext(userId) : { type: 'anonymous', isAuthenticated: false };
  }),
  isRegisteredUser: jest.fn().mockImplementation((ctx: any) => ctx?.type === 'registered'),
  UnifiedAuthRequest: {},
}));

const READABLE: Record<string, readonly string[]> = {};
const BLOCKED: Record<string, readonly string[]> = {};
const MEMBERS: Record<string, readonly string[]> = {};

jest.mock('../../../../routes/posts/postConsumptionGate', () => ({
  mayConsumePost: jest.fn(async (_p: unknown, postId: string, userId: string) =>
    (READABLE[postId] ?? []).includes(userId)),
}));

jest.mock('../../../../services/posts/contentAuthorBlock', () => ({
  isBlockedWithContentAuthors: jest.fn(async (_p: unknown, params: { actorId: string; postId: string }) =>
    (BLOCKED[params.postId] ?? []).includes(params.actorId)),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  verdictAccesConversation: jest.fn(async (_p: unknown, ctx: { userId: string }, id: string) =>
    (MEMBERS[id] ?? []).includes(ctx.userId) ? { genre: 'ok' } : { genre: 'non-membre' }),
  refuserAccesConversation: jest.fn((reply: any) => reply.status(404).send({ success: false, error: 'Conversation not found' })),
}));

import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

const POST_ID = '64b000000000000000000001';
const REEL_ID = '64b000000000000000000002';
const STORY_ID = '64b000000000000000000003';
const STATUS_ID = '64b000000000000000000004';
const CONV_ID = '64c000000000000000000001';
const AISSA = '64a000000000000000000001';
const LEA = '64a000000000000000000002';

const POSTS: Record<string, string> = { [POST_ID]: 'POST', [REEL_ID]: 'REEL', [STORY_ID]: 'STORY', [STATUS_ID]: 'STATUS' };
const USERS: Record<string, string> = { [AISSA]: 'aissa', [LEA]: 'lea' };

type StoredLink = Record<string, unknown> & { id: string; token: string };

const matches = (row: StoredLink, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Array<Record<string, unknown>>).some((branch) => matches(row, branch));
    if (typeof value === 'object' && value !== null && 'isSet' in value) {
      return (row[key] !== undefined) === (value as { isSet: boolean }).isSet;
    }
    return row[key] === value;
  });

const buildPrisma = () => {
  const rows: StoredLink[] = [];
  const trackingLink = {
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => matches(row, where)) ?? null),
    findUnique: jest.fn(async ({ where }: { where: { token: string } }) =>
      rows.find((row) => row.token === where.token) ?? null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: StoredLink = {
        ...data,
        id: `link-${rows.length + 1}`,
        token: String(data.token),
        createdAt: new Date('2026-11-17T12:00:00Z'),
        updatedAt: new Date('2026-11-17T12:00:00Z'),
      };
      rows.push(row);
      return row;
    }),
  };
  const post = {
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
      POSTS[where.id] ? { id: where.id, type: POSTS[where.id] } : null),
  };
  const user = {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
      USERS[where.id] ? { id: where.id, username: USERS[where.id] } : null),
  };
  return { rows, prisma: { trackingLink, post, user } };
};

const buildApp = async (prisma: ReturnType<typeof buildPrisma>['prisma']) => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as any);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
};

const create = (app: FastifyInstance, as: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/tracking-links', headers: { 'x-test-user': as }, payload });

describe('POST /tracking-links — une cible Meeshy choisie (#19418)', () => {
  let app: FastifyInstance;
  let store: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    process.env.FRONTEND_URL = 'https://meeshy.me';
    Object.keys(READABLE).forEach((k) => delete READABLE[k]);
    Object.keys(BLOCKED).forEach((k) => delete BLOCKED[k]);
    Object.keys(MEMBERS).forEach((k) => delete MEMBERS[k]);
    store = buildPrisma();
    app = await buildApp(store.prisma);
  });
  afterEach(async () => { await app.close(); });

  it('crée le lien vers ma vitrine, adresse composée par la passerelle, nom, UTM et échéance gardés', async () => {
    const response = await create(app, AISSA, {
      targetType: 'PROFILE',
      targetId: AISSA,
      originalUrl: 'https://evil.example/phish',
      name: 'Ma vitrine',
      source: 'instagram',
      medium: 'bio',
      campaign: 'rentree',
      expiresAt: '2026-12-17T00:00:00.000Z',
      customToken: 'aissa',
    });

    expect(response.statusCode).toBe(201);
    const link = response.json().data.trackingLink;
    expect(link).toMatchObject({
      targetType: 'PROFILE',
      targetId: AISSA,
      originalUrl: 'https://meeshy.me/u/aissa',
      name: 'Ma vitrine',
      source: 'instagram',
      medium: 'bio',
      campaign: 'rentree',
      token: 'aissa',
      countUnique: true,
    });
    expect(link.expiresAt).toBe('2026-12-17T00:00:00.000Z');
    expect(JSON.stringify(store.rows)).not.toContain('evil.example');
  });

  it('refuse la vitrine d\'un autre en 404, sans rien frapper', async () => {
    const response = await create(app, LEA, { targetType: 'PROFILE', targetId: AISSA });

    expect(response.statusCode).toBe(404);
    expect(JSON.stringify(response.json())).not.toContain('aissa');
    expect(store.rows).toHaveLength(0);
  });

  it.each([
    ['POST', POST_ID, 'https://meeshy.me/post/'],
    ['REEL', REEL_ID, 'https://meeshy.me/reel/'],
    ['STORY', STORY_ID, 'https://meeshy.me/story/'],
    ['STATUS', STATUS_ID, 'https://meeshy.me/mood/'],
  ])('crée le lien vers un %s lisible par l\'appelant', async (targetType, targetId, prefix) => {
    READABLE[targetId] = [LEA];

    const response = await create(app, LEA, { targetType, targetId, name: 'Campagne' });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.trackingLink).toMatchObject({
      targetType,
      targetId,
      originalUrl: `${prefix}${targetId}`,
      name: 'Campagne',
      createdBy: LEA,
    });
  });

  it('refuse un contenu que l\'appelant ne peut pas lire, comme une cible absente', async () => {
    READABLE[POST_ID] = [AISSA];

    const unreadable = await create(app, LEA, { targetType: 'POST', targetId: POST_ID });
    const missing = await create(app, LEA, { targetType: 'POST', targetId: '64b0000000000000000000ff' });

    expect(unreadable.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(unreadable.json()).toEqual(missing.json());
    expect(store.rows).toHaveLength(0);
  });

  it('refuse un contenu lisible dont l\'auteur bloque l\'appelant', async () => {
    READABLE[POST_ID] = [LEA];
    BLOCKED[POST_ID] = [LEA];

    const response = await create(app, LEA, { targetType: 'POST', targetId: POST_ID });

    expect(response.statusCode).toBe(404);
    expect(store.rows).toHaveLength(0);
  });

  it('refuse un type qui ne concorde pas avec le contenu (un réel annoncé comme story)', async () => {
    READABLE[REEL_ID] = [LEA];

    const response = await create(app, LEA, { targetType: 'STORY', targetId: REEL_ID });

    expect(response.statusCode).toBe(404);
    expect(store.rows).toHaveLength(0);
  });

  it('crée le lien vers une conversation dont l\'appelant est membre, et refuse sinon', async () => {
    MEMBERS[CONV_ID] = [AISSA];

    const member = await create(app, AISSA, { targetType: 'CONVERSATION', targetId: CONV_ID });
    const outsider = await create(app, LEA, { targetType: 'CONVERSATION', targetId: CONV_ID });

    expect(member.statusCode).toBe(201);
    expect(member.json().data.trackingLink).toMatchObject({
      targetType: 'CONVERSATION',
      targetId: CONV_ID,
      originalUrl: `https://meeshy.me/c/${CONV_ID}`,
    });
    expect(outsider.statusCode).toBe(404);
    expect(store.rows.map((row) => row.createdBy)).toEqual([AISSA]);
  });

  it('réutilise le lien de l\'appelant pour la même cible, jamais celui d\'un autre', async () => {
    READABLE[POST_ID] = [AISSA, LEA];

    const first = await create(app, AISSA, { targetType: 'POST', targetId: POST_ID });
    const again = await create(app, AISSA, { targetType: 'POST', targetId: POST_ID, name: 'Autre' });
    const other = await create(app, LEA, { targetType: 'POST', targetId: POST_ID });

    expect(again.statusCode).toBe(200);
    expect(again.json().data.existed).toBe(true);
    expect(again.json().data.trackingLink.token).toBe(first.json().data.trackingLink.token);
    expect(other.statusCode).toBe(201);
    expect(other.json().data.trackingLink.createdBy).toBe(LEA);
    expect(store.rows).toHaveLength(2);
  });

  it('perd une course contre sa propre création concurrente sans erreur : le lien gagnant est rendu', async () => {
    READABLE[POST_ID] = [LEA];
    store.prisma.trackingLink.create.mockImplementationOnce(async () => {
      store.rows.push({ id: 'winner', token: 'Win123', targetId: POST_ID, createdBy: LEA, targetType: 'POST' });
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    });

    const response = await create(app, LEA, { targetType: 'POST', targetId: POST_ID });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ existed: true, trackingLink: { token: 'Win123' } });
    expect(store.rows).toHaveLength(1);
  });

  it('garde le choix de ne pas compter les visiteurs uniques', async () => {
    const response = await create(app, AISSA, { targetType: 'PROFILE', targetId: AISSA, countUnique: false });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.trackingLink.countUnique).toBe(false);
    expect(store.rows[0].countUnique).toBe(false);
  });

  it('refuse un type de cible inconnu ou une cible sans identifiant', async () => {
    const external = await create(app, AISSA, { targetType: 'EXTERNAL', targetId: AISSA });
    const noId = await create(app, AISSA, { targetType: 'PROFILE' });
    const badId = await create(app, AISSA, { targetType: 'PROFILE', targetId: 'aissa' });

    expect(external.statusCode).toBe(400);
    expect(noId.statusCode).toBe(400);
    expect(badId.statusCode).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it('sans cible, une adresse externe reste un lien EXTERNAL comme avant', async () => {
    const response = await create(app, AISSA, { originalUrl: 'https://example.org/page', name: 'Site' });

    expect(response.statusCode).toBe(201);
    const link = response.json().data.trackingLink;
    expect(link.originalUrl).toBe('https://example.org/page');
    expect(link.countUnique).toBe(true);
    expect(store.rows[0].targetType).toBeUndefined();
    expect(store.rows[0].targetId).toBeUndefined();
  });

  it('sans cible ni adresse, la demande reste invalide', async () => {
    const response = await create(app, AISSA, { name: 'Rien' });

    expect(response.statusCode).toBe(400);
    expect(store.rows).toHaveLength(0);
  });
});
