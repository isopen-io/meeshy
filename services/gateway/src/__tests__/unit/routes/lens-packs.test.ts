/**
 * #11271 — UN PACK DE LENS SE PROPOSE, SE MODÈRE ET S'INSTALLE PAR LE MOTEUR DE PACKS.
 *
 *   - `POST /packs/lens/submissions` : le document MeeshyLens v1 et ses fichiers ;
 *     le coût est MESURÉ, les fichiers sont exactement ceux que les couches nomment,
 *     ré-encodés et renommés par leur empreinte ; la lens naît `pending` ;
 *   - `GET /packs/lens/pending`, `POST /packs/lens/:slug/review` : sous
 *     `canModerateContent`, fail-closed ; la revue FIXE la fenêtre et les
 *     communautés, jamais un prix (une lens est gratuite) ; un modérateur ne
 *     tranche pas sa propre proposition ;
 *   - la boutique (`GET /packs/lens`) n'offre une lens publiée que dans sa fenêtre
 *     et à ses communautés ; l'installation passe par `PackCatalog`.
 *
 * Points « ATTEND » de #11251 laissés absents : ni rémunération, ni crédit en E2EE,
 * ni géo-créneau (la revue retire `window.geo` du document servi).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { lensPacksRoutes } from '../../../routes/packs-lens';
import { LensPacks } from '../../../services/packs/LensPacks';
import { matches, type Row } from './sticker-packs.harness';
import { appearancePrisma } from './appearance-packs.harness';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';
const MODO = '68b0000000000000000000c3';
const COMMUNITY = '64b7f0c2a1b2c3d4e5f60718';

const VECTORS = JSON.parse(readFileSync(join(__dirname, '../../../../../../packages/shared/fixtures/lens-v1/vectors.json'), 'utf8')) as { vectors: { input: Record<string, unknown> }[] };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const lensDocument = (over: Record<string, unknown> = {}) => ({
  ...VECTORS.vectors[0]!.input,
  window: { startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', geo: { countries: ['FR'] } },
  ...over,
});

const assetsOf = (srcs: readonly string[]) => Object.fromEntries(srcs.map((src) => [src, Buffer.concat([PNG, Buffer.from(src)]).toString('base64')]));
const ALL_ASSETS = ['aaaaaaaaaaaaaaaa.png', 'bbbbbbbbbbbbbbbb.png', 'cccccccccccccccc.png'];

function lensTables() {
  const packs: Row[] = [];
  const assets: Row[] = [];
  const audit: Row[] = [];
  const auditState = { down: false };
  let seq = 0;
  const nextId = () => `68d00000000000000000${String((seq += 1)).padStart(4, '0')}`;
  const pick = (row: Row | undefined, select?: Record<string, boolean>) =>
    row === undefined ? null : select === undefined ? { ...row } : Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
  const unique = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  return {
    packs,
    assets,
    audit,
    auditState,
    adminAuditLog: {
      create: jest.fn(async ({ data }: any) => {
        if (auditState.down) throw new Error('audit store unavailable');
        audit.push({ ...data, statusAtWrite: packs.find((row) => row.slug === data.entityId)?.status ?? null });
        return data;
      }),
    },
    lensPack: {
      findUnique: jest.fn(async ({ where, select }: any) => pick(packs.find((row) => row.slug === where.slug), select)),
      findFirst: jest.fn(async ({ where, select }: any) => pick(packs.find((row) => matches(row, where)), select)),
      findMany: jest.fn(async ({ where, select }: any) => packs.filter((row) => matches(row, where ?? {})).map((row) => pick(row, select))),
      count: jest.fn(async ({ where }: any) => packs.filter((row) => matches(row, where)).length),
      create: jest.fn(async ({ data, select }: any) => {
        if (packs.some((row) => row.slug === data.slug)) throw unique();
        const row = { reviewNote: null, reviewerId: null, reviewedAt: null, installCount: 0, createdAt: new Date(), ...data, id: nextId() } as Row;
        packs.push(row);
        return pick(row, select);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = packs.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      }),
      update: jest.fn(async ({ where, data, select }: any) => {
        const row = packs.find((candidate) => candidate.id === where.id)!;
        const next = typeof data.installCount === 'object' ? { ...data, installCount: (row.installCount as number) + data.installCount.increment } : data;
        Object.assign(row, next);
        return pick(row, select);
      }),
      delete: jest.fn(async ({ where }: any) => packs.splice(packs.findIndex((row) => row.id === where.id), 1)[0]),
    },
    lensPackAsset: {
      createMany: jest.fn(async ({ data }: any) => {
        data.forEach((row: Row) => assets.push({ ...row, id: nextId() }));
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where, select }: any) => assets.filter((row) => matches(row, where)).map((row) => pick(row, select))),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = assets.length;
        assets.splice(0, assets.length, ...assets.filter((row) => !matches(row, where)));
        return { count: before - assets.length };
      }),
    },
  };
}

type Harness = { app: FastifyInstance; tables: ReturnType<typeof lensTables>; normalizedAs: { assets: string[]; luts: string[] }; packs: LensPacks };

async function harness(options: { now?: string; communities?: readonly string[] } = {}): Promise<Harness> {
  const db = appearancePrisma();
  const tables = lensTables();
  const prisma = Object.assign(Object.create(db.prisma as object) as PrismaClient, {
    lensPack: tables.lensPack,
    lensPackAsset: tables.lensPackAsset,
    adminAuditLog: tables.adminAuditLog,
  });
  const now = () => new Date(options.now ?? '2026-11-10T00:00:00Z');
  const normalizedAs = { assets: [] as string[], luts: [] as string[] };
  const image = (bytes: Buffer) => ({ ok: true as const, image: { bytes, mimeType: 'image/png' as const, width: 64, height: 64, animated: false } });
  const packs = new LensPacks({
    prisma,
    now,
    normalizeAsset: async (bytes) => {
      normalizedAs.assets.push(bytes.subarray(PNG.length).toString());
      return image(bytes);
    },
    normalizeLut: async (bytes) => {
      normalizedAs.luts.push(bytes.subarray(PNG.length).toString());
      return image(bytes);
    },
  });
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (request: any) => {
    const userId = String(request.headers['x-user'] ?? ALICE);
    const role = userId === MODO ? 'MODERATOR' : 'USER';
    request.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId, role } };
  });
  await app.register(lensPacksRoutes, {
    packs,
    now,
    audience: async () => ({ communityIds: new Set(options.communities ?? []), country: 'FR', languages: ['fr'] }),
  });
  await app.ready();
  return { app, tables, normalizedAs, packs };
}

const submit = (h: Harness, body: object, user = ALICE) => h.app.inject({ method: 'POST', url: '/submissions', headers: { 'x-user': user }, payload: body });
const review = (h: Harness, slug: string, body: object, user = MODO) => h.app.inject({ method: 'POST', url: `/${slug}/review`, headers: { 'x-user': user }, payload: body });

describe('proposer une lens (#11271)', () => {
  it('une lens complète naît en attente ; ses fichiers sont renommés par l’empreinte de leurs octets', async () => {
    const h = await harness();
    const res = await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ slug: 'aurore-polaire', domain: 'lens', origin: 'community', status: 'pending', cost: 'standard', price: null });
    const [row] = h.tables.packs;
    const stored = JSON.parse(row!.documentJson as string);
    const expected = createHash('sha256').update(Buffer.concat([PNG, Buffer.from('aaaaaaaaaaaaaaaa.png')])).digest('hex').slice(0, 16);
    expect(stored.layers[0].asset).toBe(`${expected}.png`);
    expect(h.tables.assets.map((asset) => asset.src)).toContain(`${expected}.png`);
    expect(row!.documentSha256).toBe(createHash('sha256').update(row!.documentJson as string, 'utf8').digest('hex'));
  });

  it('un coût déclaré inférieur au coût mesuré est refusé (422)', async () => {
    const h = await harness();
    const res = await submit(h, { document: lensDocument({ cost: 'light' }), assets: assetsOf(ALL_ASSETS) });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'LENS_COST_UNDERSTATED', measured: 'standard' });
    expect(h.tables.packs).toEqual([]);
  });

  it('un document interdit (shader, URL) ou illisible est refusé ; un schéma plus récent demande une mise à jour', async () => {
    const h = await harness();
    expect((await submit(h, { document: lensDocument({ shader: 'x' }), assets: {} })).json()).toMatchObject({ code: 'LENS_FORBIDDEN' });
    expect((await submit(h, { document: { schema: 1 }, assets: {} })).json()).toMatchObject({ code: 'LENS_INVALID' });
    expect((await submit(h, { document: { schema: 2 }, assets: {} })).json()).toMatchObject({ code: 'LENS_UPDATE_REQUIRED', requiredSchema: 2 });
  });

  it('un fichier manquant, en trop ou trop lourd est refusé', async () => {
    const h = await harness();
    expect((await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS.slice(1)) })).json()).toMatchObject({ code: 'LENS_ASSET_REFUSED', reason: 'missing' });
    expect((await submit(h, { document: lensDocument(), assets: assetsOf([...ALL_ASSETS, 'dddddddddddddddd.png']) })).json()).toMatchObject({ code: 'LENS_ASSET_REFUSED', reason: 'unused' });
    const heavy = { ...assetsOf(ALL_ASSETS), 'aaaaaaaaaaaaaaaa.png': Buffer.alloc(600_000, 1).toString('base64') };
    expect((await submit(h, { document: lensDocument(), assets: heavy })).json()).toMatchObject({ code: 'LENS_ASSET_REFUSED', reason: 'too-large' });
  });

  it('un slug pris par une autre personne est refusé (409)', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) });
    expect((await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB)).statusCode).toBe(409);
  });
});

describe('modérer une lens (#11271)', () => {
  it('la file et la revue sont fermées à qui ne modère pas (403), et rien ne bouge', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) });
    expect((await h.app.inject({ method: 'GET', url: '/pending', headers: { 'x-user': BOB } })).statusCode).toBe(403);
    expect((await review(h, 'aurore-polaire', { decision: 'approve' }, BOB)).statusCode).toBe(403);
    expect(h.tables.packs[0]!.status).toBe('pending');
  });

  it('la revue FIXE la fenêtre et les communautés, retire le géo-créneau, et ne pose aucun prix', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) });
    const window = { startsAt: '2026-11-05T00:00:00Z', endsAt: '2026-11-20T00:00:00Z' };

    const res = await review(h, 'aurore-polaire', { decision: 'approve', window, communities: [COMMUNITY], price: 40 });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'approved', price: null, availability: window });
    const row = h.tables.packs[0]!;
    expect(row.communities).toEqual([COMMUNITY]);
    const served = JSON.parse(row.documentJson as string);
    expect(served.window).toEqual(window);
    expect(row.documentJson).not.toContain(COMMUNITY);
    expect(row.documentSrc).toBe(`${createHash('sha256').update(row.documentJson as string, 'utf8').digest('hex').slice(0, 16)}.json`);
  });

  it('une fenêtre qui finit avant de commencer est refusée (400)', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) });
    const res = await review(h, 'aurore-polaire', { decision: 'approve', window: { startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-05T00:00:00Z' } });
    expect(res.statusCode).toBe(400);
    expect(h.tables.packs[0]!.status).toBe('pending');
  });

  it('un modérateur ne tranche pas sa propre proposition', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, MODO);
    expect((await review(h, 'aurore-polaire', { decision: 'approve' })).json()).toMatchObject({ code: 'LENS_SELF_REVIEW' });
  });
});

describe('la boutique des lens et l’installation (#11271)', () => {
  const published = async (options: { now?: string; communities?: readonly string[] } = {}, approval: object = { decision: 'approve' }) => {
    const h = await harness(options);
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    await review(h, 'aurore-polaire', approval);
    return h;
  };
  const shelf = async (h: Harness) => ((await h.app.inject({ method: 'GET', url: '/' })).json().data as { slug: string }[]).map((pack) => pack.slug);

  it('une lens en attente n’est ni en rayon ni installable', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    expect(await shelf(h)).toEqual([]);
    expect((await h.app.inject({ method: 'PUT', url: '/aurore-polaire/install' })).statusCode).toBe(404);
  });

  it('publiée et dans sa fenêtre, elle est en rayon et s’installe', async () => {
    const h = await published();
    expect(await shelf(h)).toEqual(['aurore-polaire']);
    const res = await h.app.inject({ method: 'PUT', url: '/aurore-polaire/install' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ slug: 'aurore-polaire', installed: true });
  });

  it('hors de sa fenêtre, elle sort du rayon et ne s’installe plus', async () => {
    const h = await published({ now: '2026-12-02T00:00:00Z' });
    expect(await shelf(h)).toEqual([]);
    expect((await h.app.inject({ method: 'PUT', url: '/aurore-polaire/install' })).statusCode).toBe(404);
  });

  it('réservée à une communauté, elle n’est offerte qu’à ses membres', async () => {
    const outsider = await published({}, { decision: 'approve', communities: [COMMUNITY] });
    expect(await shelf(outsider)).toEqual([]);
    const member = await published({ communities: [COMMUNITY] }, { decision: 'approve', communities: [COMMUNITY] });
    expect(await shelf(member)).toEqual(['aurore-polaire']);
  });
});

describe('le magasin des fichiers (#11271)', () => {
  it('ne sert les fichiers et le document d’une lens qu’une fois publiée, fenêtre ouverte', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    const { packs } = h;
    const asset = String(h.tables.assets[0]!.src);
    expect(await packs.approvedFile(asset)).toBeNull();
    await review(h, 'aurore-polaire', { decision: 'approve' });
    expect(await packs.approvedFile(asset)).toMatchObject({ contentType: 'image/png' });
    expect(await packs.approvedFile(String(h.tables.packs[0]!.documentSrc))).toMatchObject({ contentType: 'application/json; charset=utf-8' });
  });
});

describe('une LUT reste sans perte (#11271, audit de #12293)', () => {
  it('le fichier qu’une couche `lut` nomme passe par la porte sans perte, jamais par celle des stickers', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) });

    expect(h.normalizedAs.luts).toEqual(['aaaaaaaaaaaaaaaa.png']);
    expect([...h.normalizedAs.assets].sort()).toEqual(['bbbbbbbbbbbbbbbb.png', 'cccccccccccccccc.png']);
  });
});

describe('modération journalisée et retrait d’une lens publiée (audit de #12293)', () => {
  const approved = async (now?: string) => {
    const h = await harness(now === undefined ? {} : { now });
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    await review(h, 'aurore-polaire', { decision: 'approve', note: 'Belle lens' });
    return h;
  };
  const withdraw = (h: Harness, body: object = { note: 'Contenu signalé' }, user = MODO) =>
    h.app.inject({ method: 'POST', url: '/aurore-polaire/withdraw', headers: { 'x-user': user }, payload: body });

  it('publier et refuser s’écrivent au journal AVANT d’agir, au nom du modérateur, avec l’auteur de la proposition', async () => {
    const h = await approved();

    expect(h.tables.audit).toEqual([
      expect.objectContaining({ adminId: MODO, userId: BOB, action: 'LENS_PACK_APPROVE', entity: 'LensPack', entityId: 'aurore-polaire', statusAtWrite: 'pending' }),
    ]);
    expect(JSON.parse(String(h.tables.audit[0]!.metadata))).toMatchObject({ note: 'Belle lens' });
  });

  it('un journal indisponible ne laisse rien trancher (500), et la lens reste en attente', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    h.tables.auditState.down = true;

    const res = await review(h, 'aurore-polaire', { decision: 'approve' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'LENS_AUDIT_UNAVAILABLE' });
    expect(h.tables.packs[0]!.status).toBe('pending');
  });

  it('une re-proposition après un refus garde au journal le refus, son auteur et sa note', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    await review(h, 'aurore-polaire', { decision: 'reject', note: 'Texte illisible' });

    expect((await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB)).statusCode).toBe(201);

    expect(h.tables.audit.map((entry) => entry.action)).toEqual(['LENS_PACK_REJECT', 'LENS_PACK_REJECTION_REPLACED']);
    const replaced = h.tables.audit[1]!;
    expect(replaced).toMatchObject({ adminId: BOB, userId: BOB, entityId: 'aurore-polaire' });
    expect(JSON.parse(String(replaced.metadata))).toMatchObject({ reviewNote: 'Texte illisible', reviewerId: MODO });
  });

  it('un modérateur RETIRE une lens publiée : journalisé d’abord, elle quitte le rayon, les installés et le magasin des fichiers', async () => {
    const h = await approved();
    await h.app.inject({ method: 'PUT', url: '/aurore-polaire/install' });
    const document = String(h.tables.packs[0]!.documentSrc);
    const asset = String(h.tables.assets[0]!.src);

    const res = await withdraw(h);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ slug: 'aurore-polaire', status: 'withdrawn' });
    expect(h.tables.audit.at(-1)).toMatchObject({ adminId: MODO, userId: BOB, action: 'LENS_PACK_WITHDRAW', statusAtWrite: 'approved' });
    expect(JSON.parse(String(h.tables.audit.at(-1)!.metadata))).toMatchObject({ note: 'Contenu signalé' });
    expect((await h.app.inject({ method: 'GET', url: '/' })).json().data).toEqual([]);
    expect((await h.app.inject({ method: 'GET', url: '/installed' })).json().data).toEqual([]);
    expect((await h.app.inject({ method: 'GET', url: '/aurore-polaire' })).statusCode).toBe(404);
    expect(await h.packs.approvedFile(document)).toBeNull();
    expect(await h.packs.approvedFile(asset)).toBeNull();
  });

  it('le retrait est fermé à qui ne modère pas, et ne vise qu’une lens publiée', async () => {
    const h = await approved();
    expect((await withdraw(h, {}, BOB)).statusCode).toBe(403);
    expect(h.tables.packs[0]!.status).toBe('approved');

    const pending = await harness();
    await submit(pending, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    expect((await withdraw(pending)).statusCode).toBe(404);
    expect(pending.tables.packs[0]!.status).toBe('pending');
  });

  it('qui l’avait installée la désinstalle encore après son retrait, et ne peut pas la réinstaller (contre-audit N4)', async () => {
    const h = await approved();
    await h.app.inject({ method: 'PUT', url: '/aurore-polaire/install' });
    await withdraw(h);

    expect((await h.app.inject({ method: 'DELETE', url: '/aurore-polaire/install' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'PUT', url: '/aurore-polaire/install' })).statusCode).toBe(404);
  });

  it('un geste perdu dans une course entre modérateurs est journalisé comme non appliqué (contre-audit N5)', async () => {
    const h = await harness();
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    h.tables.lensPack.updateMany.mockImplementationOnce(async () => ({ count: 0 }));

    expect((await review(h, 'aurore-polaire', { decision: 'approve' })).statusCode).toBe(404);
    expect(h.tables.audit.map((entry) => entry.action)).toEqual(['LENS_PACK_APPROVE', 'LENS_PACK_APPROVE_NOT_APPLIED']);
  });

  it('sans journal, rien n’est retiré', async () => {
    const h = await approved();
    h.tables.auditState.down = true;
    expect((await withdraw(h)).statusCode).toBe(500);
    expect(h.tables.packs[0]!.status).toBe('approved');
  });
});

describe('une lens n’est servie que dans sa fenêtre et à son public (audit de #12293)', () => {
  const approvedFor = async (options: { now?: string; communities?: readonly string[] }, approval: object) => {
    const h = await harness(options);
    await submit(h, { document: lensDocument(), assets: assetsOf(ALL_ASSETS) }, BOB);
    await review(h, 'aurore-polaire', approval);
    return h;
  };
  const read = (h: Harness, url: string, user = ALICE) => h.app.inject({ method: 'GET', url, headers: { 'x-user': user } });
  const FUTURE = { decision: 'approve', window: { startsAt: '2026-12-20T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' } };

  it('avant l’ouverture de sa fenêtre, ni le détail, ni le document, ni ses fichiers ne la révèlent à un tiers', async () => {
    const h = await approvedFor({}, FUTURE);

    expect((await read(h, '/aurore-polaire')).statusCode).toBe(404);
    expect((await read(h, '/aurore-polaire/document')).statusCode).toBe(404);
    expect(await h.packs.approvedFile(String(h.tables.packs[0]!.documentSrc))).toBeNull();
    expect(await h.packs.approvedFile(String(h.tables.assets[0]!.src))).toBeNull();
  });

  it('son auteur et la modération la lisent toujours', async () => {
    const h = await approvedFor({}, FUTURE);

    expect((await read(h, '/aurore-polaire', BOB)).statusCode).toBe(200);
    expect((await read(h, '/aurore-polaire/document', MODO)).statusCode).toBe(200);
  });

  it('réservée à une communauté, elle n’est détaillée qu’à ses membres', async () => {
    const outsider = await approvedFor({}, { decision: 'approve', communities: [COMMUNITY] });
    expect((await read(outsider, '/aurore-polaire')).statusCode).toBe(404);
    expect((await read(outsider, '/aurore-polaire/document')).statusCode).toBe(404);

    const member = await approvedFor({ communities: [COMMUNITY] }, { decision: 'approve', communities: [COMMUNITY] });
    expect((await read(member, '/aurore-polaire')).statusCode).toBe(200);
    const served = (await read(member, '/aurore-polaire/document')).json().data.documentJson as string;
    expect(served).not.toContain(COMMUNITY);
  });
});
