import { describe, expect, it } from 'vitest';
import { validateCommunityAppearanceManifest } from '../community-appearance-pack';

const palette = { base: '#FFFFFF', ink: '#111111', soft: '#EEEEEE' };
const tile = (paths: unknown[]) => ({ width: 64, height: 64, scale: 1, rotation: 0, paths });
const wallpaperDesign = (key = 'dunes', paths: unknown[] = [{ d: 'M0 0 L10 10', role: 'ink', opacity: 0.08, width: 1 }]) => ({
  key,
  style: 'pattern',
  palettes: { light: palette, dark: { base: '#000000', ink: '#EEEEEE', soft: '#222222' } },
  tile: tile(paths),
  fit: 'fill',
});
const ring = (key = 'orbe') => ({ key, stroke: { style: 'solid', width: 0.05, colors: ['#FF8800'] } });

const manifest = (contract: unknown, extra: Record<string, unknown> = {}) => ({ slug: 'dunes-pack', name: 'Dunes', description: 'Des dunes', author: 'Awa', contract, ...extra });
const wallpaper = (design: unknown) => manifest({ domain: 'wallpaper', designs: [design] });

describe('la proposition d’un pack d’apparence par un tiers (#10709)', () => {
  it('accepte un pack de fonds, de bannières et de contours valides', () => {
    expect(validateCommunityAppearanceManifest('wallpaper', wallpaper(wallpaperDesign()))).toHaveProperty('manifest');
    expect(validateCommunityAppearanceManifest('banner', manifest({ domain: 'banner', designs: [wallpaperDesign()] }))).toHaveProperty('manifest');
    const rings = validateCommunityAppearanceManifest('avatar-ring', manifest({ domain: 'avatar-ring', rings: [ring()] }));
    expect('manifest' in rings && rings.manifest.itemKeys).toEqual(['orbe']);
  });

  it('refuse un contrat d’un autre domaine que celui du chemin', () => {
    const outcome = validateCommunityAppearanceManifest('banner', wallpaper(wallpaperDesign()));
    expect(outcome).toEqual({ problems: [{ path: 'contract.domain', code: 'domain-mismatch' }] });
  });

  it('refuse un motif trop dense, un chemin qui n’est pas un chemin SVG, une URL externe', () => {
    for (const d of ['M0 0', '<script>alert(1)</script>', 'url(https://evil.example/x)']) {
      const opacity = d === 'M0 0' ? 0.5 : 0.05;
      expect(validateCommunityAppearanceManifest('wallpaper', wallpaper(wallpaperDesign('x', [{ d, role: 'ink', opacity }])))).toHaveProperty('problems');
    }
  });

  it('refuse toute couche animée : un tiers ne téléverse aucun fichier', () => {
    const lottie = { src: 'aaaaaaaaaaaaaaaa.json', bytes: 10, sha256: 'a'.repeat(64) };
    const outcome = validateCommunityAppearanceManifest('avatar-ring', manifest({ domain: 'avatar-ring', rings: [{ ...ring(), lottie }] }));
    expect(outcome).toEqual({ problems: [{ path: 'contract', code: 'lottie-forbidden' }] });
  });

  it('refuse un contrat qui dépasse le plafond d’octets', () => {
    const scene = { viewBox: [0, 0, 100, 100], anchor: 'bottom', paths: Array.from({ length: 6 }, () => ({ d: `M0 0 ${'L1 1 '.repeat(790)}`, role: 'ink', opacity: 0.5 })) };
    const designs = Array.from({ length: 32 }, (_, index) => ({ key: `m${index}`, style: 'illustration', palettes: wallpaperDesign().palettes, scene, fit: 'fill' }));
    const outcome = validateCommunityAppearanceManifest('wallpaper', manifest({ domain: 'wallpaper', designs }));
    expect(outcome).toEqual({ problems: [{ path: 'contract', code: 'contract-too-large' }] });
  });

  it('rend un contrat re-sérialisé : les clés inconnues tombent', () => {
    const outcome = validateCommunityAppearanceManifest('wallpaper', manifest({ domain: 'wallpaper', evil: '<svg onload=x>', designs: [{ ...wallpaperDesign(), onload: 'x' }] }));
    expect('manifest' in outcome && outcome.manifest.contractJson).not.toContain('evil');
    expect('manifest' in outcome && outcome.manifest.contractJson).not.toContain('onload');
  });

  it('refuse un nom, un slug ou un auteur invalides ou à balises', () => {
    const contract = { domain: 'wallpaper', designs: [wallpaperDesign()] };
    for (const extra of [{ slug: 'Bad Slug' }, { name: '' }, { name: '<b>x</b>' }, { author: 'x'.repeat(41) }, { author: ' MEESHY ' }, { description: 5 }]) {
      expect(validateCommunityAppearanceManifest('wallpaper', manifest(contract, extra))).toHaveProperty('problems');
    }
    expect(validateCommunityAppearanceManifest('wallpaper', 'x')).toEqual({ problems: [{ path: '', code: 'not-an-object' }] });
  });
});
