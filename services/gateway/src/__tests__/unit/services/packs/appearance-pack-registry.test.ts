/**
 * Les registres GÉNÉRÉS des packs d'apparence (#10632, § 6) lus par le VRAI
 * `loadPackIndex` : quatre packs de fonds (14 modèles) installés comme la spec
 * le dit, un pack de bannières, un pack de contours dont l'usage est `avatar` ;
 * chaque fichier référencé existe, a la bonne empreinte et est servi ; le pack
 * d'exemple PAYANT n'existe que sous `PACK_SAMPLES=1`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadPackIndex } from '../../../../services/packs/PackIndex';

const GATEWAY = resolve(__dirname, '../../../../..');
const DESIGN = resolve(GATEWAY, '../../packages/shared/design');
const ASSETS = join(GATEWAY, 'assets/packs');

const load = (env: NodeJS.ProcessEnv = {}) => loadPackIndex([DESIGN], env, ASSETS);

describe('registres d’apparence générés', () => {
  const index = load();

  it('se lisent sans entrée refusée', () => {
    expect(index.rejected).toBe(0);
  });

  it('servent les quatre packs de fonds, « Essentiels » installé par défaut et non retirable', () => {
    const wallpapers = index.entries('wallpaper');

    expect(wallpapers.map((pack) => pack.slug)).toEqual(['essentiels', 'heritages', 'nature-et-ciel', 'illustrations', 'animes']);
    expect(wallpapers.map((pack) => [pack.installedByDefault, pack.removable])).toEqual([[true, false], [false, true], [false, true], [false, true], [true, true]]);
    expect(wallpapers.every((pack) => pack.origin === 'builtin' && pack.price === undefined)).toBe(true);
  });

  it('porte 15 modèles de fonds, 7 bannières et 7 contours, clés lues dans les contrats vérifiés', () => {
    const count = (domain: 'wallpaper' | 'banner' | 'avatar-ring') => index.entries(domain).reduce((sum, pack) => sum + index.itemKeys(pack).length, 0);

    expect(count('wallpaper')).toBe(15);
    expect(count('banner')).toBe(7);
    expect(count('avatar-ring')).toBe(7);
    expect(index.itemKeys(index.entries('wallpaper')[0])).toEqual(['monogramme', 'chevrons', 'aurore', 'maille']);
  });

  it('les contours déclarent l’usage libre sur la seule surface avatar', () => {
    expect(index.entries('avatar-ring')[0].usage).toEqual({ kind: 'free', surfaces: ['avatar'] });
  });

  it('chaque fichier référencé existe, a l’empreinte déclarée et est servi par le magasin', () => {
    const entries = (['wallpaper', 'banner', 'avatar-ring'] as const).flatMap((domain) => index.entries(domain));
    const refs = entries.flatMap((entry) => [entry.cover, entry.contract, ...Object.values(entry.strings)]);

    expect(refs.length).toBeGreaterThan(0);
    refs.forEach((ref) => {
      const path = join(ASSETS, ref.src);
      expect(existsSync(path)).toBe(true);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(ref.sha256);
      expect(index.isServedAsset(ref.src)).toBe(true);
    });
  });

  it('chaque couche Lottie d’un contrat d’apparence est servie par le magasin (#10638) — sans quoi iOS, qui la télécharge, reste à l’image fixe', () => {
    const entries = (['wallpaper', 'banner', 'avatar-ring'] as const).flatMap((domain) => index.entries(domain));
    const lottieRefs = entries.flatMap((entry) => {
      const contract = JSON.parse(readFileSync(join(ASSETS, entry.contract.src), 'utf8')) as {
        readonly designs?: readonly { readonly lottie?: { readonly src: string; readonly sha256: string } }[];
        readonly rings?: readonly { readonly lottie?: { readonly src: string; readonly sha256: string } }[];
      };
      return [...(contract.designs ?? []), ...(contract.rings ?? [])].flatMap((item) => (item.lottie ? [item.lottie] : []));
    });

    expect(lottieRefs.map((ref) => ref.src).sort()).toEqual(['b19ebab0f4cfeed8.json', 'cad11fe66d4fc9ec.json', 'ec52a7f12af8a193.json']);
    lottieRefs.forEach((ref) => {
      const path = join(ASSETS, ref.src);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(ref.sha256);
      expect(index.isServedAsset(ref.src)).toBe(true);
    });
  });

  it('les sept langues nomment le pack et ses modèles', () => {
    const entry = index.entries('wallpaper')[0];

    expect(Object.keys(entry.names).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
    const english = JSON.parse(readFileSync(join(ASSETS, entry.strings.en?.src ?? ''), 'utf8')) as Record<string, string>;
    expect(english['monogramme']).toBeTruthy();
  });

  it('le pack d’exemple PAYANT n’est lu que sous PACK_SAMPLES=1', () => {
    expect(index.entries('wallpaper').some((pack) => pack.slug === 'exemple-prestige')).toBe(false);

    const staging = load({ PACK_SAMPLES: '1' });
    const sample = staging.entries('wallpaper').find((pack) => pack.slug === 'exemple-prestige');

    expect(sample).toMatchObject({ origin: 'official', price: 20, installedByDefault: false, removable: true });
    expect(staging.itemKeys(sample as never)).toEqual(['aurore', 'maille']);
    expect(staging.rejected).toBe(0);
  });
});
