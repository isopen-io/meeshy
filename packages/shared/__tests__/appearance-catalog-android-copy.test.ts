import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAMUT_KEYS } from '../design/appearance/gamut';
import { ANDROID_CATALOG_PATH, renderAppearanceCatalog } from '../scripts/sync-appearance-catalog-android';
import { buildAppearanceCatalog, IOS_CATALOG_PATH } from '../scripts/sync-appearance-catalog-ios';

const read = (path: string): string => readFileSync(resolve(__dirname, '../../..', path), 'utf8');
const androidCopy = (): string => read(ANDROID_CATALOG_PATH);

describe('la copie Android du catalogue d’apparence (#11611)', () => {
  it('est identique octet pour octet à la source partagée : le Kotlin ne dérive pas en silence', () => {
    expect(androidCopy()).toBe(renderAppearanceCatalog());
  });

  it('est aussi identique à la copie iOS : les deux plateformes lisent le même catalogue', () => {
    expect(androidCopy()).toBe(read(IOS_CATALOG_PATH));
  });

  it('porte la version 1, les 16 couleurs, 5 packs de fonds, 2 de bannières, 9 de contours, 7 de cadres et les 7 langues', () => {
    const catalog = JSON.parse(androidCopy()) as ReturnType<typeof buildAppearanceCatalog>;
    expect(catalog.version).toBe(1);
    expect(catalog.gamut.map((entry) => entry.key)).toEqual([...GAMUT_KEYS]);
    expect(catalog.wallpapers).toHaveLength(5);
    expect(catalog.banners).toHaveLength(2);
    expect(catalog.rings).toHaveLength(9);
    expect(catalog.bannerFrames).toHaveLength(7);
    expect(Object.keys(catalog.strings).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });
});
