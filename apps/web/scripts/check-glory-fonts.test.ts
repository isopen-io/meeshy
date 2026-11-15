import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { auditGloryFonts, collectGloryFonts, sheetImportersOf } from './check-glory-fonts.mjs';

/**
 * LE GATE DES POLICES DE CADRE (#10158, L6, § 5.6) — le budget en octets tenu
 * sur les SOURCES, avant toute émission.
 *
 * `measure-weight.mjs` compare `budgets.json › glory_fonts` aux `.woff2` que
 * Vite ÉMET — et ne compare rien tant qu'il n'en émet aucun, ce qui est le cas
 * tant qu'aucun peintre n'importe la feuille. Pendant ce temps, un septième
 * fichier `glory-*.woff2` posé sous `styles/fonts/`, une substitution qui
 * change les octets, ou une seconde feuille qui importe les faces ne faisaient
 * rougir aucun gate : la table TS se compare à elle-même, et le cliquet du
 * budget attendait une émission qui ne venait pas.
 *
 * Ce témoin tient la loi par ses deux faces : chaque écart NOMMÉ rougit, et le
 * dépôt tel qu'il est, lui, est vert.
 */

type Audit = {
  readonly files: ReadonlyArray<{ readonly file: string; readonly bytes: number }>;
  readonly budget: { readonly files: number; readonly bytes: number };
  readonly sheet: string;
  readonly importers: readonly string[];
  readonly notice: string;
  readonly precached: readonly string[];
};

const sheetFor = (files: readonly string[]): string =>
  files.map((file) => `@font-face { font-family: 'X'; src: url('./fonts/${file}') format('woff2'); }`).join('\n');

const conforme = (): Audit => {
  const files = [
    { file: 'glory-a-latin.woff2', bytes: 100 },
    { file: 'glory-b-latin.woff2', bytes: 250 },
  ] as const;
  return {
    files,
    budget: { files: 2, bytes: 350 },
    sheet: sheetFor(files.map((f) => f.file)),
    importers: ['src/lib/game-photo/glory-fonts.ts'],
    notice: 'glory-a-latin.woff2 — OFL 1.1 ; glory-b-latin.woff2 — OFL 1.1',
    precached: ['assets/index-abc.js'],
  };
};

const audit = (input: Audit): readonly string[] => auditGloryFonts(input) as readonly string[];

describe('auditGloryFonts — un cas conforme ne rend rien', () => {
  test('inventaire, octets, feuille, importeur unique, NOTICE et précache alignés ⇒ aucun écart', () => {
    expect(audit(conforme())).toEqual([]);
  });
});

describe('auditGloryFonts — chaque façon de faire peser une police est nommée', () => {
  test('un fichier de plus sur disque que dans le budget : INVENTAIRE', () => {
    const base = conforme();
    const files = [...base.files, { file: 'glory-c-latin.woff2', bytes: 5 }];
    const failures = audit({ ...base, files, sheet: sheetFor(files.map((f) => f.file)), notice: `${base.notice} glory-c-latin.woff2` });
    expect(failures.some((f) => f.includes('INVENTAIRE') && f.includes('3') && f.includes('2'))).toBe(true);
  });

  test('une substitution qui change les octets, à inventaire égal : CLIQUET exact, sans marge', () => {
    const base = conforme();
    const files = base.files.map((f) => (f.file === 'glory-b-latin.woff2' ? { ...f, bytes: 251 } : f));
    const failures = audit({ ...base, files });
    expect(failures.some((f) => f.includes('CLIQUET') && f.includes('351') && f.includes('350'))).toBe(true);
  });

  test('un fichier sur disque qu’aucune @font-face ne sert : ORPHELIN', () => {
    const base = conforme();
    const failures = audit({ ...base, sheet: sheetFor(['glory-a-latin.woff2']) });
    expect(failures.some((f) => f.includes('ORPHELIN') && f.includes('glory-b-latin.woff2'))).toBe(true);
  });

  test('une @font-face qui nomme un fichier absent : la famille est proposée et personne ne la peint', () => {
    const base = conforme();
    const failures = audit({ ...base, sheet: sheetFor([...base.files.map((f) => f.file), 'glory-z-latin.woff2']) });
    expect(failures.some((f) => f.includes('ABSENT') && f.includes('glory-z-latin.woff2'))).toBe(true);
  });

  test('la feuille importée par un second module : l’arête qui la rapprocherait de l’entrée', () => {
    const base = conforme();
    const failures = audit({ ...base, importers: [...base.importers, 'src/main.tsx'] });
    expect(failures.some((f) => f.includes('IMPORTEUR') && f.includes('src/main.tsx'))).toBe(true);
  });

  test('la feuille importée par personne : les faces n’existent pour aucun peintre', () => {
    const failures = audit({ ...conforme(), importers: [] });
    expect(failures.some((f) => f.includes('IMPORTEUR'))).toBe(true);
  });

  test('un fichier servi que le NOTICE ne nomme pas : la redistribution perd sa condition', () => {
    const failures = audit({ ...conforme(), notice: 'glory-a-latin.woff2 — OFL 1.1' });
    expect(failures.some((f) => f.includes('NOTICE') && f.includes('glory-b-latin.woff2'))).toBe(true);
  });

  test('une police de cadre au manifeste du service worker : PRÉCACHE', () => {
    const failures = audit({ ...conforme(), precached: ['assets/glory-a-latin-h4sh.woff2'] });
    expect(failures.some((f) => f.includes('PRECACHE') && f.includes('glory-a-latin-h4sh.woff2'))).toBe(true);
  });
});

/**
 * LE RELEVÉ DES IMPORTEURS (correctif du 2026-10-22, #10158). La première
 * forme du relevé ne reconnaissait que `@/styles/glory-fonts.css` et
 * `(../)+styles/glory-fonts.css` : un `@import './glory-fonts.css';` posé dans
 * `app.css` — la feuille CRITIQUE, l'idiome exact de ses voisines — rendait
 * « importée par glory-fonts.ts seul », exit 0. Le même vert pour `?inline` et
 * pour un `import()` dynamique. La loi était testée ; le relevé ne l'était que
 * par « le dépôt tel qu'il est », qui ne peut pas tomber sur ce cas (leçon 231).
 *
 * Le relevé est donc une fonction PURE sur `{ path, source }`, et ce témoin la
 * fait tomber forme par forme : toute arête qui nomme la feuille compte, quel
 * que soit son idiome. Un faux positif rougit en nommant le fichier ; un faux
 * négatif se tait — c'est pourquoi la reconnaissance est large.
 */
type Entry = { readonly path: string; readonly source: string };
const importers = (entries: readonly Entry[]): readonly string[] => sheetImportersOf(entries) as readonly string[];
const SOLE: Entry = { path: 'src/lib/game-photo/glory-fonts.ts', source: "import '@/styles/glory-fonts.css';\nexport const x = 1;" };

describe('sheetImportersOf — toute arête qui nomme la feuille compte, quel que soit son idiome', () => {
  test('la feuille CRITIQUE qui l’importe par chemin relatif, comme ses voisines : relevée', () => {
    const app: Entry = { path: 'src/styles/app.css', source: "@import './ios.css';\n@import './glory-fonts.css';\n@import './ui.css';" };
    expect(importers([SOLE, app])).toEqual(['src/lib/game-photo/glory-fonts.ts', 'src/styles/app.css']);
  });

  test('`@import url(...)`, avec ou sans guillemets : relevé', () => {
    const a: Entry = { path: 'src/styles/a.css', source: '@import url(./glory-fonts.css);' };
    const b: Entry = { path: 'src/styles/b.css', source: '@import url("../styles/glory-fonts.css") screen;' };
    expect(importers([SOLE, a, b])).toEqual(['src/lib/game-photo/glory-fonts.ts', 'src/styles/a.css', 'src/styles/b.css']);
  });

  test('un import TS avec suffixe Vite (`?inline`, `?url`) : relevé', () => {
    const inline: Entry = { path: 'src/lib/zz-probe.ts', source: "import s from '@/styles/glory-fonts.css?inline';\nexport { s };" };
    const url: Entry = { path: 'src/lib/zz-url.ts', source: 'import href from "../styles/glory-fonts.css?url";\nexport { href };' };
    expect(importers([SOLE, inline, url])).toEqual(['src/lib/game-photo/glory-fonts.ts', 'src/lib/zz-probe.ts', 'src/lib/zz-url.ts']);
  });

  test('un `import()` dynamique : une arête paresseuse est encore une arête', () => {
    const lazy: Entry = { path: 'src/screens/zz.tsx', source: "export const load = () => import('@/styles/glory-fonts.css');" };
    expect(importers([SOLE, lazy])).toEqual(['src/lib/game-photo/glory-fonts.ts', 'src/screens/zz.tsx']);
  });

  test('une feuille liée depuis le document d’entrée : relevée', () => {
    const html: Entry = { path: 'index.html', source: '<link rel="stylesheet" href="/src/styles/glory-fonts.css" />' };
    expect(importers([SOLE, html])).toEqual(['index.html', 'src/lib/game-photo/glory-fonts.ts']);
  });

  test('nommer la feuille dans un commentaire n’est pas l’importer ; une autre feuille non plus', () => {
    const prose: Entry = { path: 'src/lib/a.ts', source: '// la feuille `glory-fonts.css` n’est pas dans le premier affichage\n/* @import "./glory-fonts.css" ne doit pas apparaitre ici */\nexport const a = 1;' };
    const other: Entry = { path: 'src/styles/story.css', source: "@import './story-fonts.css';" };
    expect(importers([SOLE, prose, other])).toEqual(['src/lib/game-photo/glory-fonts.ts']);
  });

  test('sans aucun importeur, le relevé est vide — et la loi le nomme', () => {
    expect(importers([{ path: 'src/main.tsx', source: "import './styles/app.css';" }])).toEqual([]);
  });
});

describe('le dépôt tel qu’il est', () => {
  test('six polices de cadre, 154 768 octets, une feuille, un importeur, un NOTICE — aucun écart', () => {
    const collected = collectGloryFonts() as Audit;
    expect(collected.files.length).toBe(6);
    expect(collected.importers).toEqual(['src/lib/game-photo/glory-fonts.ts']);
    expect(audit(collected)).toEqual([]);
  });
});
