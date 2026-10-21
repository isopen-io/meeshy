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

  it('porte 15 modèles de fonds, 7 bannières, 21 contours et 14 cadres de bannière, clés lues dans les contrats vérifiés', () => {
    const count = (domain: 'wallpaper' | 'banner' | 'avatar-ring' | 'banner-frame') => index.entries(domain).reduce((sum, pack) => sum + index.itemKeys(pack).length, 0);

    expect(count('wallpaper')).toBe(15);
    expect(count('banner')).toBe(7);
    expect(count('avatar-ring')).toBe(21);
    expect(count('banner-frame')).toBe(14);
    expect(index.itemKeys(index.entries('wallpaper')[0])).toEqual(['monogramme', 'chevrons', 'aurore', 'maille']);
  });

  it('deux cadres de bannière sont installés d’office, un fixe et un animé chacun (#11165) : le sélecteur n’est jamais vide', () => {
    const preinstalled = index.entries('banner-frame').filter((pack) => pack.installedByDefault);
    expect(preinstalled.map((pack) => pack.slug)).toEqual(['cadres-haussmannien', 'cadres-ancestral']);
    expect(preinstalled.flatMap((pack) => index.itemKeys(pack))).toEqual(['haussmannien', 'haussmannien-anime', 'ancestral', 'ancestral-anime']);
  });

  it('les contours déclarent l’usage libre sur la seule surface avatar', () => {
    expect(index.entries('avatar-ring')[0].usage).toEqual({ kind: 'free', surfaces: ['avatar'] });
  });

  it('les 28 cadres photo (#10936) : sept styles, un fixe et un animé chacun, en contour d’avatar et en cadre de bannière, à installer et usage annoncé', () => {
    const styles = ['haussmannien', 'arabe', 'grec', 'ancestral', 'technologique', 'rituel', 'celte'];
    const rings = index.entries('avatar-ring').filter((pack) => pack.slug !== 'contours-essentiels' && pack.slug !== 'contours-animes');
    const frames = index.entries('banner-frame');

    expect(rings.map((pack) => pack.slug)).toEqual(styles.map((style) => `contours-${style}`));
    expect(frames.map((pack) => pack.slug)).toEqual(styles.map((style) => `cadres-${style}`));
    styles.forEach((style, at) => {
      expect(index.itemKeys(rings[at]!)).toEqual([style, `${style}-anime`]);
      expect(index.itemKeys(frames[at]!)).toEqual([style, `${style}-anime`]);
    });
    expect(frames.every((pack) => pack.usage?.kind === 'free' && pack.usage.surfaces.join() === 'banner' && pack.removable)).toBe(true);
    expect(rings.every((pack) => pack.usage?.kind === 'free' && pack.usage.surfaces.join() === 'avatar' && !pack.installedByDefault)).toBe(true);
    expect([...rings, ...frames].every((pack) => Object.keys(pack.names).length === 7)).toBe(true);
  });

  it('chaque fichier référencé existe, a l’empreinte déclarée et est servi par le magasin', () => {
    const entries = (['wallpaper', 'banner', 'avatar-ring', 'banner-frame'] as const).flatMap((domain) => index.entries(domain));
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

    expect(lottieRefs.map((ref) => ref.src).sort()).toEqual(['5aff839c02a1cfcb.json', 'b19ebab0f4cfeed8.json', 'ec52a7f12af8a193.json']);
    lottieRefs.forEach((ref) => {
      const path = join(ASSETS, ref.src);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(ref.sha256);
      expect(index.isServedAsset(ref.src)).toBe(true);
    });
  });

  it('les bannières redessinées (#11165) gardent servis le contrat et la couche d’avant : un client qui les a embarqués les lit encore', () => {
    ['d4f06b1f24165674.json', '8d457c88b17f07a9.json', 'cad11fe66d4fc9ec.json', 'c23615594f604150.webp'].forEach((src) => {
      expect(existsSync(join(ASSETS, src))).toBe(true);
      expect(index.isServedAsset(src)).toBe(true);
    });
  });

  it('le contrat servi de chaque pack de bannières EST le pack du catalogue partagé, dessin pour dessin', () => {
    const source = JSON.parse(readFileSync(join(DESIGN, 'appearance/banners/designs.json'), 'utf8')) as { packs: { slug: string; designs: unknown[] }[] };
    index.entries('banner').forEach((entry) => {
      const contract = JSON.parse(readFileSync(join(ASSETS, entry.contract.src), 'utf8')) as { designs: unknown[] };
      expect(contract.designs).toEqual(source.packs.find((pack) => pack.slug === entry.slug)?.designs);
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
