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
const A = '65a0000000000000000000a1';
const B = '65a0000000000000000000b2';
const C = '65a0000000000000000000c3';
const X = '65a0000000000000000000f9';
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

const created: Array<{ originalUrl: string; createdBy?: string; name?: string; addressId?: string }> = [];
const linkUpdates: Array<{ token: string; isActive?: boolean; originalUrl?: string; name?: string }> = [];
let tokenSeq = 0;
type Link = { createdBy: string; isActive: boolean; totalClicks: number; originalUrl: string; expiresAt?: Date | null; addressId?: string; name?: string };
let links: Record<string, Link> = {};
jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: () => 'https://meeshy.me',
  TrackingLinkService: class {
    async createTrackingLink(p: { originalUrl: string; createdBy?: string; name?: string; addressId?: string }) {
      created.push(p);
      tokenSeq += 1;
      links[`tok${tokenSeq}`] = { createdBy: p.createdBy ?? '', isActive: true, totalClicks: 0, originalUrl: p.originalUrl, addressId: p.addressId, name: p.name };
      return { id: `tl${tokenSeq}`, token: `tok${tokenSeq}`, totalClicks: 0 };
    }
    async updateTrackingLink(p: { token: string; isActive?: boolean; originalUrl?: string; name?: string }) {
      if (!links[p.token]) throw new Error('Tracking link not found');
      linkUpdates.push(p);
      if (p.isActive !== undefined) links[p.token].isActive = p.isActive;
      if (p.originalUrl !== undefined) links[p.token].originalUrl = p.originalUrl;
      if (p.name !== undefined) links[p.token].name = p.name;
      return { token: p.token };
    }
  },
}));

import { meAddressRoutes } from '../../../../routes/users/me-addresses';
import { getUserByUsername } from '../../../../routes/users/profile';
import { eraseProfileAddressesOf } from '../../../../services/profile-addresses/address-links';

type Row = {
  id: string; userId: string; title: string; url: string; glyph: string; circle: string;
  position: number; isShown: boolean; trackingToken: string | null;
};
let rows: Row[] = [];
let seq = 0;
let addressReads = 0;
let onCreate: (() => void) | null = null;
type Click = { id: string; trackingLinkId: string; ipAddress: string };
let clicks: Click[] = [];
const idOf = (token: string) => `id-${token}`;
const tokenMatches = (token: string, where: any): boolean =>
  (where.id?.in === undefined || (where.id.in as string[]).includes(idOf(token)))
  && (where.token?.in === undefined || (where.token.in as string[]).includes(token))
  && (where.createdBy === undefined || links[token].createdBy === where.createdBy)
  && (where.addressId?.isSet === undefined || (links[token].addressId != null) === where.addressId.isSet);

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
    findMany: jest.fn<any>(async (a: any) => {
      const mine = rows.filter((r) => r.userId === a.where.userId && (a.where.isShown === undefined || r.isShown === a.where.isShown));
      const byCreation = JSON.stringify(a.orderBy ?? {}).includes('createdAt');
      const ordered = byCreation ? mine : [...mine].sort((x, y) => x.position - y.position);
      return ordered.slice(0, a.take ?? Infinity);
    }),
    findFirst: jest.fn<any>(async (a: any) => { addressReads += 1; return rows.find((r) => r.id === a.where.id && r.userId === a.where.userId) ?? null; }),
    count: jest.fn<any>(async (a: any) => rows.filter((r) => r.userId === a.where.userId).length),
    create: jest.fn<any>(async (a: any) => {
      const r = { ...adresse(), id: `65a00000000000000000${String(++seq).padStart(4, '0')}`, ...a.data };
      rows.push(r);
      onCreate?.();
      return r;
    }),
    update: jest.fn<any>(async (a: any) => { const r = rows.find((x) => x.id === a.where.id)!; Object.assign(r, a.data); return r; }),
    delete: jest.fn<any>(async (a: any) => { rows = rows.filter((r) => r.id !== a.where.id); return {}; }),
    deleteMany: jest.fn<any>(async (a: any) => {
      const before = rows.length;
      rows = rows.filter((r) => r.userId !== a.where.userId);
      return { count: before - rows.length };
    }),
  },
  trackingLink: {
    findMany: jest.fn<any>(async (a: any) => Object.keys(links)
      .filter((token) => tokenMatches(token, a.where)
        && (a.where.isActive === undefined || links[token].isActive === a.where.isActive))
      .map((token) => ({ id: idOf(token), token, ...links[token] }))),
    deleteMany: jest.fn<any>(async (a: any) => {
      const gone = Object.keys(links).filter((token) => tokenMatches(token, a.where));
      links = Object.fromEntries(Object.entries(links).filter(([token]) => !gone.includes(token)));
      return { count: gone.length };
    }),
  },
  trackingLinkClick: {
    deleteMany: jest.fn<any>(async (a: any) => {
      const before = clicks.length;
      clicks = clicks.filter((click) => !(a.where.trackingLinkId.in as string[]).includes(click.trackingLinkId));
      return { count: before - clicks.length };
    }),
  },
  $transaction: jest.fn<any>(async (ops: Promise<unknown>[]) => Promise.all(ops)),
});

let base: ReturnType<typeof prisma>;

async function monter(): Promise<FastifyInstance> {
  base = prisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!viewerId) return reply.status(401).send({ success: false, error: 'Unauthorized' });
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } };
  });
  app.decorate('prisma', base as never);
  await app.register(async (i) => { await meAddressRoutes(i); await getUserByUsername(i); }, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

beforeEach(() => {
  rows = []; clicks = []; created.length = 0; linkUpdates.length = 0; viewerId = OWNER; viewerLevel = 'PUBLIC'; relationReads = 0; tokenSeq = 0;
  addressReads = 0; onCreate = null;
  links = { tokA: { createdBy: OWNER, isActive: true, totalClicks: 128, originalUrl: 'https://aissandiaye.studio/', addressId: A } };
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
    links.tokA.addressId = B;
    rows = [adresse({ id: B, position: 1, trackingToken: 'tokA', isShown: false }), adresse({ id: A, position: 0 }), adresse({ id: X, userId: OTHER })];
    const app = await monter();
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' });
    const data = res.json().data.addresses;
    expect(data.map((d: any) => d.id)).toEqual([A, B]);
    expect(data[1]).toMatchObject({ circle: 'PUBLIC', isShown: false, clicks: 128, trackedPath: '/l/tokA' });
  });

  it('modifie le titre, le cercle et le glyphe', async () => {
    rows = [adresse({ id: A })];
    const app = await monter();
    const res = await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { title: 'Mon site', circle: 'BLOOD', glyph: 'shop' } });
    expect(res.statusCode).toBe(200);
    expect(rows[0]).toMatchObject({ title: 'Mon site', circle: 'BLOOD', glyph: 'shop' });
  });

  it('PATCH valide comme la création', async () => {
    rows = [adresse({ id: A, trackingToken: 'tokA' })];
    const app = await monter();
    const mauvais = await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { url: 'http://10.0.0.1/' } });
    expect(mauvais.statusCode).toBe(400);
    expect(links.tokA).toMatchObject({ originalUrl: 'https://aissandiaye.studio/' });
  });

  it('masquer désactive le lien de suivi (hors audience, rien n’est compté) ; réafficher le rouvre', async () => {
    rows = [adresse({ id: A, trackingToken: 'tokA' })];
    const app = await monter();
    await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { isShown: false } });
    expect(linkUpdates).toContainEqual({ token: 'tokA', isActive: false });
    await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { isShown: true } });
    expect(linkUpdates).toContainEqual({ token: 'tokA', isActive: true });
  });

  it('activer le compteur crée un lien ; le couper l’efface et détache', async () => {
    rows = [adresse({ id: A })];
    const app = await monter();
    const on = await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { countClicks: true } });
    expect(on.json().data.trackedPath).toBe('/l/tok1');
    const off = await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { countClicks: false } });
    expect('trackedPath' in off.json().data).toBe(false);
    expect(links.tok1).toBeUndefined();
    expect(rows[0].trackingToken).toBeNull();
  });

  it('l’adresse d’un autre est introuvable (modification, suppression)', async () => {
    rows = [adresse({ id: X, userId: OTHER, trackingToken: 'tokA' })];
    const app = await monter();
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${X}`, payload: { title: 'pris' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${X}` })).statusCode).toBe(404);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Site');
    expect(linkUpdates).toHaveLength(0);
  });

  it('supprime la sienne et efface son lien de suivi', async () => {
    rows = [adresse({ id: A, trackingToken: 'tokA' })];
    const app = await monter();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${A}` });
    expect(res.statusCode).toBe(200);
    expect(rows).toHaveLength(0);
    expect(links.tokA).toBeUndefined();
  });

  it('réordonne : la liste d’ids doit être exactement l’ensemble de ses adresses', async () => {
    rows = [adresse({ id: A, position: 0 }), adresse({ id: B, position: 1 }), adresse({ id: C, position: 2 })];
    const app = await monter();
    const ok = await app.inject({ method: 'PUT', url: '/api/v1/users/me/addresses/order', payload: { ids: [C, A, B] } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.addresses.map((d: any) => d.id)).toEqual([C, A, B]);
    for (const ids of [[A, B], [A, B, C, 'd'], [A, A, B], [A, B, 'zzz']]) {
      const ko = await app.inject({ method: 'PUT', url: '/api/v1/users/me/addresses/order', payload: { ids } });
      expect(ko.statusCode).toBe(400);
    }
  });
});

describe('une adresse possède SON lien de suivi, qui tourne quand l’adresse change de portée', () => {
  const patch = (app: FastifyInstance, payload: Record<string, unknown>) =>
    app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload });
  const avecClics = () => {
    rows = [adresse({ id: A, trackingToken: 'tokA', circle: 'FRIEND' })];
    clicks = [{ id: 'k1', trackingLinkId: idOf('tokA'), ipAddress: '203.0.113.7' }];
  };

  it('le lien créé est marqué comme celui de CETTE adresse, et porte son titre', async () => {
    const app = await monter();
    const res = await post(app, corps({ title: 'Vidéos' }));
    expect(created).toEqual([expect.objectContaining({ addressId: res.json().data.id, name: 'Vidéos', createdBy: OWNER })]);
  });

  it('URL changée : l’ancien jeton et ses clics sont effacés, un nouveau jeton sert l’adresse', async () => {
    avecClics();
    const app = await monter();
    const res = await patch(app, { url: 'https://example.org/x' });
    expect(res.statusCode).toBe(200);
    expect(links.tokA).toBeUndefined();
    expect(clicks).toEqual([]);
    expect(links.tok1).toMatchObject({ originalUrl: 'https://example.org/x', addressId: A, isActive: true });
    expect(res.json().data).toMatchObject({ trackedPath: '/l/tok1', clicks: 0 });
    expect(rows[0].trackingToken).toBe('tok1');
  });

  it('cercle resserré (Ami → Proche) : le jeton tourne, l’ancien et ses clics partent', async () => {
    avecClics();
    const app = await monter();
    const res = await patch(app, { circle: 'CLOSE' });
    expect(res.statusCode).toBe(200);
    expect(links.tokA).toBeUndefined();
    expect(clicks).toEqual([]);
    expect(res.json().data).toMatchObject({ circle: 'CLOSE', trackedPath: '/l/tok1' });
  });

  it('cercle élargi (Ami → Connaissance) : le même jeton reste, avec ses clics', async () => {
    avecClics();
    const app = await monter();
    const res = await patch(app, { circle: 'ACQUAINTANCE' });
    expect(res.json().data).toMatchObject({ circle: 'ACQUAINTANCE', trackedPath: '/l/tokA', clicks: 128 });
    expect(created).toHaveLength(0);
    expect(clicks).toHaveLength(1);
  });

  it('cercle resserré sur une adresse masquée : le nouveau lien naît fermé', async () => {
    rows = [adresse({ id: A, trackingToken: 'tokA', circle: 'FRIEND', isShown: false })];
    links.tokA.isActive = false;
    const app = await monter();
    await patch(app, { circle: 'BLOOD' });
    expect(links.tok1).toMatchObject({ isActive: false, addressId: A });
  });

  it('le titre du lien suit le titre de l’adresse', async () => {
    rows = [adresse({ id: A, trackingToken: 'tokA', circle: 'FRIEND' })];
    const app = await monter();
    await patch(app, { title: 'Mon studio' });
    expect(links.tokA).toMatchObject({ name: 'Mon studio' });
  });

  it('un lien de l’auteur qui n’est pas marqué pour cette adresse (post, « Mes liens », autre adresse) n’est ni servi, ni modifié, ni effacé', async () => {
    links.post = { createdBy: OWNER, isActive: true, totalClicks: 5, originalUrl: 'https://aissandiaye.studio/' };
    links.autre = { createdBy: OWNER, isActive: true, totalClicks: 7, originalUrl: 'https://aissandiaye.studio/', addressId: B };
    rows = [adresse({ id: A, trackingToken: 'post', circle: 'FRIEND' }), adresse({ id: C, position: 1, trackingToken: 'autre' })];
    const app = await monter();
    const [a, c] = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect([a.clicks, c.clicks]).toEqual([0, 0]);
    expect('trackedPath' in a || 'trackedPath' in c).toBe(false);
    await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${C}` });
    expect(links.autre).toMatchObject({ addressId: B, totalClicks: 7 });
    await patch(app, { isShown: false, title: 'Autre titre', url: 'https://example.org/' });
    await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${A}` });
    expect(links.post).toMatchObject({ isActive: true, originalUrl: 'https://aissandiaye.studio/', totalClicks: 5 });
    expect(links.post.name).toBeUndefined();
    expect(linkUpdates.filter((u) => u.token === 'post')).toEqual([]);
  });
});

describe('identifiant d’adresse illisible', () => {
  it.each(['PATCH', 'DELETE'] as const)('%s sur un identifiant qui n’est pas un ObjectId : 404, sans aucune lecture', async (method) => {
    const app = await monter();
    const res = await app.inject({ method, url: '/api/v1/users/me/addresses/pas-un-id', ...(method === 'PATCH' ? { payload: { title: 'x' } } : {}) });
    expect(res.statusCode).toBe(404);
    expect(addressReads).toBe(0);
  });
});

describe('le plafond de douze adresses tient sous la concurrence', () => {
  it('une création concurrente qui fait passer le compte au-delà : la dernière est annulée, sans lien laissé', async () => {
    rows = Array.from({ length: 11 }, (_, i) => adresse({ position: i }));
    const app = await monter();
    onCreate = () => { onCreate = null; rows.splice(rows.length - 1, 0, adresse({ position: 99 })); };
    const res = await post(app, corps());
    expect(res.statusCode).toBe(409);
    expect(rows).toHaveLength(12);
    expect(Object.keys(links)).toEqual(['tokA']);
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
    rows = [adresse({ id: 'cachee', isShown: false }), adresse({ id: A, trackingToken: 'tokA', circle: 'FRIEND' })];
    const data = await fiche(await monter());
    expect(data.addresses).toEqual([{ id: A, title: 'Site', url: 'https://aissandiaye.studio/', glyph: 'site', trackedPath: '/l/tokA' }]);
  });

  it('le propriétaire lit ses adresses affichées, avec leur cercle, sans lecture de relation', async () => {
    viewerId = OWNER;
    rows = [adresse({ id: 'sang', circle: 'BLOOD' })];
    const data = await fiche(await monter());
    expect(data.addresses).toEqual([expect.objectContaining({ id: 'sang', circle: 'BLOOD' })]);
    expect(relationReads).toBe(0);
  });

  it('un lecteur sans compte ne reçoit aucune adresse : la fiche demande un compte', async () => {
    viewerId = null;
    rows = [adresse({ id: 'pub' }), adresse({ id: 'ami', circle: 'FRIEND' })];
    const app = await monter();
    const res = await app.inject({ method: 'GET', url: '/api/v1/u/aissa' });
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('aissandiaye.studio');
    expect(relationReads).toBe(0);
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
    rows = [adresse({ id: A, trackingToken: 'perdu' }), adresse({ id: B, position: 1, trackingToken: 'perdu2' })];
    const app = await monter();
    viewerId = OTHER;
    expect((await fiche(app)).addresses.map((a: any) => a.trackedPath)).toEqual([undefined, undefined]);
    viewerId = OWNER;
    const liste = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect(liste.map((a: any) => a.trackedPath)).toEqual([undefined, undefined]);
    const masque = await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { isShown: false, url: 'https://example.org/' } });
    expect(masque.statusCode).toBe(200);
    expect(rows.find((r) => r.id === A)?.trackingToken).toBeNull();
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${B}` })).statusCode).toBe(200);
    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it('jeton repris par un AUTRE compte (lien renommé puis recréé) : ni servi, ni compté, ni touché', async () => {
    links.repris = { createdBy: OTHER, isActive: true, totalClicks: 999, originalUrl: 'https://aissandiaye.studio/' };
    rows = [adresse({ id: A, trackingToken: 'repris' })];
    const app = await monter();
    viewerId = OTHER;
    expect((await fiche(app)).addresses).toEqual([expect.not.objectContaining({ trackedPath: expect.anything() })]);
    viewerId = OWNER;
    const [mienne] = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect(mienne).toMatchObject({ clicks: 0 });
    expect('trackedPath' in mienne).toBe(false);
    await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { isShown: false } });
    await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${A}` });
    expect(linkUpdates).toHaveLength(0);
    expect(links.repris.isActive).toBe(true);
  });

  it('lien désactivé depuis « Mes liens » : le lecteur reçoit l’adresse directe, le propriétaire garde ses clics', async () => {
    links.tokA.isActive = false;
    rows = [adresse({ id: A, trackingToken: 'tokA' })];
    const app = await monter();
    viewerId = OTHER;
    expect((await fiche(app)).addresses).toEqual([{ id: A, title: 'Site', url: 'https://aissandiaye.studio/', glyph: 'site' }]);
    viewerId = OWNER;
    const [mienne] = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect(mienne).toMatchObject({ clicks: 128, trackedPath: '/l/tokA' });
  });

  it('destination changée depuis « Mes liens » : le lien ne sert plus, ni au lecteur ni au propriétaire, et la prochaine modification la réaligne', async () => {
    links.tokA.originalUrl = 'http://192.168.1.1/admin';
    rows = [adresse({ id: A, trackingToken: 'tokA', url: 'https://ma-banque.fr/' })];
    const app = await monter();
    viewerId = OTHER;
    expect((await fiche(app)).addresses).toEqual([{ id: A, title: 'Site', url: 'https://ma-banque.fr/', glyph: 'site' }]);
    viewerId = OWNER;
    const [mienne] = (await app.inject({ method: 'GET', url: '/api/v1/users/me/addresses' })).json().data.addresses;
    expect(mienne).toMatchObject({ clicks: 128 });
    expect('trackedPath' in mienne).toBe(false);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${A}`, payload: { title: 'Banque' } })).statusCode).toBe(200);
    expect(links.tokA).toBeUndefined();
    expect(links.tok1).toMatchObject({ originalUrl: 'https://ma-banque.fr/', addressId: A, name: 'Banque' });
    viewerId = OTHER;
    expect((await fiche(app)).addresses).toEqual([expect.objectContaining({ id: A, trackedPath: '/l/tok1' })]);
  });
});

describe('une adresse retirée n’emporte aucune copie au-delà de la purge du compte', () => {
  const URL_PRIVEE = 'https://ma-banque.fr/';
  const porteLAdresse = () => Object.values(links).filter((link) => link.originalUrl === URL_PRIVEE);

  it('adresse supprimée, puis purge : aucun TrackingLink ne porte son URL, aucun clic de ses lecteurs ne reste', async () => {
    const app = await monter();
    const cree = await post(app, corps({ url: URL_PRIVEE, title: 'Banque' }));
    const token = cree.json().data.trackedPath.slice('/l/'.length);
    clicks = [{ id: 'k1', trackingLinkId: idOf(token), ipAddress: '203.0.113.7' }];
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${cree.json().data.id}` })).statusCode).toBe(200);

    await eraseProfileAddressesOf(base as never, OWNER);

    expect(porteLAdresse()).toEqual([]);
    expect(clicks).toEqual([]);
  });

  it('suivi coupé, puis purge : le lien détaché ne garde ni l’URL, ni le titre, ni les clics', async () => {
    const app = await monter();
    const cree = await post(app, corps({ url: URL_PRIVEE, title: 'Banque' }));
    const token = cree.json().data.trackedPath.slice('/l/'.length);
    clicks = [{ id: 'k1', trackingLinkId: idOf(token), ipAddress: '203.0.113.7' }];
    const off = await app.inject({ method: 'PATCH', url: `/api/v1/users/me/addresses/${cree.json().data.id}`, payload: { countClicks: false } });
    expect(off.statusCode).toBe(200);

    await eraseProfileAddressesOf(base as never, OWNER);

    expect(porteLAdresse()).toEqual([]);
    expect(clicks).toEqual([]);
  });

  it('ne supprime ni le lien d’un autre compte, ni ses autres liens, ni leurs clics', async () => {
    links.repris = { createdBy: OTHER, isActive: true, totalClicks: 9, originalUrl: URL_PRIVEE };
    links.message = { createdBy: OWNER, isActive: true, totalClicks: 3, originalUrl: 'https://lien-de-message.example/' };
    clicks = [{ id: 'k2', trackingLinkId: idOf('repris'), ipAddress: '192.0.2.1' }, { id: 'k3', trackingLinkId: idOf('message'), ipAddress: '192.0.2.2' }];
    rows = [adresse({ id: A, trackingToken: 'repris' }), adresse({ id: B, trackingToken: 'tokA' })];
    const app = await monter();
    await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${A}` });
    await app.inject({ method: 'DELETE', url: `/api/v1/users/me/addresses/${B}` });
    expect(Object.keys(links).sort()).toEqual(['message', 'repris']);
    expect(clicks.map((click) => click.id)).toEqual(['k2', 'k3']);
  });
});
