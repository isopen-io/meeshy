/**
 * #11275 — L'ADMINISTRATION PUBLIE, RETIRE, DATE, CIBLE ET MODÈRE UN PACK PAR L'API, SANS DÉPLOIEMENT.
 *
 *   - `GET    /admin/packs/registry`                    le registre : base du dépôt, surcharge, entrée servie ;
 *   - `PUT    /admin/packs/registry/:domain/:slug`      surcharger (masqué, ordre, prix, fenêtre, ciblage), en compare-and-set ;
 *   - `DELETE /admin/packs/registry/:domain/:slug`      revenir au registre du dépôt.
 *
 * `canManageGame` (BIGBOSS, ADMIN) seulement, fail-closed ; chaque action est
 * JOURNALISÉE AVANT d'agir (journal indisponible ⇒ rien n'est écrit) ; les
 * packs du dépôt restent toujours chargés, une surcharge ne crée jamais un pack.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { buildPackIndex } from '../../../../services/packs/PackIndex';
import { PackRegistryOverrides, overlayPackIndex } from '../../../../services/packs/PackRegistryOverrides';
import { packsRegistryAdminRoutes } from '../../../../routes/admin/packs-registry';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logWarn: jest.fn() }));

const ADMIN = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-11-10T00:00:00Z');

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 1024, sha256: sha(seed) });
const wallpaper = (slug: string, over: Record<string, unknown> = {}) => ({
  slug, domain: 'wallpaper', origin: 'official', version: 1, order: 0, installedByDefault: false, removable: true, hidden: false,
  contractSchema: 1, cover: ref('a'), preview: null, contract: ref('c', 'json'), strings: { fr: ref('d', 'json') },
  downloadBytes: { story: 1000, square: null }, names: { fr: { name: `Fond ${slug}`, description: `Le fond ${slug}.` } }, ...over,
});

const baseIndex = () =>
  buildPackIndex({
    registries: [[wallpaper('dunes', { order: 1 }), wallpaper('savane', { order: 2, price: 50 }), wallpaper('essentiels', { origin: 'builtin', installedByDefault: true, removable: false, order: 3 })]],
    retained: [],
    contractItemKeys: () => ['fond'],
  });

type Row = Record<string, any>;

function fakeDb(options: { auditFails?: boolean } = {}) {
  const rows: Row[] = [];
  const audit: Row[] = [];
  const order: string[] = [];
  const unique = () => Object.assign(new Error('dup'), { code: 'P2002' });
  return {
    rows,
    audit,
    order,
    prisma: {
      packRegistryEntry: {
        findMany: jest.fn(async () => rows.map((row) => ({ ...row }))),
        findUnique: jest.fn(async ({ where }: any) => rows.find((row) => row.domain === where.domain_slug.domain && row.slug === where.domain_slug.slug) ?? null),
        create: jest.fn(async ({ data }: any) => {
          if (rows.some((row) => row.domain === data.domain && row.slug === data.slug)) throw unique();
          order.push('write');
          rows.push({ revision: 1, ...data });
          return data;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const hit = rows.filter((row) => row.domain === where.domain && row.slug === where.slug && row.revision === where.revision);
          hit.forEach((row) => Object.assign(row, data, { revision: row.revision + 1 }));
          if (hit.length > 0) order.push('write');
          return { count: hit.length };
        }),
        deleteMany: jest.fn(async ({ where }: any) => {
          const before = rows.length;
          rows.splice(0, rows.length, ...rows.filter((row) => !(row.domain === where.domain && row.slug === where.slug && row.revision === where.revision)));
          if (before !== rows.length) order.push('write');
          return { count: before - rows.length };
        }),
      },
      adminAuditLog: {
        create: jest.fn(async ({ data }: any) => {
          if (options.auditFails) throw new Error('audit down');
          order.push(`audit:${data.action}`);
          audit.push(data);
          return data;
        }),
      },
    },
  };
}

async function build(db: ReturnType<typeof fakeDb>, role: string | null = 'ADMIN'): Promise<{ app: FastifyInstance; overrides: PackRegistryOverrides; index: ReturnType<typeof baseIndex> }> {
  const index = baseIndex();
  const overrides = new PackRegistryOverrides({ prisma: db.prisma as never, now: () => NOW });
  const app = Fastify({ logger: false });
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    if (role === null) return;
    (request as any).authContext = { isAuthenticated: true, isAnonymous: false, userId: ADMIN, registeredUser: { id: ADMIN, role } };
  });
  await app.register(packsRegistryAdminRoutes, { index, overrides });
  await app.ready();
  return { app, overrides, index };
}

const put = (app: FastifyInstance, path: string, payload: object) => app.inject({ method: 'PUT', url: `/registry/${path}`, payload });
const served = (h: { overrides: PackRegistryOverrides; index: ReturnType<typeof baseIndex> }) => overlayPackIndex(h.index, () => h.overrides.snapshot()).entries('wallpaper');

describe('le rôle est requis (fail-closed)', () => {
  it.each(['USER', 'MODERATOR', 'AUDIT', 'ANALYST'])('%s est refusé (403) : ni journal ni écriture', async (role) => {
    const db = fakeDb();
    const { app } = await build(db, role);
    expect((await put(app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/registry' })).statusCode).toBe(403);
    expect(db.rows).toEqual([]);
    expect(db.audit).toEqual([]);
  });
});

describe('surcharger un pack sans déploiement', () => {
  it('retire un pack : journal AVANT l’écriture, surcharge écrite, pack masqué dans ce qui est servi', async () => {
    const db = fakeDb();
    const h = await build(db);

    const res = await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ domain: 'wallpaper', slug: 'dunes', revision: 1, override: { hidden: true }, effective: { hidden: true } });
    expect(db.order).toEqual(['audit:PACK_REGISTRY_UPDATE', 'write']);
    expect(db.audit[0]).toMatchObject({ adminId: ADMIN, entity: 'PackRegistryEntry', entityId: 'wallpaper.dunes' });
    expect(served(h).find((entry) => entry.slug === 'dunes')?.hidden).toBe(true);
  });

  it('date, cible, met à prix et réordonne ; le correctif suivant s’ajoute et `null` retire', async () => {
    const db = fakeDb();
    const h = await build(db);
    await put(h.app, 'wallpaper/savane', { expectedRevision: 0, price: 30, order: 0, availability: { endsAt: '2026-12-31T00:00:00.000Z' }, targeting: { countries: ['CM'] } });
    const res = await put(h.app, 'wallpaper/savane', { expectedRevision: 1, price: null });

    expect(res.statusCode).toBe(200);
    const entry = served(h).find((candidate) => candidate.slug === 'savane');
    expect(entry).toMatchObject({ order: 0, availability: { endsAt: '2026-12-31T00:00:00.000Z' }, targeting: { countries: ['CM'] } });
    expect(entry?.price).toBeUndefined();
    expect(served(h).map((candidate) => candidate.slug)).toEqual(['savane', 'dunes', 'essentiels']);
  });

  it('une révision périmée est refusée (409) et journalisée comme refus', async () => {
    const db = fakeDb();
    const h = await build(db);
    await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true });
    const stale = await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, hidden: false });
    expect(stale.statusCode).toBe(409);
    expect(db.rows[0]).toMatchObject({ revision: 1, override: { hidden: true } });
    expect(db.audit.map((line) => line.action)).toContain('PACK_REGISTRY_UPDATE_REFUSED');
  });

  it('une surcharge qui viole une loi du registre est refusée (422) : un prix sur un pack intégré', async () => {
    const db = fakeDb();
    const h = await build(db);
    const res = await put(h.app, 'wallpaper/essentiels', { expectedRevision: 0, price: 10 });
    expect(res.statusCode).toBe(422);
    expect(db.rows).toEqual([]);
  });

  it('une surcharge ne crée jamais un pack : un slug absent du dépôt rend 404', async () => {
    const db = fakeDb();
    const h = await build(db);
    expect((await put(h.app, 'wallpaper/inconnu', { expectedRevision: 0, hidden: true })).statusCode).toBe(404);
    expect((await put(h.app, 'pas-un-domaine/dunes', { expectedRevision: 0, hidden: true })).statusCode).toBe(404);
    expect(db.rows).toEqual([]);
  });

  it('un champ hors de la surcharge (identité, contenu, version) est refusé (400)', async () => {
    const db = fakeDb();
    const h = await build(db);
    expect((await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, version: 9 })).statusCode).toBe(400);
    expect(db.rows).toEqual([]);
  });

  it('journal indisponible : rien n’est écrit (500)', async () => {
    const db = fakeDb({ auditFails: true });
    const h = await build(db);
    const res = await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true });
    expect(res.statusCode).toBe(500);
    expect(db.rows).toEqual([]);
  });

  it('revenir au registre du dépôt efface la surcharge, journalisé', async () => {
    const db = fakeDb();
    const h = await build(db);
    await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true });
    const res = await h.app.inject({ method: 'DELETE', url: '/registry/wallpaper/dunes?expectedRevision=1' });
    expect(res.statusCode).toBe(200);
    expect(db.rows).toEqual([]);
    expect(db.audit.map((line) => line.action)).toEqual(['PACK_REGISTRY_UPDATE', 'PACK_REGISTRY_RESET']);
    expect(served(h).find((entry) => entry.slug === 'dunes')?.hidden).toBe(false);
  });
});

describe('les packs du dépôt restent toujours chargés', () => {
  it('sans surcharge, le registre servi est celui du dépôt', async () => {
    const db = fakeDb();
    const h = await build(db);
    expect(served(h)).toEqual(h.index.entries('wallpaper'));
  });

  it('une surcharge illisible en base est ignorée : le pack reste celui du dépôt', async () => {
    const db = fakeDb();
    db.rows.push({ domain: 'wallpaper', slug: 'dunes', override: { price: -4, hidden: 'oui' }, revision: 3 });
    const h = await build(db);
    await h.overrides.refresh();
    expect(served(h).find((entry) => entry.slug === 'dunes')).toEqual(h.index.entries('wallpaper').find((entry) => entry.slug === 'dunes'));
  });

  it('GET /registry dit, pour chaque pack, la base, la surcharge et l’entrée servie', async () => {
    const db = fakeDb();
    const h = await build(db);
    await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true });
    const list = (await h.app.inject({ method: 'GET', url: '/registry?domain=wallpaper' })).json().data as Row[];
    expect(list.map((entry) => entry.slug)).toEqual(['dunes', 'savane', 'essentiels']);
    expect(list[0]).toMatchObject({ base: { hidden: false }, override: { hidden: true }, effective: { hidden: true }, revision: 1 });
    expect(list[1]).toMatchObject({ override: null, revision: 0 });
  });
});

describe('la boutique suit une surcharge sans redémarrer', () => {
  it('un catalogue construit au démarrage cesse d’offrir un pack retiré, puis l’offre de nouveau quand il est republié', async () => {
    const { appearancePrisma } = await import('../appearance-packs.harness');
    const { PackCatalog } = await import('../../../../services/packs/PackCatalog');
    const { appearancePackSpec } = await import('../../../../services/packs/appearancePackSpec');
    const db = fakeDb();
    const h = await build(db);
    const shopDb = appearancePrisma();
    const catalog = new PackCatalog({ prisma: shopDb.prisma, spec: appearancePackSpec({ index: overlayPackIndex(h.index, () => h.overrides.snapshot()), domain: 'wallpaper' }) });
    const slugs = async () => (await catalog.catalogue(ADMIN)).map((pack) => pack.slug);

    expect(await slugs()).toContain('dunes');
    await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true });
    expect(await slugs()).not.toContain('dunes');
    await put(h.app, 'wallpaper/dunes', { expectedRevision: 1, hidden: false });
    expect(await slugs()).toContain('dunes');
  });
});

describe('revue adversariale (#11275)', () => {
  it('sans authentification : 401, ni journal ni écriture', async () => {
    const db = fakeDb();
    const { app } = await build(db, null);
    expect((await put(app, 'wallpaper/dunes', { expectedRevision: 0, hidden: true })).statusCode).toBe(401);
    expect(db.rows).toEqual([]);
    expect(db.audit).toEqual([]);
  });

  it('un pack GRATUIT au dépôt ne devient jamais payant par surcharge : ceux qui l’ont installé le perdraient (422)', async () => {
    const db = fakeDb();
    const h = await build(db);
    expect((await put(h.app, 'wallpaper/dunes', { expectedRevision: 0, price: 30 })).statusCode).toBe(422);
    expect(db.rows).toEqual([]);
  });

  it('une base injoignable n’est pas relue à chaque accès : la relecture suivante attend un délai', async () => {
    const db = fakeDb();
    const findMany = db.prisma.packRegistryEntry.findMany as jest.Mock<any>;
    findMany.mockRejectedValue(new Error('db down'));
    const overrides = new PackRegistryOverrides({ prisma: db.prisma as never, now: () => NOW });
    await expect(overrides.refresh()).rejects.toThrow('db down');
    overrides.snapshot();
    overrides.snapshot();
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
