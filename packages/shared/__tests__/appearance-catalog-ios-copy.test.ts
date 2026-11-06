import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAMUT_KEYS } from '../design/appearance/gamut';
import { effectiveEventWindow, type PackEventDeclaration } from '../utils/decoration-event-window';
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

  it('porte la gamme de 16 couleurs, les 41 fonds des 11 packs, 23 bannières, 91 contours, 80 cadres de bannière (collections Meeshy de #15158, packs de Noël — contours, fonds — et bannières assorties de #15553, offres de Noël et du Nouvel An de #16270 et #16271 compris) et les 7 langues', () => {
    const catalog = buildAppearanceCatalog();
    expect(catalog.gamut.map((entry) => entry.key)).toEqual([...GAMUT_KEYS]);
    expect(catalog.wallpapers.flatMap((pack) => pack.designs)).toHaveLength(41);
    expect(catalog.banners.flatMap((pack) => pack.designs)).toHaveLength(23);
    expect(catalog.rings.flatMap((pack) => pack.rings)).toHaveLength(91);
    expect(catalog.bannerFrames.flatMap((pack) => pack.frames)).toHaveLength(80);
    expect(Object.keys(catalog.strings).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });

  it('chaque pack porte sa fenêtre EFFECTIVE (#16447) — date écrite gardée, borne absente d’un pack d’événement dérivée — et la déclaration `event` ne voyage pas', () => {
    type Source = { readonly slug: string; readonly event?: PackEventDeclaration; readonly availability?: { readonly startsAt?: string; readonly endsAt?: string } };
    const source = (relative: string): readonly Source[] => (JSON.parse(readFileSync(resolve(__dirname, '../design/appearance', relative), 'utf8')) as { packs: readonly Source[] }).packs;
    const catalog = buildAppearanceCatalog();
    const pairs: readonly [readonly Source[], readonly object[]][] = [
      [source('wallpapers/designs.json'), catalog.wallpapers],
      [source('banners/designs.json'), catalog.banners],
      [source('avatar-rings/rings.json'), catalog.rings],
      [source('banner-frames/frames.json'), catalog.bannerFrames],
    ];
    pairs.forEach(([packs, served]) =>
      packs.forEach((pack, index) => {
        const out = served[index] as Source;
        expect({ slug: out.slug, event: 'event' in out, availability: out.availability }).toEqual({ slug: pack.slug, event: false, availability: effectiveEventWindow(pack) });
      }),
    );
  });
});
