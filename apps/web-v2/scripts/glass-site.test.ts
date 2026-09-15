import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allFiles } from './lib/files.mjs';
import { GLASS_INVENTORY, GLASS_SITE, glassViolations, type GlassSource } from './lib/glass-site.mjs';

/**
 * #6124 — LE VERRE A UN SITE, ET UN OUTIL LE DIT.
 *
 * `glass-surface.tsx` se déclarait « site unique » en prose ; neuf surfaces
 * réécrivaient pourtant leur flou et leur opacité à la main (70 / 78 / 80 /
 * 85 / 88 / 92 %, deux rayons). Ce témoin ne mesure pas la popularité d'une
 * classe utilitaire : il nomme la PROPRIÉTÉ — une surface qui floute ce qui
 * passe dessous, ou qui peint un ton iOS translucide, EST du verre — et
 * n'admet hors du site que l'inventaire NOMMÉ, chaque entrée avec sa raison.
 */

const source = (path: string, text: string): GlassSource => ({ path, text });

describe('glassViolations — la règle, falsifiée sur des sources fabriquées', () => {
  test('le site lui-même peut tout déclarer', () => {
    const css = '.glass { backdrop-filter: blur(var(--glass-blur)); background-color: color-mix(in srgb, var(--color-ios-surface) 80%, transparent); }';
    expect(glassViolations([source(GLASS_SITE, css)])).toEqual([]);
  });

  test('une classe `backdrop-blur-*` hors du site TOMBE', () => {
    const tsx = '<span className="rounded-chip backdrop-blur-md">Hier</span>';
    expect(glassViolations([source('src/components/pill.tsx', tsx)])).toEqual([
      { path: 'src/components/pill.tsx', kind: 'blur', found: 1, allowed: 0 },
    ]);
  });

  test('une déclaration `backdrop-filter` CSS ou `backdropFilter` JS hors du site TOMBE', () => {
    const css = '.chip { backdrop-filter: blur(12px); }';
    const tsx = "<div style={{ backdropFilter: 'blur(8px)' }} />";
    expect(glassViolations([source('src/styles/chip.css', css), source('src/components/x.tsx', tsx)])).toEqual([
      { path: 'src/styles/chip.css', kind: 'blur', found: 1, allowed: 0 },
      { path: 'src/components/x.tsx', kind: 'blur', found: 1, allowed: 0 },
    ]);
  });

  test('un ton iOS TRANSLUCIDE en dur hors du site TOMBE, même sans flou', () => {
    const tsx = "style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 70%, transparent)' }}";
    expect(glassViolations([source('src/routes/y.tsx', tsx)])).toEqual([
      { path: 'src/routes/y.tsx', kind: 'translucent-tone', found: 1, allowed: 0 },
    ]);
  });

  test('un élément qui porte le verre ET réécrit son fond TOMBE', () => {
    const tsx = "<header className=\"glass sticky\" style={{ backgroundColor: 'var(--color-ios-surface)' }}>x</header>";
    expect(glassViolations([source('src/components/h.tsx', tsx)])).toEqual([
      { path: 'src/components/h.tsx', kind: 'glass-override', found: 1, allowed: 0 },
    ]);
  });

  test('la classe de verre choisie par une EXPRESSION est reconnue aussi', () => {
    const tsx =
      "<div className={`${prominent ? 'glass-prominent' : 'glass'} rounded-card`} style={{ backgroundColor: 'red' }} />";
    expect(glassViolations([source('src/components/g.tsx', tsx)])).toEqual([
      { path: 'src/components/g.tsx', kind: 'glass-override', found: 1, allowed: 0 },
    ]);
  });

  test('une densité `--glass-*` posée localement contourne le site et TOMBE', () => {
    const tsx = "<nav className=\"glass\" style={{ '--glass-density': '60%' } as CSSProperties} />";
    expect(glassViolations([source('src/components/n.tsx', tsx)])).toEqual([
      { path: 'src/components/n.tsx', kind: 'glass-override', found: 1, allowed: 0 },
    ]);
  });

  test('un fond qui n’est pas celui de l’élément de verre ne compte pas', () => {
    const tsx =
      "<header className=\"glass\"><span style={{ backgroundColor: 'var(--accent)' }}>•</span></header>";
    expect(glassViolations([source('src/components/h.tsx', tsx)])).toEqual([]);
  });

  test('la PROSE ne compte pas : un commentaire qui cite `backdrop-blur-xl` ou `backdrop-filter:` n’est pas une surface', () => {
    const tsx = '/* l’ancien `backdrop-blur-xl`, `backdrop-filter: blur()` */\n// backdrop-blur-md\nconst a = 1;';
    expect(glassViolations([source('src/lib/z.ts', tsx)])).toEqual([]);
  });

  test('une entrée d’inventaire tolère EXACTEMENT son compte, pas un de plus', () => {
    const css = '.veil { backdrop-filter: blur(16px); } .other { backdrop-filter: blur(4px); }';
    const inventory = { 'src/styles/veil.css': { blur: { count: 1, reason: 'un voile, pas une surface' } } };
    expect(glassViolations([source('src/styles/veil.css', css)], inventory)).toEqual([
      { path: 'src/styles/veil.css', kind: 'blur', found: 2, allowed: 1 },
    ]);
  });

  test('une entrée d’inventaire devenue fausse (compte trop HAUT) tombe aussi — l’inventaire ne ment pas longtemps', () => {
    const inventory = { 'src/styles/veil.css': { blur: { count: 1, reason: 'un voile' } } };
    expect(glassViolations([source('src/styles/veil.css', '.veil { color: red; }')], inventory)).toEqual([
      { path: 'src/styles/veil.css', kind: 'blur', found: 0, allowed: 1 },
    ]);
  });
});

describe('le dépôt — tout le verre de web-v2 passe par son site (#6124)', () => {
  const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sources: readonly GlassSource[] = allFiles(join(APP, 'src'))
    .filter((file) => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => source(relative(APP, file), readFileSync(file, 'utf8')));

  test('le site existe et déclare la matière', () => {
    const site = sources.find((s) => s.path === GLASS_SITE);
    expect(site?.text ?? '').toContain('backdrop-filter');
  });

  test('aucune surface ne réécrit le verre hors du site ni de l’inventaire nommé', () => {
    expect(glassViolations(sources)).toEqual([]);
  });

  test('chaque entrée de l’inventaire désigne un fichier qui existe', () => {
    const paths = new Set(sources.map((s) => s.path));
    expect(Object.keys(GLASS_INVENTORY).filter((path) => !paths.has(path))).toEqual([]);
  });

  test('chaque entrée de l’inventaire porte sa raison', () => {
    const reasons = Object.values(GLASS_INVENTORY).flatMap((entry) =>
      Object.values(entry).map((allowance) => allowance?.reason ?? ''),
    );
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((reason) => reason.length > 20)).toBe(true);
  });
});
