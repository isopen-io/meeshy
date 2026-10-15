import { describe, expect, test } from 'bun:test';

import { decodeDesignPackSummary } from '../profile-decor/pack-summary';
import { bannerOptions, ringOptions } from '../profile-decor/resolve';
import { decodeShopPack } from './packs-shop';

/**
 * Un pack d'apparence d'un VENDEUR TIERS (#10709), tel que la passerelle le
 * sert (`communityAppearanceDetail`) : origine `community`, aucune couverture
 * ni aperçu, prix fixé par la modération, contrat adressé `<sha16>.json`.
 * Le critère « il apparaît dans la vitrine » se tient ici côté web.
 */
const served = (domain: 'wallpaper' | 'avatar-ring' | 'banner', extra: Record<string, unknown> = {}) => ({
  slug: 'dunes-pack',
  name: 'Dunes',
  description: 'Des dunes',
  author: 'Awa',
  builtin: false,
  status: 'approved',
  itemCount: 1,
  coverUrl: null,
  installed: false,
  installCount: 3,
  domain,
  origin: 'community',
  version: 1,
  downloadBytes: { story: 412, square: null },
  removable: true,
  names: {},
  price: 40,
  owned: false,
  preview: null,
  ...(domain === 'avatar-ring' ? { usage: { kind: 'free', surfaces: ['avatar'] } } : {}),
  ...extra,
});

const contractRef = { src: '0123456789abcdef.json', bytes: 412, sha256: `0123456789abcdef${'a'.repeat(48)}` };

describe('un pack tiers dans la vitrine web', () => {
  for (const domain of ['wallpaper', 'avatar-ring', 'banner'] as const) {
    test(`${domain} : décodé avec son auteur, son prix et sa possession, sans couverture`, () => {
      expect(decodeShopPack(domain)(served(domain))).toMatchObject({ slug: 'dunes-pack', author: 'Awa', coverUrl: null, itemCount: 1, price: 40, owned: false, removable: true });
    });
  }

  test('installé et possédé, son contrat chargé nourrit les contours et les bannières du sélecteur de décor', () => {
    const ring = decodeDesignPackSummary('avatar-ring')(served('avatar-ring', { installed: true, owned: true, contractSchema: 1, contract: contractRef }));
    const banner = decodeDesignPackSummary('banner')(served('banner', { installed: true, owned: true, contractSchema: 1, contract: contractRef }));
    expect(ring?.origin).toBe('community');
    const contracts = new Map<string, unknown>([
      [contractRef.src, { domain: 'avatar-ring', rings: [{ key: 'orbe', stroke: { style: 'solid', width: 0.05, colors: ['#FF8800'] } }] }],
    ]);
    expect(ringOptions({ installed: ring === null ? [] : [ring], contracts }).map((group) => [group.pack, group.origin, group.items.map((item) => item.ref.item)])).toEqual([
      ['dunes-pack', 'community', ['orbe']],
    ]);
    const palette = { base: '#FFFFFF', ink: '#111111', soft: '#EEEEEE' };
    const design = { key: 'dunes', style: 'pattern', palettes: { light: palette, dark: palette }, tile: { width: 64, height: 64, scale: 1, rotation: 0, paths: [{ d: 'M0 0 L10 10', role: 'ink', opacity: 0.08, width: 1 }] }, fit: 'fill' };
    const bannerContracts = new Map<string, unknown>([[contractRef.src, { domain: 'banner', designs: [design] }]]);
    expect(bannerOptions({ installed: banner === null ? [] : [banner], contracts: bannerContracts }).flatMap((group) => group.items.map((item) => item.ref))).toEqual([{ pack: 'dunes-pack', item: 'dunes' }]);
  });

  test('payant et pas encore acheté : aucun contour ne s’offre, même installé', () => {
    const ring = decodeDesignPackSummary('avatar-ring')(served('avatar-ring', { installed: true, owned: false, contractSchema: 1, contract: contractRef }));
    const contracts = new Map<string, unknown>([[contractRef.src, { domain: 'avatar-ring', rings: [{ key: 'orbe', stroke: { style: 'solid', width: 0.05, colors: ['#FF8800'] } }] }]]);
    expect(ringOptions({ installed: ring === null ? [] : [ring], contracts })).toEqual([]);
  });
});
