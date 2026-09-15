import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allFiles } from './files.mjs';
import {
  GLASS_CONTRAST_INVENTORY,
  derivedGlassInkPairs,
  glassContrastAudit,
  glassContrastCoverage,
  glassInkUsages,
  glassWorstCaseContrast,
  loadColorAliasMap,
  loadGlassDensities,
  loadIosSchemes,
  resolveColor,
  wcagContrastRatio,
} from './glass-contrast.mjs';

/**
 * #6308 — LE CONTRASTE DU VERRE EST GARDÉ PAR UN TÉMOIN, PAS SEULEMENT PAR
 * UNE MESURE ÉCRITE EN PROSE (D-51).
 *
 * Le premier bloc REJOUE le tableau de `styles/glass.css` sur des valeurs
 * FABRIQUÉES (le formule, isolée de tout fichier réel) — c'est lui qui prouve
 * que la formule elle-même est correcte, falsifiable indépendamment d'une
 * régression future du dépôt. Le second bloc applique cette formule aux
 * fichiers RÉELS (`packages/design-tokens/ios.css`, `styles/glass.css`) :
 * c'est lui le gate.
 */

describe('wcagContrastRatio — reproduit EXACTEMENT le tableau de D-51 (formule falsifiée)', () => {
  const surfaceLight = { r: 0xff, g: 0xff, b: 0xff, a: 1 };
  const cardLight = { r: 0xf8, g: 0xf7, b: 0xff, a: 1 };
  const dayInkLight = { r: 0x43, g: 0x38, b: 0xca, a: 1 }; // indigo-700
  const inkLight = { r: 0x1e, g: 0x1b, b: 0x4b, a: 1 };

  const surfaceDark = { r: 0x09, g: 0x09, b: 0x0b, a: 1 };
  const cardDark = { r: 0x13, g: 0x11, b: 0x1c, a: 1 };
  const dayInkDark = { r: 0xc7, g: 0xd2, b: 0xfe, a: 1 }; // indigo-200
  const inkDark = { r: 0xee, g: 0xf2, b: 0xff, a: 1 };

  const PILULE_ROWS: ReadonlyArray<readonly [number, number, number]> = [
    [70, 3.54, 4.68],
    [78, 4.4, 6.29],
    [80, 4.64, 6.78],
    [92, 6.21, 10.24],
  ];
  for (const [densityPercent, expectedLight, expectedDark] of PILULE_ROWS) {
    test(`pilule de jour (day-ink/card) à ${densityPercent} % — clair ${expectedLight}, sombre ${expectedDark}`, () => {
      const light = glassWorstCaseContrast({ tone: cardLight, ink: dayInkLight, densityPercent, scheme: 'light' });
      const dark = glassWorstCaseContrast({ tone: cardDark, ink: dayInkDark, densityPercent, scheme: 'dark' });
      expect(light).toBeCloseTo(expectedLight, 2);
      expect(dark).toBeCloseTo(expectedDark, 2);
    });
  }

  const ENTETE_ROWS: ReadonlyArray<readonly [number, number, number]> = [
    [70, 7.58, 6.89],
    [78, 9.45, 9.38],
    [80, 9.95, 10.12],
    [92, 13.36, 15.11],
  ];
  for (const [densityPercent, expectedLight, expectedDark] of ENTETE_ROWS) {
    test(`en-tête (ink/surface) à ${densityPercent} % — clair ${expectedLight}, sombre ${expectedDark}`, () => {
      const light = glassWorstCaseContrast({ tone: surfaceLight, ink: inkLight, densityPercent, scheme: 'light' });
      const dark = glassWorstCaseContrast({ tone: surfaceDark, ink: inkDark, densityPercent, scheme: 'dark' });
      expect(light).toBeCloseTo(expectedLight, 2);
      expect(dark).toBeCloseTo(expectedDark, 2);
    });
  }

  test('falsifié : baisser la pilule de jour à 78 % la fait tomber sous AA en clair, 80 % tient', () => {
    const at78 = glassWorstCaseContrast({ tone: cardLight, ink: dayInkLight, densityPercent: 78, scheme: 'light' });
    const at80 = glassWorstCaseContrast({ tone: cardLight, ink: dayInkLight, densityPercent: 80, scheme: 'light' });
    expect(at78).toBeLessThan(4.5);
    expect(at80).toBeGreaterThanOrEqual(4.5);
  });

  test('wcagContrastRatio est symétrique — l’ordre des deux couleurs ne change pas le ratio', () => {
    expect(wcagContrastRatio(inkLight, surfaceLight)).toBe(wcagContrastRatio(surfaceLight, inkLight));
  });
});

describe('resolveColor — hex, jeton et color-mix(…, transparent), récursivement', () => {
  test('un hex se résout tel quel', () => {
    expect(resolveColor('#4338ca', {})).toEqual({ r: 0x43, g: 0x38, b: 0xca, a: 1 });
  });

  test('un jeton se résout par la carte fournie', () => {
    expect(resolveColor('var(--x)', { '--x': '#ffffff' })).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test('une chaîne de jetons se résout récursivement', () => {
    const vars = { '--a': 'var(--b)', '--b': '#a5b4fc' };
    expect(resolveColor('var(--a)', vars)).toEqual({ r: 0xa5, g: 0xb4, b: 0xfc, a: 1 });
  });

  test('color-mix(in srgb, X P%, transparent) réduit l’alpha de X', () => {
    expect(resolveColor('color-mix(in srgb, #4338ca 80%, transparent)', {})).toEqual({
      r: 0x43,
      g: 0x38,
      b: 0xca,
      a: 0.8,
    });
  });

  test('un jeton absent lève plutôt que de rendre une couleur fausse en silence', () => {
    expect(() => resolveColor('var(--introuvable)', {})).toThrow();
  });
});

describe('le dépôt — le verre tient AA, mesuré depuis les fichiers réels (#6308)', () => {
  test('les densités se lisent depuis glass.css, jamais recopiées', () => {
    const densities = loadGlassDensities();
    expect(densities.glass).toBeGreaterThan(0);
    expect(densities['glass-prominent']).toBeGreaterThan(densities.glass);
  });

  test('les deux schémas se lisent depuis packages/design-tokens/ios.css', () => {
    const { dark, light } = loadIosSchemes();
    expect(dark['--ios-surface']).toBeTruthy();
    expect(light['--ios-surface']).toBeTruthy();
    expect(dark['--ios-surface']).not.toBe(light['--ios-surface']);
  });

  test('l’inventaire n’est pas vide — sinon ce témoin ne garde rien', () => {
    expect(GLASS_CONTRAST_INVENTORY.length).toBeGreaterThan(0);
  });

  test('chaque couple (ton, encre) SERVI par une surface glass* tient son seuil AA, dans les deux schémas', () => {
    const audit = glassContrastAudit();
    const failures = audit.filter((entry) => !entry.passes);
    expect(failures).toEqual([]);
  });

  test('falsifié sur le dépôt réel : abaisser `glass` à 78 % ferait tomber la pilule de jour', () => {
    const { light } = loadIosSchemes();
    const tone = resolveColor(light['--ios-surface-card']!, light);
    const ink = resolveColor(light['--ios-day-ink']!, light);
    const ratioAt78 = glassWorstCaseContrast({ tone, ink, densityPercent: 78, scheme: 'light' });
    expect(ratioAt78).toBeLessThan(4.5);
  });
});

/**
 * #6367 — L'INVENTAIRE EST NOMMÉ, PAS DÉRIVÉ : un nouveau couple (ton, encre)
 * posé sur une surface `glass*` passait le gate en SILENCE tant que personne
 * ne se souvenait d'ajouter son entrée. `glassInkUsages`/`derivedGlassInkPairs`
 * rejouent les usages RÉELS (classe `glass`/`glass-prominent`, ton hérité par
 * `glass-card`, encre peinte sur le tag ou un descendant) ; `glassContrastCoverage`
 * est le gate : tout couple dérivé absent de `GLASS_CONTRAST_INVENTORY` tombe.
 */

const source = (path: string, text: string) => ({ path, text });

describe('glassInkUsages — le couple (ton, encre) réellement peint, depuis des sources fabriquées', () => {
  test('l’encre posée sur LE TAG qui porte le verre forme un couple avec son propre ton', () => {
    const tsx = `<span className="glass glass-card rounded-chip" style={{ color: 'var(--color-day-ink)' }}>Hier</span>`;
    expect(glassInkUsages(tsx)).toEqual([{ toneAlias: '--color-ios-card', inkAlias: '--color-day-ink', density: 'glass' }]);
  });

  test('l’encre posée sur un DESCENDANT, à toute profondeur, hérite du ton de l’ancêtre de verre', () => {
    const tsx = `
      <header className="thread-header glass">
        <div className="flex">
          <h1 style={{ color: 'var(--color-ios-ink)' }}>Titre</h1>
        </div>
      </header>`;
    expect(glassInkUsages(tsx)).toEqual([{ toneAlias: '--color-ios-surface', inkAlias: '--color-ios-ink', density: 'glass' }]);
  });

  test('`glass-prominent` est une densité distincte de `glass`', () => {
    const tsx = `<div className="glass-prominent glass-card"><span style={{ color: 'var(--color-ios-ink)' }}>x</span></div>`;
    expect(glassInkUsages(tsx)).toEqual([{ toneAlias: '--color-ios-card', inkAlias: '--color-ios-ink', density: 'glass-prominent' }]);
  });

  test('`glass-accent` est HORS dérivation — sa valeur varie par conversation (D-51)', () => {
    const tsx = `<button className="glass glass-accent"><span style={{ color: 'var(--color-ios-ink)' }}>x</span></button>`;
    expect(glassInkUsages(tsx)).toEqual([]);
  });

  test('une encre HORS du verre (aucun ancêtre `glass*`) ne forme aucun couple', () => {
    const tsx = `<div className="rounded-card"><span style={{ color: 'var(--color-ios-ink)' }}>x</span></div>`;
    expect(glassInkUsages(tsx)).toEqual([]);
  });

  test('un enfant sorti du verre (balise fermante) ne porte plus son ton', () => {
    const tsx = `
      <div>
        <header className="glass"><span>x</span></header>
        <p style={{ color: 'var(--color-ios-ink)' }}>hors du verre</p>
      </div>`;
    expect(glassInkUsages(tsx)).toEqual([]);
  });

  test('un générique TypeScript (`useState<string>`) n’ouvre pas un tag et ne casse pas la profondeur', () => {
    const tsx = `
      function C() {
        const [x] = useState<string>('a');
        return <header className="glass"><span style={{ color: 'var(--color-ios-ink)' }}>{x}</span></header>;
      }`;
    expect(glassInkUsages(tsx)).toEqual([{ toneAlias: '--color-ios-surface', inkAlias: '--color-ios-ink', density: 'glass' }]);
  });

  test('un élément auto-fermant ne pousse aucun cadre — il ne peut pas avoir de descendant', () => {
    const tsx = `<header className="glass" /><span style={{ color: 'var(--color-ios-ink)' }}>hors du verre</span>`;
    expect(glassInkUsages(tsx)).toEqual([]);
  });
});

describe('derivedGlassInkPairs / glassContrastCoverage — la garde, falsifiée', () => {
  test('un couple hors du schéma iOS (`--accent`, une couleur sémantique) sort de la dérivation', () => {
    const tsx = `<header className="glass"><span style={{ color: 'var(--accent)' }}>x</span></header>`;
    expect(derivedGlassInkPairs([source('src/components/x.tsx', tsx)])).toEqual([]);
  });

  test('un couple neuf, absent de l’inventaire, FAIT ROUGIR la garde — le défaut que #6367 corrige', () => {
    const tsx = `<div className="glass-prominent"><span style={{ color: 'var(--color-ios-ink-3)' }}>x</span></div>`;
    const violations = glassContrastCoverage([source('src/components/fabrique.tsx', tsx)]);
    expect(violations).toEqual([
      { tone: '--ios-surface', ink: '--ios-ink-3', density: 'glass-prominent', sites: ['src/components/fabrique.tsx'] },
    ]);
  });

  test('un couple déjà déclaré dans l’inventaire ne rougit pas', () => {
    const tsx = `<span className="glass glass-card" style={{ color: 'var(--color-day-ink)' }}>Hier</span>`;
    expect(glassContrastCoverage([source('src/components/thread-chrome.tsx', tsx)])).toEqual([]);
  });

  test('le même couple, deux fichiers, ne rougit qu’une fois et cite les DEUX sites', () => {
    const tsx = `<div className="glass-prominent"><span style={{ color: 'var(--color-ios-ink-3)' }}>x</span></div>`;
    const violations = glassContrastCoverage([source('src/a.tsx', tsx), source('src/b.tsx', tsx)]);
    expect(violations).toEqual([{ tone: '--ios-surface', ink: '--ios-ink-3', density: 'glass-prominent', sites: ['src/a.tsx', 'src/b.tsx'] }]);
  });
});

describe('le dépôt — tout couple (ton, encre) posé sur une surface glass* est déclaré (#6367)', () => {
  const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const sources = allFiles(join(APP, 'src'))
    .filter((file) => /\.tsx$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => source(relative(APP, file), readFileSync(file, 'utf8')));

  test('la table d’alias `--color-*` → `--ios-*` existe et couvre l’encre/le ton de l’inventaire', () => {
    const aliases = loadColorAliasMap();
    expect(aliases['--color-ios-ink']).toBe('--ios-ink');
    expect(aliases['--color-ios-card']).toBe('--ios-surface-card');
  });

  test('aucun couple (ton, encre) réellement peint sur du verre n’échappe à l’inventaire nommé', () => {
    expect(glassContrastCoverage(sources)).toEqual([]);
  });
});
