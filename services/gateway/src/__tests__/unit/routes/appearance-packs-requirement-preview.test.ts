/**
 * LA BOUTIQUE DIT CE QUI RESTE À DÉBLOQUER ET COMMENT (#11276) — `GET
 * /packs/shop` sert, pour chaque pack NON possédé qui se gagne ou qui a une
 * fenêtre, `requirementPreview` : la règle (rang, trophée, saison) avec où en
 * est le lecteur, et la fenêtre. Un pack possédé ou libre n'en porte aucun.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PackCatalog } from '../../../services/packs/PackCatalog';
import { appearancePackSpec } from '../../../services/packs/appearancePackSpec';
import { buildPackIndex } from '../../../services/packs/PackIndex';
import { packsShopRoutes } from '../../../routes/packs-shop';
import { appearancePrisma } from './appearance-packs.harness';

const ALICE = '68b0000000000000000000a1';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 1024, sha256: sha(seed) });
const ring = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  domain: 'avatar-ring',
  origin: 'official',
  version: 1,
  order: 0,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: ref('a'),
  preview: null,
  contract: ref('c', 'json'),
  strings: { fr: ref('d', 'json') },
  downloadBytes: { story: 1000, square: null },
  names: { fr: { name: `Contour ${slug}`, description: `Le contour ${slug}.` } },
  usage: { kind: 'free', surfaces: ['avatar'] },
  ...over,
});

const index = () =>
  buildPackIndex({
    registries: [[
      ring('voix', { reward: { kind: 'rank', rank: 'voix' } }),
      ring('coupe', { order: 1, reward: { kind: 'trophy', key: 'coupe-du-premier-pas' } }),
      ring('saison-2', { order: 2, reward: { kind: 'season', number: 2 }, availability: { endsAt: '2026-12-31T00:00:00.000Z' } }),
      ring('libre', { order: 3 }),
    ]],
    retained: [],
    contractItemKeys: () => ['filet'],
  });

function shop(facts: { readonly glory?: number; readonly trophies?: readonly string[]; readonly seasons?: readonly number[] } = {}) {
  const db = appearancePrisma();
  const reads = { glory: 0, trophies: 0, seasons: 0 };
  const gameFacts = {
    gloryLedger: { aggregate: jest.fn(async () => { reads.glory += 1; return { _sum: { delta: facts.glory ?? 0 } }; }) },
    mythicSeat: { findUnique: async () => null },
    gameTrophy: { findMany: jest.fn(async () => { reads.trophies += 1; return (facts.trophies ?? []).map((key) => ({ key })); }) },
    gameSeason: { findMany: jest.fn(async () => { reads.seasons += 1; return (facts.seasons ?? []).map((number) => ({ number })); }) },
  };
  const prisma = Object.assign(Object.create(db.prisma as object) as PrismaClient, gameFacts);
  const catalog = new PackCatalog({ prisma, spec: appearancePackSpec({ index: index(), domain: 'avatar-ring' }), now: () => new Date('2026-11-10T00:00:00Z') });
  return { db, catalog, prisma, reads };
}

const previewOf = async (catalog: ReturnType<typeof shop>['catalog'], slug: string) =>
  ((await catalog.catalogue(ALICE)).find((pack) => pack.slug === slug) as { requirementPreview?: unknown } | undefined)?.requirementPreview;

describe('ce qui reste à débloquer (#11276)', () => {
  it('un rang : la Gloire actuelle, le seuil, l’écart', async () => {
    const { catalog } = shop({ glory: 2500 });
    expect(await previewOf(catalog, 'voix')).toEqual({
      met: false,
      reward: { kind: 'rank', rank: 'voix', currentRank: 'echo', requirement: { current: 2500, required: 6000, missing: 3500, met: false } },
      window: null,
    });
  });

  it('un trophée gravé ou une saison jouée se disent remplis ; la fenêtre suit', async () => {
    const { catalog } = shop({ trophies: ['coupe-du-premier-pas'] });
    expect(await previewOf(catalog, 'coupe')).toMatchObject({ met: true, reward: { kind: 'trophy', met: true } });
    expect(await previewOf(catalog, 'saison-2')).toEqual({
      met: false,
      reward: { kind: 'season', number: 2, met: false },
      window: { state: 'open', endsAt: '2026-12-31T00:00:00.000Z' },
    });
  });

  it('un pack possédé ou libre n’en porte aucun', async () => {
    const { db, catalog } = shop();
    await db.prisma.userPackOwnership.create({ data: { userId: ALICE, packKey: 'avatar-ring.voix', source: 'grant', reference: 'support' } });
    expect(await previewOf(catalog, 'voix')).toBeUndefined();
    expect(await previewOf(catalog, 'libre')).toBeUndefined();
  });

  it('les faits sont lus UNE fois par lecture de boutique, quel que soit le nombre de packs', async () => {
    const { catalog, reads } = shop();
    await catalog.catalogue(ALICE);
    expect(reads).toEqual({ glory: 1, trophies: 1, seasons: 1 });
  });

  it('GET /packs/shop le sert', async () => {
    const { catalog } = shop({ glory: 2500 });
    const app = Fastify({ logger: false });
    app.decorate('authenticate', async (request: any) => {
      request.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: ALICE, registeredUser: { id: ALICE, role: 'USER' } };
    });
    app.decorate('prisma', {} as never);
    await app.register(packsShopRoutes, { catalogs: { 'avatar-ring': catalog }, balance: async () => 0 });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/?domains=avatar-ring' });

    expect(res.statusCode).toBe(200);
    const packs = res.json().data.domains[0].packs as { slug: string; requirementPreview?: { reward?: { kind: string } } }[];
    expect(packs.find((pack) => pack.slug === 'voix')?.requirementPreview?.reward?.kind).toBe('rank');
    await app.close();
  });
});
