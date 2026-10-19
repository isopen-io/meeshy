import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAMUT_KEYS } from '../design/appearance/gamut';
import { buildAppearanceCatalog, IOS_CATALOG_PATH, IOS_CATALOG_SWIFT_PATH, renderAppearanceCatalog, renderAppearanceCatalogSwift } from '../scripts/sync-appearance-catalog-ios';

const read = (path: string): string => readFileSync(resolve(__dirname, '../../..', path), 'utf8');
const sdkCopy = (): string => read(IOS_CATALOG_PATH);

describe('la copie iOS du catalogue d’apparence (#10631, § 8.2)', () => {
  it('est identique octet pour octet à la source partagée : le Swift ne dérive pas en silence', () => {
    expect(sdkCopy()).toBe(renderAppearanceCatalog());
  });

  it('est aussi embarquée à l’identique dans le source Swift, qui ne lit aucune ressource SwiftPM', () => {
    expect(read(IOS_CATALOG_SWIFT_PATH)).toBe(renderAppearanceCatalogSwift());
    expect(read(IOS_CATALOG_SWIFT_PATH)).toContain(renderAppearanceCatalog().trimEnd());
  });

  it('porte la gamme de 16 couleurs, les 15 fonds des 5 packs, 7 bannières, 21 contours, 14 cadres de bannière et les 7 langues', () => {
    const catalog = buildAppearanceCatalog();
    expect(catalog.gamut.map((entry) => entry.key)).toEqual([...GAMUT_KEYS]);
    expect(catalog.wallpapers.flatMap((pack) => pack.designs)).toHaveLength(15);
    expect(catalog.banners.flatMap((pack) => pack.designs)).toHaveLength(7);
    expect(catalog.rings.flatMap((pack) => pack.rings)).toHaveLength(21);
    expect(catalog.bannerFrames.flatMap((pack) => pack.frames)).toHaveLength(14);
    expect(Object.keys(catalog.strings).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });
});
