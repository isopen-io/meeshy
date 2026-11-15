import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAppearanceDesign, type AppearanceDesign } from '../types/appearance-design';
import { parseAvatarRingDesign } from '../types/avatar-ring-design';
import { avatarRingSvg, designTileSvg, designToSvg } from '../utils/appearance-svg';

const DIR = join(__dirname, '../design/appearance');
const read = (file: string) => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as { packs: { designs?: unknown[]; rings?: unknown[] }[] };
const designs = read('wallpapers/designs.json').packs.flatMap((pack) => pack.designs ?? []).map((raw) => parseAppearanceDesign(raw)!);
const ringList = read('avatar-rings/rings.json').packs.flatMap((pack) => pack.rings ?? []).map((raw) => parseAvatarRingDesign(raw)!);
const byKey = (key: string): AppearanceDesign => designs.find((design) => design.key === key)!;

const ACCENT = '#6366F1';
const ALLOWED = new Set(['svg', 'defs', 'rect', 'path', 'g', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'circle']);
const tagsOf = (svg: string): Set<string> => new Set([...svg.matchAll(/<([A-Za-z]+)/g)].map((match) => match[1]!));

const pattern: AppearanceDesign = {
  key: 'mini',
  style: 'pattern',
  palettes: { light: { base: '#FFFFFF', ink: '#111111', soft: '#EEEEEE' }, dark: { base: '#000000', ink: '#EEEEEE', soft: '#222222', accent: '#FF0000' } },
  tile: { width: 10, height: 10, scale: 2, rotation: 15, paths: [{ d: 'M0 0 L10 10', role: 'accent', opacity: 0.1234, width: 1 }] },
  fit: 'fill',
};

describe('le rendu de référence des fonds (#10632, § 5.1)', () => {
  it('rend la tuile d’un motif, nombres arrondis à 2 décimales, accent effectif en clair', () => {
    expect(designTileSvg({ design: pattern, scheme: 'light', accent: ACCENT })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="#FFFFFF"/><path d="M0 0 L10 10" fill="none" stroke="#6366F1" stroke-width="1" stroke-opacity="0.12"/></svg>',
    );
  });

  it('l’accent de la palette prime sur l’accent effectif quand elle en déclare un', () => {
    expect(designTileSvg({ design: pattern, scheme: 'dark', accent: ACCENT })).toContain('stroke="#FF0000"');
  });

  it('ne rend une tuile que pour un motif', () => {
    expect(designTileSvg({ design: byKey('horizon'), scheme: 'light', accent: ACCENT })).toBe('');
  });

  it('rend le fond entier d’un motif avec sa tuile répétée, mise à l’échelle et tournée', () => {
    const svg = designToSvg({ design: pattern, scheme: 'light', accent: ACCENT, width: 90, height: 190 });
    expect(svg).toContain('viewBox="0 0 90 190"');
    expect(svg).toContain('patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(15)"');
    expect(svg).toContain('<g transform="scale(2)">');
    expect(svg).toContain('fill="url(#t-mini-light-6366F1-90x190)"');
  });

  it('suit l’accent effectif : un autre accent change la sortie, le même la laisse identique', () => {
    const args = { design: byKey('maille'), scheme: 'light', width: 100, height: 200 } as const;
    expect(designToSvg({ ...args, accent: '#C2185B' })).not.toBe(designToSvg({ ...args, accent: ACCENT }));
    expect(designToSvg({ ...args, accent: ACCENT })).toBe(designToSvg({ ...args, accent: ACCENT }));
  });

  it('dérive accent-next et accent-prev de l’accent à ±30° de teinte', () => {
    const svg = designToSvg({ design: byKey('maille'), scheme: 'light', accent: '#FF0000', width: 100, height: 100 });
    expect(svg).toContain('#FF0000');
    expect(svg).toContain('#FF7F00');
    expect(svg).toContain('#FF007F');
  });

  it('ancre une illustration selon son anchor', () => {
    const bottom = designToSvg({ design: byKey('horizon'), scheme: 'light', accent: ACCENT, width: 90, height: 190 });
    const bottomEnd = designToSvg({ design: byKey('baobab'), scheme: 'light', accent: ACCENT, width: 90, height: 190 });
    expect(bottom).toContain('preserveAspectRatio="xMidYMax meet"');
    expect(bottomEnd).toContain('preserveAspectRatio="xMaxYMax meet"');
  });

  it('ne rend que des éléments attendus, jamais de script ni de lien externe', () => {
    designs.flatMap((design) => (['light', 'dark'] as const).map((scheme) => designToSvg({ design, scheme, accent: ACCENT, width: 300, height: 120 }))).forEach((svg) => {
      expect([...tagsOf(svg)].filter((tag) => !ALLOWED.has(tag))).toEqual([]);
      expect(svg).not.toMatch(/script|href|javascript|onload/i);
    });
  });

  it('deux rendus différents posés dans la même page ne partagent aucun identifiant (motif comme dégradé)', () => {
    const idsOf = (svg: string): readonly string[] => [...svg.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!);
    (['monogramme', 'aurore'] as const).forEach((key) => {
      const first = designToSvg({ design: byKey(key), scheme: 'light', accent: ACCENT, width: 90, height: 190 });
      const second = designToSvg({ design: byKey(key), scheme: 'light', accent: '#C2185B', width: 90, height: 190 });
      const third = designToSvg({ design: byKey(key), scheme: 'dark', accent: ACCENT, width: 300, height: 100 });
      expect(idsOf(first).length).toBeGreaterThan(0);
      expect(idsOf(first).filter((id) => idsOf(second).includes(id) || idsOf(third).includes(id))).toEqual([]);
      [first, second, third].forEach((svg) =>
        [...svg.matchAll(/url\(#([^)]+)\)/g)].forEach((match) => expect(idsOf(svg)).toContain(match[1])),
      );
    });
  });

  it('un accent qui n’est pas un hex #RRGGBB ne peut rien injecter dans le balisage', () => {
    const svg = designTileSvg({ design: pattern, scheme: 'light', accent: '#000"/><script>alert(1)</script><x a="' });
    expect(svg).not.toMatch(/script/i);
    expect([...tagsOf(svg)].filter((tag) => !ALLOWED.has(tag))).toEqual([]);
    expect(designTileSvg({ design: pattern, scheme: 'light', accent: '#c2185b' })).toContain('stroke="#C2185B"');
  });

  it.each(['monogramme', 'aurore', 'maille', 'seigaiha', 'horizon', 'baobab'])('instantané stable de %s', (key) => {
    expect(designToSvg({ design: byKey(key), scheme: 'light', accent: ACCENT, width: 90, height: 190 })).toMatchSnapshot();
    expect(designToSvg({ design: byKey(key), scheme: 'dark', accent: ACCENT, width: 90, height: 190 })).toMatchSnapshot();
  });
});

describe('le rendu de référence des contours (#10632, § 5.2)', () => {
  const ring = (key: string) => ringList.find((candidate) => candidate.key === key)!;

  it('rend un filet plein : un cercle à la couleur fixe, sans accent', () => {
    expect(avatarRingSvg({ ring: ring('filet'), size: 48 })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48.5" fill="none" stroke="#6366F1" stroke-width="3"/></svg>',
    );
  });

  it('rend le double filet en deux cercles, perle en points, aurore en arcs colorés', () => {
    expect((avatarRingSvg({ ring: ring('double-filet'), size: 48 }).match(/<circle/g) ?? []).length).toBe(2);
    expect(avatarRingSvg({ ring: ring('perle'), size: 48 })).toContain('stroke-linecap="round"');
    const aurore = avatarRingSvg({ ring: ring('aurore'), size: 48 });
    expect((aurore.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(aurore).toContain('#2DD4BF');
  });

  it('pose l’ornement après le trait et ne rend que des éléments attendus', () => {
    ringList.forEach((candidate) => {
      const svg = avatarRingSvg({ ring: candidate, size: 96 });
      expect([...tagsOf(svg)].filter((tag) => !ALLOWED.has(tag))).toEqual([]);
      expect(svg).toBe(avatarRingSvg({ ring: candidate, size: 96 }));
    });
    expect((avatarRingSvg({ ring: ring('laurier'), size: 96 }).match(/<path/g) ?? []).length).toBe(20);
  });

  it('instantané stable de chaque contour', () => {
    ringList.forEach((candidate) => expect(avatarRingSvg({ ring: candidate, size: 64 })).toMatchSnapshot(candidate.key));
  });
});
