import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { auditGloryFonts, collectGloryFonts } from './check-glory-fonts.mjs';

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

describe('le dépôt tel qu’il est', () => {
  test('six polices de cadre, 154 768 octets, une feuille, un importeur, un NOTICE — aucun écart', () => {
    const collected = collectGloryFonts() as Audit;
    expect(collected.files.length).toBe(6);
    expect(collected.importers).toEqual(['src/lib/game-photo/glory-fonts.ts']);
    expect(audit(collected)).toEqual([]);
  });
});
