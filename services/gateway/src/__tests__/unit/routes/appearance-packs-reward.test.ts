/**
 * UN CONTOUR OU UN CADRE DE BANNIÈRE RÉCOMPENSE LE JEU (#11273) : un pack
 * récompensé n'est possédé par AUCUN compte tant qu'il n'a pas été gagné ; il
 * se gagne par SA règle (celle du registre, jamais une autre), puis s'installe
 * et s'équipe sur sa surface — le chemin sur lequel #11181 pose les parures.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PackCatalog } from '../../../services/packs/PackCatalog';
import { appearancePackSpec } from '../../../services/packs/appearancePackSpec';
import { buildPackIndex } from '../../../services/packs/PackIndex';
import { validateProfileDecorWrite } from '../../../services/appearance/profileDecor';
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

const FIRST_RANK = { kind: 'rank', rank: 'murmure' } as const;
const index = () =>
  buildPackIndex({
    registries: [[ring('premier-pas', { reward: FIRST_RANK }), ring('legende', { order: 1, reward: { kind: 'rank', rank: 'legende' } }), ring('libre', { order: 2 })]],
    retained: [],
    contractItemKeys: () => ['filet'],
  });

function shop() {
  const db = appearancePrisma();
  const gameFacts = { gloryLedger: { aggregate: async () => ({ _sum: { delta: 0 } }) }, mythicSeat: { findUnique: async () => null } };
  const prisma = Object.assign(Object.create(db.prisma as object) as PrismaClient, gameFacts);
  const packs = index();
  const catalog = new PackCatalog({ prisma, spec: appearancePackSpec({ index: packs, domain: 'avatar-ring' }) });
  return { db, catalog, prisma, packs };
}

const ownedIn = async (catalog: ReturnType<typeof shop>['catalog'], slug: string) =>
  (await catalog.catalogue(ALICE)).find((pack) => pack.slug === slug)?.owned;

describe('un pack récompensé ne se possède que gagné (#11273)', () => {
  it('la boutique ne le dit possédé par personne tant qu’il n’est pas gagné ; un contour libre l’est par tous', async () => {
    const { catalog } = shop();

    expect(await ownedIn(catalog, 'premier-pas')).toBe(false);
    expect(await ownedIn(catalog, 'libre')).toBe(true);
  });

  it('il ne s’installe pas sans avoir été gagné', async () => {
    const { catalog } = shop();

    expect(await catalog.setInstalled(ALICE, 'premier-pas', true)).toEqual({ kind: 'not-owned' });
  });

  it('il se gagne par SA règle : la ligne `game` s’écrit, et le pack devient possédé et installable', async () => {
    const { db, catalog } = shop();

    expect(await catalog.award(ALICE, 'premier-pas', { source: 'game', rule: FIRST_RANK })).toEqual({ kind: 'granted' });

    expect(db.ownerships).toEqual([expect.objectContaining({ userId: ALICE, packKey: 'avatar-ring.premier-pas', source: 'game', reference: 'rank:murmure' })]);
    expect(await ownedIn(catalog, 'premier-pas')).toBe(true);
    expect(await catalog.setInstalled(ALICE, 'premier-pas', true)).toMatchObject({ kind: 'done', pack: { slug: 'premier-pas', installed: true } });
  });

  it('une AUTRE règle que la sienne n’ouvre rien, même remplie', async () => {
    const { db, catalog } = shop();

    expect(await catalog.award(ALICE, 'legende', { source: 'game', rule: FIRST_RANK })).toEqual({ kind: 'not-eligible' });
    expect(db.ownerships).toEqual([]);
  });

  it('sa règle non remplie n’ouvre rien', async () => {
    const { db, catalog } = shop();

    expect(await catalog.award(ALICE, 'legende', { source: 'game', rule: { kind: 'rank', rank: 'legende' } })).toEqual({ kind: 'not-eligible' });
    expect(db.ownerships).toEqual([]);
  });

  it('il s’octroie aussi (support, événement) : il n’est jamais « gratuit »', async () => {
    const { catalog } = shop();

    expect(await catalog.award(ALICE, 'legende', { source: 'grant', reference: 'support-1' })).toEqual({ kind: 'granted' });
    expect(await ownedIn(catalog, 'legende')).toBe(true);
  });
});

describe('équiper un contour récompensé (#11273)', () => {
  const write = (owns: readonly string[]) => {
    const prisma = { userPackOwnership: { findMany: jest.fn(async () => owns.map((packKey) => ({ packKey }))) } } as unknown as PrismaClient;
    return validateProfileDecorWrite({ prisma, index: index(), userId: ALICE, input: { avatarRing: { pack: 'premier-pas', item: 'filet' } } });
  };

  it('refusé tant qu’il n’est pas gagné', async () => {
    expect(await write([])).toEqual({ kind: 'not-owned' });
  });

  it('accepté une fois gagné, sur la surface que son usage déclare', async () => {
    expect(await write(['avatar-ring.premier-pas'])).toEqual({ kind: 'ok', data: { equippedAvatarRing: expect.stringContaining('premier-pas') } });
  });
});
