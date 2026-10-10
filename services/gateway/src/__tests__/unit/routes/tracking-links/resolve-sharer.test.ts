/**
 * #9149 — « X VOUS A PARTAGÉ CE RÉEL ».
 *
 * `GET /tracking-links/:token/resolve` est PUBLIQUE (la page `/l/<token>` et la
 * page de contenu qui porte `?via=<token>` l'appellent sans session). Elle sert
 * désormais l'identité PUBLIQUE de qui a partagé un CONTENU — nom affiché,
 * pseudo, avatar — et rien d'autre : ni son identifiant, ni sa présence, ni ses
 * coordonnées. Un lien vers une adresse externe, une invitation de
 * conversation, un lien éteint ou un partageur désactivé ne nomment personne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async (req: { authContext?: unknown }) => {
    req.authContext = { type: 'anonymous', isAuthenticated: false, registeredUser: null };
  }),
  isRegisteredUser: jest.fn().mockReturnValue(false),
  UnifiedAuthRequest: {},
}));

const mockResolveTarget = jest.fn<(token: string) => Promise<Record<string, unknown> | null>>();

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    resolveTarget: (token: string) => mockResolveTarget(token),
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

const TOKEN = 'abc123';
const SHARER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

type SharerRow = Record<string, unknown> | null;

const activeSharer = (): SharerRow => ({
  username: 'alice',
  displayName: 'Alice Martin',
  avatar: 'https://cdn.meeshy.me/a.jpg',
  isActive: true,
  deletedAt: null,
  deactivatedAt: null,
  email: 'alice@example.com',
  isOnline: true,
  lastActiveAt: new Date(),
});

const contentLink = (overrides: Record<string, unknown> = {}) => ({
  kind: 'tracking',
  targetType: 'REEL',
  targetId: POST_ID,
  originalUrl: `https://meeshy.me/reel/${POST_ID}`,
  sharerId: SHARER_ID,
  isActive: true,
  expiresAt: null,
  ...overrides,
});

async function buildApp(sharer: SharerRow): Promise<{ app: FastifyInstance; findUnique: jest.Mock }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const findUnique = jest.fn<(arg: unknown) => Promise<SharerRow>>().mockResolvedValue(sharer);
  app.decorate('prisma', { user: { findUnique } } as never);
  await registerCreationRoutes(app);
  await app.ready();
  return { app, findUnique: findUnique as unknown as jest.Mock };
}

const resolve = (app: FastifyInstance) => app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/resolve` });

beforeEach(() => mockResolveTarget.mockReset());

describe('GET /tracking-links/:token/resolve — le partageur d’un contenu', () => {
  it('nomme qui a partagé un réel : nom affiché, pseudo, avatar — et rien d’autre', async () => {
    mockResolveTarget.mockResolvedValue(contentLink());
    const { app, findUnique } = await buildApp(activeSharer());
    const res = await resolve(app);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.sharer).toEqual({ displayName: 'Alice Martin', username: 'alice', avatar: 'https://cdn.meeshy.me/a.jpg' });
    expect(data).toMatchObject({ targetType: 'REEL', targetId: POST_ID, isActive: true });
    expect(res.body).not.toContain(SHARER_ID);
    expect(res.body).not.toContain('alice@example.com');
    expect(res.body).not.toContain('isOnline');
    expect(res.body).not.toContain('lastActiveAt');
    expect((findUnique.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({ id: SHARER_ID });
    await app.close();
  });

  it.each(['POST', 'STORY', 'STATUS'])('nomme aussi le partageur d’un contenu %s', async (targetType) => {
    mockResolveTarget.mockResolvedValue(contentLink({ targetType }));
    const { app } = await buildApp(activeSharer());
    expect((await resolve(app)).json().data.sharer).toMatchObject({ username: 'alice' });
    await app.close();
  });

  it('un avatar absent reste absent', async () => {
    mockResolveTarget.mockResolvedValue(contentLink());
    const { app } = await buildApp({ ...activeSharer(), avatar: null, displayName: null });
    expect((await resolve(app)).json().data.sharer).toEqual({ displayName: null, username: 'alice', avatar: null });
    await app.close();
  });
});

describe('GET /tracking-links/:token/resolve — personne n’est nommé', () => {
  const nobody = async (link: Record<string, unknown> | null, sharer: SharerRow = activeSharer()) => {
    mockResolveTarget.mockResolvedValue(link);
    const { app, findUnique } = await buildApp(sharer);
    const res = await resolve(app);
    await app.close();
    return { res, findUnique };
  };

  it('un lien vers une adresse externe', async () => {
    const { res, findUnique } = await nobody(contentLink({ targetType: 'EXTERNAL', targetId: null }));
    expect(res.json().data.sharer).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('une invitation de conversation', async () => {
    const { res, findUnique } = await nobody(contentLink({ kind: 'conversation', targetType: 'CONVERSATION' }));
    expect(res.json().data.sharer).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('un lien éteint ou expiré', async () => {
    const { res, findUnique } = await nobody(contentLink({ isActive: false }));
    expect(res.json().data.sharer).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('un lien sans créateur', async () => {
    const { res } = await nobody(contentLink({ sharerId: null }));
    expect(res.json().data.sharer).toBeNull();
  });

  it.each([
    ['désactivé', { isActive: false }],
    ['supprimé', { deletedAt: new Date() }],
    ['mis en sommeil', { deactivatedAt: new Date() }],
  ])('un partageur %s', async (_label, overrides) => {
    const { res } = await nobody(contentLink(), { ...activeSharer(), ...overrides });
    expect(res.json().data.sharer).toBeNull();
  });

  it('un partageur introuvable', async () => {
    const { res } = await nobody(contentLink(), null);
    expect(res.json().data.sharer).toBeNull();
  });
});
