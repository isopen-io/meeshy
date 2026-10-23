/**
 * UN PACK A UNE FENÊTRE ET UN CIBLAGE (#11274) : la boutique ne l'offre que
 * dans sa fenêtre, et qu'aux communautés, pays et langues qu'il vise. Décision
 * #11252 (défaut retenu) : un objet manqué revient — la fenêtre gouverne
 * l'OFFRE, jamais la possession. Possédé ou installé, il reste en rayon et
 * s'installe hors fenêtre.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PackAudience } from '@meeshy/shared/types/pack-availability';
import { PackCatalog } from '../../../services/packs/PackCatalog';
import { appearancePackSpec } from '../../../services/packs/appearancePackSpec';
import { buildPackIndex } from '../../../services/packs/PackIndex';
import { appearancePrisma } from './appearance-packs.harness';

const ALICE = '68b0000000000000000000a1';
const COMMUNITY = '64b7f0c2a1b2c3d4e5f60718';
const NOVEMBER = { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z' };

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 1024, sha256: sha(seed) });
const wallpaper = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  domain: 'wallpaper',
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
  names: { fr: { name: `Fond ${slug}`, description: `Le fond ${slug}.` } },
  ...over,
});

const audienceOf = (over: Partial<PackAudience> = {}): PackAudience => ({ communityIds: new Set(), country: 'FR', languages: ['fr'], ...over });

function shop(params: { readonly now: string; readonly audience?: PackAudience }) {
  const db = appearancePrisma();
  const index = buildPackIndex({
    registries: [[
      wallpaper('toujours'),
      wallpaper('novembre', { order: 1, availability: NOVEMBER }),
      wallpaper('novembre-payant', { order: 2, availability: NOVEMBER, price: 30 }),
      wallpaper('communaute', { order: 3, targeting: { communities: [COMMUNITY] } }),
      wallpaper('cameroun-fr', { order: 4, targeting: { countries: ['CM'], languages: ['fr'] } }),
    ]],
    retained: [],
    contractItemKeys: () => ['fond'],
  });
  const audienceReads: string[] = [];
  const catalog = new PackCatalog({
    prisma: db.prisma,
    spec: appearancePackSpec({ index, domain: 'wallpaper' }),
    now: () => new Date(params.now),
    audience: async (userId) => {
      audienceReads.push(userId);
      return params.audience ?? audienceOf();
    },
  });
  return { db, catalog, audienceReads };
}

const slugs = async (catalog: PackCatalog<unknown, never>) =>
  (await catalog.catalogue(ALICE)).map((pack) => (pack as { slug: string }).slug);

describe('la fenêtre gouverne l’offre (#11274)', () => {
  it('avant la fenêtre, le pack n’est pas en rayon ; pendant, il l’est ; après, il en sort', async () => {
    expect(await slugs(shop({ now: '2026-10-20T00:00:00Z' }).catalog as never)).not.toContain('novembre');
    expect(await slugs(shop({ now: '2026-11-10T00:00:00Z' }).catalog as never)).toContain('novembre');
    expect(await slugs(shop({ now: '2026-12-02T00:00:00Z' }).catalog as never)).not.toContain('novembre');
  });

  it('la boutique sert la fenêtre du pack, pour dire « jusqu’au 30 novembre »', async () => {
    const pack = (await shop({ now: '2026-11-10T00:00:00Z' }).catalog.catalogue(ALICE)).find((p) => p.slug === 'novembre');
    expect(pack).toMatchObject({ availability: NOVEMBER });
  });

  it('hors fenêtre, il ne s’installe ni ne s’achète', async () => {
    const { catalog } = shop({ now: '2026-12-02T00:00:00Z' });
    expect(await catalog.setInstalled(ALICE, 'novembre', true)).toEqual({ kind: 'not-found' });
    expect(await catalog.purchase(ALICE, 'novembre-payant', 'req-1')).toEqual({ kind: 'not-found' });
  });
});

describe('un objet manqué n’est jamais perdu (#11252)', () => {
  it('possédé, il reste en rayon, possédé et installable après sa fenêtre', async () => {
    const { db, catalog } = shop({ now: '2026-12-02T00:00:00Z' });
    await db.prisma.userPackOwnership.create({ data: { userId: ALICE, packKey: 'wallpaper.novembre-payant', source: 'event', reference: 'noel' } });

    const pack = (await catalog.catalogue(ALICE)).find((p) => p.slug === 'novembre-payant');
    expect(pack).toMatchObject({ owned: true });
    expect(await catalog.setInstalled(ALICE, 'novembre-payant', true)).toMatchObject({ kind: 'done', pack: { installed: true } });
  });

  it('installé pendant sa fenêtre, il reste en rayon et se retire après', async () => {
    const during = shop({ now: '2026-11-10T00:00:00Z' });
    await during.catalog.setInstalled(ALICE, 'novembre', true);
    const after = new PackCatalog({
      prisma: during.db.prisma,
      spec: (during.catalog as unknown as { spec: never }).spec,
      now: () => new Date('2026-12-02T00:00:00Z'),
      audience: async () => audienceOf(),
    });

    expect(await slugs(after as never)).toContain('novembre');
    expect(await after.setInstalled(ALICE, 'novembre', false)).toMatchObject({ kind: 'done' });
  });
});

describe('le ciblage gouverne l’offre (#11274)', () => {
  const now = '2026-11-10T00:00:00Z';

  it('un pack de communauté n’est offert qu’à ses membres', async () => {
    expect(await slugs(shop({ now }).catalog as never)).not.toContain('communaute');
    expect(await slugs(shop({ now, audience: audienceOf({ communityIds: new Set([COMMUNITY]) }) }).catalog as never)).toContain('communaute');
  });

  it('pays ET langue : il faut les deux', async () => {
    expect(await slugs(shop({ now, audience: audienceOf({ country: 'CM' }) }).catalog as never)).toContain('cameroun-fr');
    expect(await slugs(shop({ now, audience: audienceOf({ country: 'CM', languages: ['en'] }) }).catalog as never)).not.toContain('cameroun-fr');
    expect(await slugs(shop({ now }).catalog as never)).not.toContain('cameroun-fr');
  });

  it('le ciblage n’est jamais servi au client', async () => {
    const all = await shop({ now, audience: audienceOf({ communityIds: new Set([COMMUNITY]) }) }).catalog.catalogue(ALICE);
    expect(JSON.stringify(all)).not.toContain(COMMUNITY);
  });

  it('un registre sans ciblage ne lit pas le lecteur', async () => {
    const db = appearancePrisma();
    const index = buildPackIndex({ registries: [[wallpaper('toujours')]], retained: [], contractItemKeys: () => ['fond'] });
    const reads: string[] = [];
    const catalog = new PackCatalog({
      prisma: db.prisma,
      spec: appearancePackSpec({ index, domain: 'wallpaper' }),
      audience: async (userId) => {
        reads.push(userId);
        return audienceOf();
      },
    });
    await catalog.catalogue(ALICE);
    expect(reads).toEqual([]);
  });
});
