/**
 * LA POSSESSION SANS ACHAT (#11272) à travers le moteur des packs : un pack
 * octroyé ou venu d'un événement est possédé, installable, et ne se paie plus ;
 * un pack gratuit n'a pas de ligne ; l'achat écrit sa voie.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PackCatalog, type PackInstallationBroadcast } from '../../../services/packs/PackCatalog';
import { appearancePackSpec } from '../../../services/packs/appearancePackSpec';
import { buildPackIndex } from '../../../services/packs/PackIndex';
import { appearancePrisma } from './appearance-packs.harness';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 1024, sha256: sha(seed) });
const entry = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  domain: 'wallpaper',
  origin: 'official',
  version: 3,
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
  names: { fr: { name: `Pack ${slug}`, description: `Les ${slug}.` } },
  ...over,
});

function shop() {
  const db = appearancePrisma();
  const broadcasts: { userId: string; event: Record<string, unknown> }[] = [];
  const broadcast: PackInstallationBroadcast = (userId, event) => void broadcasts.push({ userId, event: event as unknown as Record<string, unknown> });
  const index = buildPackIndex({ registries: [[entry('prestige', { price: 50 }), entry('offert', { order: 1 })]], retained: [] });
  const gameFacts = { gloryLedger: { aggregate: async () => ({ _sum: { delta: 0 } }) }, mythicSeat: { findUnique: async () => null } };
  const prisma = Object.assign(Object.create(db.prisma as object) as PrismaClient, gameFacts);
  const catalog = new PackCatalog({ prisma, spec: appearancePackSpec({ index, domain: 'wallpaper' }), broadcast });
  return { db, catalog, broadcasts };
}

const owned = async (catalog: ReturnType<typeof shop>['catalog'], userId: string, slug: string) =>
  (await catalog.catalogue(userId)).find((pack) => pack.slug === slug)?.owned;

describe('PackCatalog.award — posséder sans acheter', () => {
  it('un octroi ouvre le pack payant : possédé, sans dépense, source grant', async () => {
    const { db, catalog } = shop();

    expect(await owned(catalog, ALICE, 'prestige')).toBe(false);
    expect(await catalog.award(ALICE, 'prestige', { source: 'grant', reference: 'support-1' })).toEqual({ kind: 'granted' });

    expect(await owned(catalog, ALICE, 'prestige')).toBe(true);
    expect(await owned(catalog, BOB, 'prestige')).toBe(false);
    expect(db.ownerships).toEqual([expect.objectContaining({ userId: ALICE, packKey: 'wallpaper.prestige', source: 'grant' })]);
    expect(db.ledger).toEqual([]);
  });

  it('un pack possédé par événement s’installe : la possession lève le refus « pas possédé »', async () => {
    const { catalog } = shop();
    expect(await catalog.setInstalled(ALICE, 'prestige', true)).toEqual({ kind: 'not-owned' });

    await catalog.award(ALICE, 'prestige', { source: 'event', reference: 'fete-2026' });

    expect(await catalog.setInstalled(ALICE, 'prestige', true)).toMatchObject({ kind: 'done', pack: { slug: 'prestige', installed: true, owned: true } });
  });

  it('diffuse la possession aux autres appareils du compte (owned: true), installé reflétant l’état réel', async () => {
    const { catalog, broadcasts } = shop();

    await catalog.award(ALICE, 'prestige', { source: 'event', reference: 'fete-2026' });

    expect(broadcasts).toEqual([{ userId: ALICE, event: expect.objectContaining({ domain: 'wallpaper', slug: 'prestige', installed: false, owned: true }) }]);
  });

  it('IDEMPOTENT : un rejeu dit déjà possédé, ne rediffuse rien et n’écrit pas une seconde ligne', async () => {
    const { db, catalog, broadcasts } = shop();
    const award = { source: 'grant', reference: 'support-1' } as const;

    await catalog.award(ALICE, 'prestige', award);
    expect(await catalog.award(ALICE, 'prestige', award)).toEqual({ kind: 'already-owned' });

    expect(db.ownerships).toHaveLength(1);
    expect(broadcasts).toHaveLength(1);
  });

  it('un pack GRATUIT n’a pas de ligne de possession, un inconnu est refusé', async () => {
    const { db, catalog } = shop();

    expect(await catalog.award(ALICE, 'offert', { source: 'grant', reference: 'x' })).toEqual({ kind: 'free' });
    expect(await catalog.award(ALICE, 'inconnu', { source: 'grant', reference: 'x' })).toEqual({ kind: 'not-found' });
    expect(db.ownerships).toEqual([]);
  });

  it('une règle de jeu non remplie n’ouvre rien (éligibilité évaluée serveur)', async () => {
    const { db, catalog } = shop();

    expect(await catalog.award(ALICE, 'prestige', { source: 'game', rule: { kind: 'rank', rank: 'voix' } })).toEqual({ kind: 'not-eligible' });
    expect(db.ownerships).toEqual([]);
  });
});

describe('PackCatalog.purchase — la voie de l’achat', () => {
  it('écrit la source purchase avec le prix payé et la dépense', async () => {
    const { db, catalog } = shop();
    db.grant(ALICE, 80);

    await catalog.purchase(ALICE, 'prestige', 'geste-0001');

    expect(db.ownerships).toEqual([expect.objectContaining({ source: 'purchase', priceMeeshes: 50, requestId: 'geste-0001' })]);
  });

  it('un pack déjà octroyé ne se paie pas : already-owned, aucun Meesh débité', async () => {
    const { db, catalog } = shop();
    db.grant(ALICE, 80);
    await catalog.award(ALICE, 'prestige', { source: 'event', reference: 'fete-2026' });

    expect(await catalog.purchase(ALICE, 'prestige', 'geste-0002')).toEqual({ kind: 'already-owned' });

    expect(db.ledger.filter((line) => line.reason === 'spend')).toEqual([]);
    expect(db.ownerships).toHaveLength(1);
  });
});
