import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **UNE MODALE OUVERTE PAR `showModal()` SORT EN MOUVEMENT** (#18362).
 *
 * `useDialogExit` et `leaveDialogAsGhost` (`lib/view/dialog-exit.ts`) jouent la sortie d'un `<dialog>`
 * par tous les chemins de fermeture. Un composant qui ouvre un dialogue à la main sans eux le fait
 * disparaître sec. La dette se compte, elle ne monte pas : chaque `<dialog>` fait main qui adopte le
 * crochet, ou passe par `Sheet`, abaisse le plafond dans le même commit.
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url));

const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sources = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });

const OPENS_MODAL = /\.showModal\s*(?:\?\.)?\s*\(/;
const PLAYS_EXIT = /\b(?:useDialogExit|leaveDialogAsGhost)\s*\(/;

const dryExits = (): readonly string[] =>
  sources(SRC)
    .filter((file) => {
      const code = stripComments(readFileSync(file, 'utf8'));
      return OPENS_MODAL.test(code) && !PLAYS_EXIT.test(code);
    })
    .map((file) => file.slice(SRC.length))
    .sort();

/**
 * LE COMPTE DU JOUR. Mesuré le 2026-11-14 (commentaires retirés) : 10 fichiers ouvraient une modale sans
 * jouer sa sortie, les mêmes que l'audit sur ec7974abaa. `Sheet`, `ConfirmDialog` et `SendSheetFrame` en
 * sortent avec ce lot : 7.
 */
const PLAFOND = 7;

const read = (path: string): string => stripComments(readFileSync(join(SRC, path), 'utf8'));

describe('aucune modale nouvelle ne disparaît sec', () => {
  test(`les dialogues ouverts sans sortie jouée ne dépassent pas ${PLAFOND} fichiers`, () => {
    const sites = dryExits();
    expect({ compte: sites.length, plafond: PLAFOND, sites: sites.length > PLAFOND ? sites : [] }).toEqual({
      compte: sites.length,
      plafond: PLAFOND,
      sites: [],
    });
  });

  test('le plafond gravé colle au compte réel — aucune marge dormante', () => {
    expect(dryExits()).toHaveLength(PLAFOND);
  });

  test('le parcours atteint bien les sources — il n’est pas vide', () => {
    expect(sources(SRC).length).toBeGreaterThan(300);
    expect(OPENS_MODAL.test('dialog.showModal?.()')).toBe(true);
  });
});

describe('les trois coquilles partagées jouent leur sortie', () => {
  test('Sheet et ConfirmDialog passent par useDialogExit, SendSheetFrame par leaveDialogAsGhost', () => {
    expect(read('components/sheet.tsx')).toMatch(/\buseDialogExit\s*\(/);
    expect(read('components/confirm-dialog.tsx')).toMatch(/\buseDialogExit\s*\(/);
    expect(read('components/send-sheet-frame.tsx')).toMatch(/\bleaveDialogAsGhost\s*\(/);
  });

  test('aucun onClick de Sheet ni de ConfirmDialog ne ferme le dialogue en direct', () => {
    for (const path of ['components/sheet.tsx', 'components/confirm-dialog.tsx']) {
      const handlers = [...read(path).matchAll(/onClick=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)].map((match) => match[1] ?? '');
      expect({ path, direct: handlers.filter((handler) => /\.close\s*\(/.test(handler)) }).toEqual({ path, direct: [] });
      expect({ path, direct: read(path).match(/ref\.current\??\.close\s*\(/g) ?? [] }).toEqual({ path, direct: [] });
    }
  });
});
