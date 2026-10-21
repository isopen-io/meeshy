import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { GLORY_FRAME_FONTS } from '@meeshy/shared/types/glory-frame-format';

import { GLORY_FONT_FACES, gloryTextFace, loadGloryFonts, textScript } from './glory-fonts';

/**
 * LES POLICES DES CADRES DE GLOIRE (#10158, L6, § 5.6) — servies sans peser sur
 * le premier affichage : six fichiers latins pris tels que Google Fonts les
 * publie, déclarés par une feuille que SEUL le module des polices importe, et
 * attendus par `document.fonts.load` avant toute peinture. Tout texte qui
 * n'est pas latin prend la pile système, choisie par ses plages Unicode.
 */

const HERE = new URL('.', import.meta.url).pathname;
const SRC = join(HERE, '..', '..');
const STYLES_DIR = join(SRC, 'styles');
const SHEET = readFileSync(join(STYLES_DIR, 'glory-fonts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FACES = SHEET.split('@font-face').slice(1);

describe('la liste fermée des polices de cadre', () => {
  test('chaque famille que le contrat d’un cadre peut nommer a sa face, et aucune autre', () => {
    expect(Object.keys(GLORY_FONT_FACES).sort()).toEqual([...GLORY_FRAME_FONTS].sort());
  });

  test('chaque fichier pèse EXACTEMENT ce que la table déclare — remplacer une police rouvre ce nombre', () => {
    const faces = Object.values(GLORY_FONT_FACES).flatMap((family) => family.files);
    const mesure = Object.fromEntries(faces.map((face) => [face.file, statSync(join(STYLES_DIR, 'fonts', face.file)).size]));
    expect(mesure).toEqual(Object.fromEntries(faces.map((face) => [face.file, face.bytes])));
  });

  test('les fichiers propres aux cadres portent le préfixe glory- (le budget les compte à part des polices de story)', () => {
    const own = Object.values(GLORY_FONT_FACES).flatMap((family) => family.files.filter((face) => !face.shared));
    expect(own.length).toBe(6);
    for (const face of own) expect(face.file.startsWith('glory-')).toBe(true);
  });

  test('la feuille déclare une face par fichier, chacune en swap et bornée au latin', () => {
    const files = Object.values(GLORY_FONT_FACES).flatMap((family) => family.files);
    expect(FACES.length).toBe(files.length);
    for (const face of files) {
      const block = FACES.find((candidate) => candidate.includes(`fonts/${face.file}`));
      expect({ file: face.file, found: block !== undefined }).toEqual({ file: face.file, found: true });
      expect(block).toContain(`font-weight: ${face.weight};`);
      expect(block).toContain('font-display: swap;');
      expect(block).toContain('unicode-range: U+0000-00FF');
    }
  });

  test('le NOTICE couvre chaque police servie, et dit le nom réservé de Cinzel Decorative', () => {
    const notice = readFileSync(join(STYLES_DIR, 'fonts', 'NOTICE.md'), 'utf8');
    const absents = Object.entries(GLORY_FONT_FACES).flatMap(([family, { files }]) =>
      files.filter((face) => !notice.includes(family) || !notice.includes(face.file)).map((face) => face.file),
    );
    expect(absents).toEqual([]);
    expect(notice).toContain('Reserved Font Name');
  });
});

describe('le texte qui n’est pas latin prend la pile système (D10)', () => {
  const slot = { family: 'Cinzel', weight: 700, style: 'normal', size: 40, tracking: 2 } as const;

  test('les plages Unicode décident, jamais la langue de l’interface', () => {
    expect(textScript('Nouveau rang · Voix II')).toBe('latin');
    expect(textScript('Ça déménage — Œuvre 2026 !')).toBe('latin');
    expect(textScript('مرحبا')).toBe('arabic');
    expect(textScript('Привет')).toBe('other');
    expect(textScript('שלום')).toBe('other');
    expect(textScript('你好')).toBe('other');
    expect(textScript('Γειά')).toBe('other');
    expect(textScript('नमस्ते')).toBe('other');
    expect(textScript('Bravo 🔥')).toBe('other');
  });

  test('un titre latin se peint dans la famille du cadre, puis la pile native', () => {
    const face = gloryTextFace(slot, 'Nouveau rang', 40);
    expect(face.font).toBe('normal 700 40px "Cinzel", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif');
    expect(face.tracking).toBe(2);
    expect(face.system).toBe(false);
  });

  test('cyrillique, CJK, hébreu : la pile système, à la même graisse', () => {
    for (const text of ['Привет', '你好', 'שלום']) {
      const face = gloryTextFace(slot, text, 40);
      expect(face.system).toBe(true);
      expect(face.font).not.toContain('Cinzel');
      expect(face.font).toContain(' 700 40px ');
    }
  });

  test('l’arabe : la pile système, sans interlettrage ni capitales forcées', () => {
    const face = gloryTextFace(slot, 'مرحبا', 40);
    expect(face.system).toBe(true);
    expect(face.tracking).toBe(0);
    expect(face.uppercase).toBe(false);
  });
});

describe('les polices sont attendues avant la peinture, jamais au premier affichage', () => {
  test('seules les faces latines demandées sont chargées, une fois chacune', async () => {
    const asked: string[] = [];
    await loadGloryFonts(
      [
        { family: 'Cinzel', weight: 700, style: 'normal' },
        { family: 'Cinzel', weight: 700, style: 'normal' },
        { family: 'Manrope', weight: 800, style: 'normal' },
      ],
      { load: async (font: string) => (asked.push(font), []) },
    );
    expect(asked).toEqual(['normal 700 40px "Cinzel"', 'normal 800 40px "Manrope"']);
  });

  test('un chargement qui échoue ne lève pas ; sans document.fonts, rien à attendre', async () => {
    await loadGloryFonts([{ family: 'Fraunces', weight: 700, style: 'normal' }], { load: async () => Promise.reject(new Error('réseau')) });
    await loadGloryFonts([{ family: 'Fraunces', weight: 700, style: 'normal' }], undefined);
    expect(true).toBe(true);
  });

  /**
   * L'ARÊTE D'IMPORT (leçon 589) : aucun module atteint STATIQUEMENT depuis
   * l'entrée (`main.tsx`) n'importe la feuille ni le module des polices de
   * cadre. Un `import()` est une arête paresseuse, il ne compte pas.
   */
  test('ni la feuille ni le module des polices ne sont atteints statiquement par l’entrée', () => {
    const STATIC = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
    const resolveSpecifier = (from: string, specifier: string): string | null => {
      const base = specifier.startsWith('@/') ? join(SRC, specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null;
      if (base === null) return null;
      const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'), base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')];
      return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
    };
    const seen = new Set<string>();
    const queue = [join(SRC, 'main.tsx')];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      if (!/\.(tsx?|css)$/.test(file) || file.endsWith('.css')) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(STATIC)) {
        const target = resolveSpecifier(file, match[1] ?? match[2] ?? '');
        if (target !== null) queue.push(target);
      }
    }
    expect(seen.size).toBeGreaterThan(20);
    const reached = [...seen].filter((file) => /glory-fonts\.(ts|css)$/.test(file));
    expect(reached).toEqual([]);
  });
});
