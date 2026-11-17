/**
 * Mes adresses : adresses personnelles publiées sur la fiche, chacune avec son cercle (#18863,
 * chantier #18857).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const OWNER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd7994390fe';
let viewerId: string | null = OWNER;
let viewerLevel: string = 'PUBLIC';
let relationReads = 0;

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  presenceFor: () => null,
  applyPresenceVisibilityAsOffline: (rows: unknown) => rows,
  gateProfilePresence: async (_f: unknown, _r: unknown, user: unknown) => user,
  getOptionalAuth: () => async (req: any) => {
    req.authContext = viewerId
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } }
      : { type: 'anonymous', isAuthenticated: false, isAnonymous: true, userId: 'x' };
  },
}));

jest.mock('../../../../services/relations/profileCircleView', () => {
  const actual = jest.requireActual('../../../../services/relations/profileCircleView') as object;
  return { ...actual, readProfileCircleView: async () => { relationReads += 1; return { level: viewerLevel }; } };
});

const created: Array<{ originalUrl: string; createdBy?: string; name?: string }> = [];
const linkUpdates: Array<{ token: string; isActive?: boolean; originalUrl?: string }> = [];
let tokenSeq = 0;
type Link = { createdBy: string; isActive: boolean; totalClicks: number; expiresAt?: Date | null };
let links: Record<string, Link> = {};
jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: () => 'https://meeshy.me',
  TrackingLinkService: class {
    async createTrackingLink(p: { originalUrl: string; createdBy?: string; name?: string }) {
      created.push(p);
      tokenSeq += 1;
      links[`tok${tokenSeq}`] = { createdBy: p.createdBy ?? '', isActive: true, totalClicks: 0 };
      return { id: `tl${tokenSeq}`, token: `tok${tokenSeq}`, totalClicks: 0 };
    }
    async updateTrackingLink(p: { token: string; isActive?: boolean; originalUrl?: string }) {
      if (!links[p.token]) throw new Error('Tracking link not found');
      linkUpdates.push(p);
      if (p.isActive !== undefined) links[p.token].isActive = p.isActive;
      return { token: p.token };
    }
  },
}));

import { meAddressRoutes } from '../../../../routes/users/me-addresses';
import { getUserByUsername } from '../../../../routes/users/profile';

type Row = {
  id: string; userId: string; title: string; url: string; glyph: string; circle: string;
  position: number; isShown: boolean; trackingToken: string | null;
};
let rows: Row[] = [];
let seq = 0;

const adresse = (over: Partial<Row> = {}): Row => ({
  id: `ad${++seq}`, userId: OWNER, title: 'Site', url: 'https://aissandiaye.studio/', glyph: 'site',
  circle: 'PUBLIC', position: 0, isShown: true, trackingToken: null, ...over,
});

const prisma = () => ({
  user: {
    findFirst: jest.fn<any>(async (a?: any) => (a?.where?.blockedUserIds ? null : {
      id: OWNER, username: 'aissa', firstName: 'A', lastName: 'N', displayName: 'Aissa', avatar: null, banner: null,
      bio: '', role: 'USER', isOnline: false, lastActiveAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), voiceModel: null,
    })),
  },
  profileAddress: {
    findMany: jest.fn<any>(async (a: any) => rows
      .filter((r) => r.userId === a.where.userId && (a.where.isShown === undefined || r.isShown === a.where.isShown))
      .sort((x, y) => x.position - y.position)),
    findFirst: jest.fn<any>(async (a: any) => rows.find((r) => r.id === a.where.id && r.userId === a.where.userId) ?? null),
    count: jest.fn<any>(async (a: any) => rows.filter((r) => r.userId === a.where.userId).length),
    create: jest.fn<any>(async (a: any) => { const r = { ...adresse(), ...a.data }; rows.push(r); return r; }),
    update: jest.fn<any>(async (a: any) => { const r = rows.find((x) => x.id === a.where.id)!; Object.assign(r, a.data); return r; }),
    delete: jest.fn<any>(async (a: any) => { rows = rows.filter((r) => r.id !== a.where.id); return {}; }),
  },
  trackingLink: {
    findMany: jest.fn<any>(async (a: any) => (a.where.token.in as string[])
      .filter((token) => links[token]
        && (a.where.createdBy === undefined || links[token].createdBy === a.where.createdBy)
        && (a.where.isActive === undefined || links[token].isActive === a.where.isActive))
      .map((token) => ({ token, ...links[token] }))),
  },
  $transaction: jest.fn<any>(async (ops: Promise<unknown>[]) => Promise.all(ops)),
});

async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!viewerId) return reply.status(401).send({ success: false, error: 'Unauthorized' });
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } };
  });
  app.decorate('prisma', prisma() as never);
  await app.register(async (i) => { await meAddressRoutes(i); await getUserByUsername(i); }, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

beforeEach(() => {
  rows = []; created.length = 0; linkUpdates.length = 0; viewerId = OWNER; viewerLevel = 'PUBLIC'; relationReads = 0; tokenSeq = 0;
  links = { tokA: { createdBy: OWNER, isActive: true, totalClicks: 128 } };
});

const corps = (over: Record<string, unknown> = {}) => ({ url: 'youtube.com/@aissa.snd', title: 'Vidéos', glyph: 'videos', circle: 'FRIEND', ...over });
const post = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/v1/users/me/addresses', payload });

describe('création', () => {
  it('crée une adresse normalisée, en dernière position, avec son lien de suivi', async () => {
    const app = await monter();
    const res = await post(app, corps());
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data).toMatchObject({ title: 'Vidéos', url: 'https://youtube.com/@aissa.snd', glyph: 'videos', circle: 'FRIEND', position: 0, isShown: true, clicks: 0, trackedPath: '/l/tok1' });
    expect(created).toEqual([expect.objectContaining({ originalUrl: 'https://youtube.com/@aissa.snd', createdBy: OWNER })]);
    const second = await post(app, corps({ title: 'Photos' }));
    expect(second.json().data.position).toBe(1);
  });

  it('sans compteur de clics : aucun lien de suivi', async () => {
    const app = await monter();
    const res = await post(app, corps({ countClicks: false }));
    expect(res.statusCode).toBe(201);
    expect(created).toHaveLength(0);
    expect('trackedPath' in res.json().data).toBe(false);
  });

  it.each([
    ['schéma javascript', { url: 'javascript:alert(1)' }],
    ['adresse interne', { url: 'http://169.254.169.254/latest' }],
    ['localhost', { url: 'https://localhost:3000' }],
    ['titre vide', { title: '  ' }],
    ['titre trop long', { title: 'x'.repeat(25) }],
    ['glyphe inconnu', { glyph: 'skull' }],
    ['cercle Atome (réservé)', { circle: 'ATOM' }],
    ['cercle inconnu', { circle: 'EVERYONE' }],
    ['cercle absent', { circle: undefined }],
  ])('refuse : %s', async (_nom, over) => {
    const app = await monter();
    const res = await post(app, corps(over));
    expect(res.statusCode).toBe(400);
    expect(rows).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('refuse au-delà du plafond d’adresses', async () => {
    rows = Array.from({ length: 12 }, (_, i) => adresse({ position: i }));
    const app = await monter();
    const res = await post(app, corps());
    expect(res.statusCode).toBe(409);
  });

  it('refuse un lecteur sans compte', async () => {
    viewerId = null;
    const app = await monter();
    expect((await post(app, corps())).statusCode).toBe(401);
  });
});

describe('lecture, modification, ordre et suppression : toujours les siennes', () => {
  it('liste ses adresses dans l’ordre, avec cercle, affichage et clics', async () => {
    rows = [adresse({ id: 'b', position: 1, trackingToken: 'tokA', isShown: false }), adresse({ id: 'a', position: 0 }), adresse({ id: 'x', userId: OTHER })];
    const app = await monter();
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' });
    const data = res.json().data.addresses;
    expect(data.map((d: any) => d.id)).toEqual(['a', 'b']);
    expect(data[1]).toMatchObject({ circle: 'PUBLIC', isShown: false, clicks: 128, trackedPath: '/l/tokA' });
  });

  it('modifie le titre, le cercle et le glyphe', async () => {
    rows = [adresse({ id: 'a' })];
    const app = await monter();
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { title: 'Mon site', circle: 'BLOOD', glyph: 'shop' } });
    expect(res.statusCode).toBe(200);
    expect(rows[0]).toMatchObject({ title: 'Mon site', circle: 'BLOOD', glyph: 'shop' });
  });

  it('PATCH valide comme la création, et une URL modifiée suit sur le lien de suivi', async () => {
    rows = [adresse({ id: 'a', trackingToken: 'tokA' })];
    const app = await monter();
    const mauvais = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { url: 'http://10.0.0.1/' } });
    expect(mauvais.statusCode).toBe(400);
    const bon = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { url: 'https://example.org/x' } });
    expect(bon.statusCode).toBe(200);
    expect(linkUpdates).toContainEqual({ token: 'tokA', originalUrl: 'https://example.org/x' });
  });

  it('masquer désactive le lien de suivi (hors audience, rien n’est compté) ; réafficher le rouvre', async () => {
    rows = [adresse({ id: 'a', trackingToken: 'tokA' })];
    const app = await monter();
    await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { isShown: false } });
    expect(linkUpdates).toContainEqual({ token: 'tokA', isActive: false });
    await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { isShown: true } });
    expect(linkUpdates).toContainEqual({ token: 'tokA', isActive: true });
  });

  it('activer le compteur crée un lien ; le couper désactive et détache', async () => {
    rows = [adresse({ id: 'a' })];
    const app = await monter();
    const on = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { countClicks: true } });
    expect(on.json().data.trackedPath).toBe('/l/tok1');
    const off = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { countClicks: false } });
    expect('trackedPath' in off.json().data).toBe(false);
    expect(linkUpdates).toContainEqual({ token: 'tok1', isActive: false });
    expect(rows[0].trackingToken).toBeNull();
  });

  it('l’adresse d’un autre est introuvable (modification, suppression)', async () => {
    rows = [adresse({ id: 'x', userId: OTHER, trackingToken: 'tokA' })];
    const app = await monter();
    expect((await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/x', payload: { title: 'pris' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/users/me/addresses/x' })).statusCode).toBe(404);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Site');
    expect(linkUpdates).toHaveLength(0);
  });

  it('supprime la sienne et désactive son lien de suivi', async () => {
    rows = [adresse({ id: 'a', trackingToken: 'tokA' })];
    const app = await monter();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/me/addresses/a' });
    expect(res.statusCode).toBe(200);
    expect(rows).toHaveLength(0);
    expect(linkUpdates).toContainEqual({ token: 'tokA', isActive: false });
  });

  it('réordonne : la liste d’ids doit être exactement l’ensemble de ses adresses', async () => {
    rows = [adresse({ id: 'a', position: 0 }), adresse({ id: 'b', position: 1 }), adresse({ id: 'c', position: 2 })];
    const app = await monter();
    const ok = await app.inject({ method: 'PUT', url: '/api/v1/users/me/addresses/order', payload: { ids: ['c', 'a', 'b'] } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.addresses.map((d: any) => d.id)).toEqual(['c', 'a', 'b']);
    for (const ids of [['a', 'b'], ['a', 'b', 'c', 'd'], ['a', 'a', 'b'], ['a', 'b', 'zzz']]) {
      const ko = await app.inject({ method: 'PUT', url: '/api/v1/users/me/addresses/order', payload: { ids } });
      expect(ko.statusCode).toBe(400);
    }
  });
});

describe('la fiche sert chaque adresse au cercle choisi', () => {
  const fiche = async (app: FastifyInstance) => (await app.inject({ method: 'GET', url: '/api/v1/u/aissa' })).json().data;

  it.each([
    ['PUBLIC', ['pub']],
    ['COMMUNITY', ['pub']],
    ['FRIEND', ['pub', 'ami']],
    ['BLOOD', ['pub', 'ami', 'sang']],
  ])('lecteur de cercle %s lit %j', async (level, attendus) => {
    viewerId = OTHER; viewerLevel = level;
    rows = [
      adresse({ id: 'sang', position: 2, circle: 'BLOOD' }),
      adresse({ id: 'pub', position: 0, circle: 'PUBLIC' }),
      adresse({ id: 'ami', position: 1, circle: 'FRIEND' }),
    ];
    const data = await fiche(await monter());
    expect((data.addresses ?? []).map((a: any) => a.id)).toEqual(attendus);
  });

  it('une adresse masquée n’est servie à personne ; le public ne lit ni cercle, ni position, ni clics', async () => {
    viewerId = OTHER; viewerLevel = 'BLOOD';
    rows = [adresse({ id: 'cachee', isShown: false }), adresse({ id: 'v', trackingToken: 'tokA', circle: 'FRIEND' })];
    const data = await fiche(await monter());
    expect(data.addresses).toEqual([{ id: 'v', title: 'Site', url: 'https://aissandiaye.studio/', glyph: 'site', trackedPath: '/l/tokA' }]);
  });

  it('le propriétaire lit ses adresses affichées, avec leur cercle, sans lecture de relation', async () => {
    viewerId = OWNER;
    rows = [adresse({ id: 'sang', circle: 'BLOOD' })];
    const data = await fiche(await monter());
    expect(data.addresses).toEqual([expect.objectContaining({ id: 'sang', circle: 'BLOOD' })]);
    expect(relationReads).toBe(0);
  });

  it('un lecteur sans compte ne lit que le cercle public, sans lecture de relation', async () => {
    viewerId = null;
    rows = [adresse({ id: 'pub' }), adresse({ id: 'ami', circle: 'FRIEND' })];
    const app = await monter();
    const res = await app.inject({ method: 'GET', url: '/api/v1/u/aissa' });
    expect(relationReads).toBe(0);
    expect((res.json().data?.addresses ?? []).every((a: any) => a.id !== 'ami')).toBe(true);
  });

  it('toutes publiques : aucune lecture de relation', async () => {
    viewerId = OTHER;
    rows = [adresse({ id: 'pub' })];
    await fiche(await monter());
    expect(relationReads).toBe(0);
  });

  it('personne sans adresse : le champ est absent (ancien contrat intact)', async () => {
    viewerId = OTHER;
    const data = await fiche(await monter());
    expect('addresses' in data).toBe(false);
  });
});

describe('le lien de suivi d’une adresse ne sert que s’il est encore le sien et ouvert', () => {
  const fiche = async (app: FastifyInstance) => (await app.inject({ method: 'GET', url: '/api/v1/u/aissa' })).json().data;

  it('lien supprimé depuis « Mes liens » : l’adresse se modifie et se supprime encore, la fiche sert l’adresse directe', async () => {
    rows = [adresse({ id: 'a', trackingToken: 'perdu' }), adresse({ id: 'b', position: 1, trackingToken: 'perdu2' })];
    const app = await monter();
    viewerId = OTHER;
    expect((await fiche(app)).addresses.map((a: any) => a.trackedPath)).toEqual([undefined, undefined]);
    viewerId = OWNER;
    const liste = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect(liste.map((a: any) => a.trackedPath)).toEqual([undefined, undefined]);
    const masque = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { isShown: false, url: 'https://example.org/' } });
    expect(masque.statusCode).toBe(200);
    expect(rows.find((r) => r.id === 'a')?.trackingToken).toBeNull();
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/users/me/addresses/b' })).statusCode).toBe(200);
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('jeton repris par un AUTRE compte (lien renommé puis recréé) : ni servi, ni compté, ni touché', async () => {
    links.repris = { createdBy: OTHER, isActive: true, totalClicks: 999 };
    rows = [adresse({ id: 'a', trackingToken: 'repris' })];
    const app = await monter();
    viewerId = OTHER;
    expect((await fiche(app)).addresses).toEqual([expect.not.objectContaining({ trackedPath: expect.anything() })]);
    viewerId = OWNER;
    const [mienne] = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect(mienne).toMatchObject({ clicks: 0 });
    expect('trackedPath' in mienne).toBe(false);
    await app.inject({ method: 'PATCH', url: '/api/v1/users/me/addresses/a', payload: { isShown: false } });
    await app.inject({ method: 'DELETE', url: '/api/v1/users/me/addresses/a' });
    expect(linkUpdates).toHaveLength(0);
    expect(links.repris.isActive).toBe(true);
  });

  it('lien désactivé depuis « Mes liens » : le lecteur reçoit l’adresse directe, le propriétaire garde ses clics', async () => {
    links.tokA.isActive = false;
    rows = [adresse({ id: 'a', trackingToken: 'tokA' })];
    const app = await monter();
    viewerId = OTHER;
    expect((await fiche(app)).addresses).toEqual([{ id: 'a', title: 'Site', url: 'https://aissandiaye.studio/', glyph: 'site' }]);
    viewerId = OWNER;
    const [mienne] = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect(mienne).toMatchObject({ clicks: 128, trackedPath: '/l/tokA' });
  });
});
