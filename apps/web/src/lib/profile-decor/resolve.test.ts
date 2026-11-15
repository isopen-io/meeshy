import { describe, expect, test } from 'bun:test';

import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS } from './catalog';
import { bannerFrameOptions, bannerOptions, resolveBanner, resolveBannerFrame, resolveRing, ringOptions } from './resolve';
import type { DesignPackSummary } from './pack-summary';

const builtinItem = (pack: string, item: string): ServedProfileDecorItem => ({ pack, item, origin: 'builtin', contract: null });
const officialItem = (pack: string, item: string): ServedProfileDecorItem => ({ pack, item, origin: 'official', contract: 'abcdef0123456789.json' });

const ringContract = (key: string) => ({
  domain: 'avatar-ring',
  rings: [{ key, stroke: { style: 'solid', width: 0.04, colors: ['#112233'] } }],
});

const summary = (slug: string, overrides: Partial<DesignPackSummary> = {}): DesignPackSummary =>
  ({
    slug,
    name: slug,
    description: '',
    author: 'Meeshy',
    builtin: true,
    status: 'approved',
    itemCount: 0,
    coverUrl: null,
    installed: true,
    installCount: 0,
    domain: 'avatar-ring',
    origin: 'builtin',
    version: 1,
    downloadBytes: null,
    removable: false,
    names: {},
    preview: null,
    contractSchema: 1,
    contract: null,
    ...overrides,
  }) as DesignPackSummary;

describe('résoudre ce que le serveur sert', () => {
  test('un contour builtin se peint sans réseau', () => {
    expect(resolveRing(builtinItem('contours-essentiels', 'laurier'), new Map())?.key).toBe('laurier');
  });

  test('rien d’équipé, ou un contour inconnu : aucun contour', () => {
    expect(resolveRing(null, new Map())).toBeNull();
    expect(resolveRing(builtinItem('contours-essentiels', 'fantome'), new Map())).toBeNull();
  });

  test('un contour officiel se peint depuis son contrat chargé, et pas avant', () => {
    const item = officialItem('savane', 'acacia');
    expect(resolveRing(item, new Map())).toBeNull();
    expect(resolveRing(item, new Map([['abcdef0123456789.json', ringContract('acacia')]]))?.key).toBe('acacia');
    expect(resolveRing(item, new Map([['abcdef0123456789.json', ringContract('autre')]]))).toBeNull();
  });

  test('un contrat illisible ne peint rien', () => {
    expect(resolveRing(officialItem('savane', 'acacia'), new Map([['abcdef0123456789.json', { domain: 'avatar-ring', rings: [] }]]))).toBeNull();
  });

  test('une bannière builtin se résout, une bannière officielle attend son contrat', () => {
    expect(resolveBanner(builtinItem('bannieres-essentielles', 'aurore'), new Map())?.key).toBe('aurore');
    expect(resolveBanner(officialItem('p', 'aurore'), new Map())).toBeNull();
  });
});

describe('les cadres de bannière embarqués (#10936)', () => {
  test('un cadre builtin équipé se peint sans réseau', () => {
    expect(resolveBannerFrame(builtinItem('cadres-haussmannien', 'haussmannien'), new Map())?.key).toBe('haussmannien');
    expect(resolveBannerFrame(builtinItem('cadres-haussmannien', 'fantome'), new Map())).toBeNull();
  });

  test('le sélecteur propose les packs de cadres installés et possédés, et deux d’office (#11165)', () => {
    expect(bannerFrameOptions({ installed: undefined, contracts: new Map() }).map((group) => [group.pack, group.items.map((item) => item.ref.item)])).toEqual([
      ['cadres-haussmannien', ['haussmannien', 'haussmannien-anime']],
      ['cadres-ancestral', ['ancestral', 'ancestral-anime']],
    ]);
    const groups = bannerFrameOptions({ installed: [summary('cadres-celte', { domain: 'banner-frame', removable: true })], contracts: new Map() });
    expect(groups.map((group) => [group.pack, group.items.map((item) => item.ref.item)])).toEqual([['cadres-celte', ['celte', 'celte-anime']]]);
  });
});

describe('ce que le sélecteur propose', () => {
  test('sans liste installée (ancien serveur, hors ligne), les packs embarqués installés d’office', () => {
    const groups = ringOptions({ installed: undefined, contracts: new Map() });
    expect(groups.map((group) => group.pack)).toEqual(BUILTIN_RING_PACKS.filter((pack) => pack.installedByDefault).map((pack) => pack.slug));
    expect(groups[0]?.items.length).toBe(6);
    expect(bannerOptions({ installed: undefined, contracts: new Map() })[0]?.items.length).toBe(BUILTIN_BANNER_PACKS[0]?.items.length);
  });

  test('un pack payant installé mais non possédé n’est jamais proposé', () => {
    const groups = ringOptions({
      installed: [summary('contours-essentiels'), summary('savane', { origin: 'official', builtin: false, price: 50, owned: false, contract: { src: 'abcdef0123456789.json', bytes: 1, sha256: 'a'.repeat(64) } })],
      contracts: new Map([['abcdef0123456789.json', ringContract('acacia')]]),
    });
    expect(groups.map((group) => group.pack)).toEqual(['contours-essentiels']);
  });

  test('un pack officiel possédé et installé est proposé quand son contrat est chargé', () => {
    const savane = summary('savane', { origin: 'official', builtin: false, price: 50, owned: true, contract: { src: 'abcdef0123456789.json', bytes: 1, sha256: 'a'.repeat(64) } });
    const contracts = new Map([['abcdef0123456789.json', ringContract('acacia')]]);
    expect(ringOptions({ installed: [savane], contracts }).map((group) => group.pack)).toEqual(['savane']);
    expect(ringOptions({ installed: [savane], contracts: new Map() }).map((group) => group.pack)).toEqual([]);
  });

  test('un pack TIERS (community) possédé et installé se choisit et se peint depuis son contrat — contour et bannière (#10737, #10709)', () => {
    const contract = { src: 'fedcba9876543210.json', bytes: 1, sha256: 'b'.repeat(64) };
    const ring = summary('halo-tiers', { origin: 'community', builtin: false, price: 20, owned: true, contract });
    const ringGroups = ringOptions({ installed: [ring], contracts: new Map([[contract.src, ringContract('halo')]]) });
    expect(ringGroups.map((group) => [group.pack, group.origin, group.contract])).toEqual([['halo-tiers', 'community', contract.src]]);
    expect(resolveRing({ pack: 'halo-tiers', item: 'halo', origin: 'community', contract: contract.src }, new Map([[contract.src, ringContract('halo')]]))?.key).toBe('halo');

    const design = BUILTIN_BANNER_PACKS[0]!.items[0]!;
    const banner = summary('aube-tiers', { domain: 'banner', origin: 'community', builtin: false, price: 20, owned: true, contract });
    const bannerContracts = new Map([[contract.src, { domain: 'banner', designs: [design] }]]);
    expect(bannerOptions({ installed: [banner], contracts: bannerContracts }).map((group) => group.pack)).toEqual(['aube-tiers']);
    expect(resolveBanner({ pack: 'aube-tiers', item: design.key, origin: 'community', contract: contract.src }, bannerContracts)?.key).toBe(design.key);
  });

  test('un pack builtin retirable que l’utilisateur a désinstallé disparaît', () => {
    expect(ringOptions({ installed: [], contracts: new Map() })).toEqual([]);
  });
});

describe('un contrat d’un autre domaine ne peint pas une bannière', () => {
  test('un contrat de fonds de conversation sous l’adresse d’une bannière est ignoré', () => {
    const design = BUILTIN_BANNER_PACKS[0]!.items[0]!;
    const wallpaper = { domain: 'wallpaper', designs: [design] };
    expect(resolveBanner(officialItem('p', design.key), new Map([['abcdef0123456789.json', wallpaper]]))).toBeNull();
    expect(resolveBanner(officialItem('p', design.key), new Map([['abcdef0123456789.json', { domain: 'banner', designs: [design] }]]))?.key).toBe(design.key);
  });
});
