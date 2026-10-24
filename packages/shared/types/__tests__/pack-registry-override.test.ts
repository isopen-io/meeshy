/**
 * #11275 — l'administration SURCHARGE un pack du registre versionné, sans
 * déploiement : masqué, ordre, prix, fenêtre, ciblage. La surcharge ne crée
 * jamais un pack et ne contourne aucune loi du registre : l'entrée fusionnée
 * repasse par `PackIndexEntrySchema`, et une fusion illégale est refusée.
 */
import { describe, expect, it } from 'vitest';
import { parsePackIndex } from '../content-pack-index';
import { PackRegistryOverrideSchema, applyPackOverride, mergePackOverrides } from '../pack-registry-override';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const asset = (prefix: string, ext = 'webp') => ({ src: `${prefix}.${ext}`, bytes: 1200, sha256: sha(prefix) });
const entryOf = (over: Record<string, unknown> = {}) => {
  const [entry] = parsePackIndex([{
    slug: 'fond-ete', domain: 'wallpaper', origin: 'official', version: 1, order: 4, installedByDefault: false, removable: true, hidden: false,
    contractSchema: 1, cover: asset('a1b2c3d4e5f60718'), preview: null, contract: asset('c1b2c3d4e5f60718', 'json'),
    strings: { fr: asset('d1b2c3d4e5f60718', 'json') }, downloadBytes: { story: 1_800_000, square: null },
    names: { fr: { name: 'Fond d’été', description: 'Un fond solaire.' } }, ...over,
  }]).entries;
  if (entry === undefined) throw new Error('entrée de base illisible');
  return entry;
};

describe('applyPackOverride', () => {
  it('masque, réordonne, met à prix, date et cible un pack', () => {
    const merged = applyPackOverride(entryOf(), {
      hidden: true, order: 0, price: 30,
      availability: { endsAt: '2026-12-31T00:00:00.000Z' },
      targeting: { countries: ['CM'] },
    });
    expect(merged).toMatchObject({ slug: 'fond-ete', hidden: true, order: 0, price: 30, availability: { endsAt: '2026-12-31T00:00:00.000Z' }, targeting: { countries: ['CM'] } });
  });

  it('`null` retire un prix, une fenêtre ou un ciblage', () => {
    const merged = applyPackOverride(entryOf({ price: 40, availability: { endsAt: '2026-12-31T00:00:00.000Z' } }), { price: null, availability: null });
    expect(merged).not.toBeNull();
    expect(merged?.price).toBeUndefined();
    expect(merged?.availability).toBeUndefined();
  });

  it('refuse une fusion qui viole une loi du registre : un prix sur un pack intégré', () => {
    expect(applyPackOverride(entryOf({ origin: 'builtin', installedByDefault: true }), { price: 10 })).toBeNull();
  });

  it('ne touche jamais à l’identité, au contenu ni à la version du pack', () => {
    const parsed = PackRegistryOverrideSchema.safeParse({ slug: 'autre', contract: asset('ffffffffffffffff', 'json'), version: 9, hidden: true });
    expect(parsed.success).toBe(false);
  });
});

describe('mergePackOverrides', () => {
  it('un correctif s’ajoute à la surcharge existante ; `undefined` garde, `null` retire', () => {
    expect(mergePackOverrides({ hidden: true, price: 30 }, { price: null, order: 2 })).toEqual({ hidden: true, price: null, order: 2 });
  });
});
