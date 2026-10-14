import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAMUT_KEYS } from '../design/appearance/gamut';
import { buildAppearanceCatalog, IOS_CATALOG_PATH, renderAppearanceCatalog } from '../scripts/sync-appearance-catalog-ios';

const sdkCopy = (): string => readFileSync(resolve(__dirname, '../../..', IOS_CATALOG_PATH), 'utf8');

describe('la copie iOS du catalogue d’apparence (#10631, § 8.2)', () => {
  it('est identique octet pour octet à la source partagée : le Swift ne dérive pas en silence', () => {
    expect(sdkCopy()).toBe(renderAppearanceCatalog());
  });

  it('porte la gamme de 16 couleurs, les 14 fonds des 4 packs, 6 bannières, 6 contours et les 7 langues', () => {
    const catalog = buildAppearanceCatalog();
    expect(catalog.gamut.map((entry) => entry.key)).toEqual([...GAMUT_KEYS]);
    expect(catalog.wallpapers.flatMap((pack) => pack.designs)).toHaveLength(14);
    expect(catalog.banners.flatMap((pack) => pack.designs)).toHaveLength(6);
    expect(catalog.rings.flatMap((pack) => pack.rings)).toHaveLength(6);
    expect(Object.keys(catalog.strings).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });
});
