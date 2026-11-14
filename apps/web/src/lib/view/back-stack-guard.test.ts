import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **TOUTE COUCHE ENTRE DANS LA PILE DU RETOUR** (#18460).
 *
 * Le retour matériel Android (`webView.goBack()`), le bouton Précédent et Échap
 * ne ferment que la couche du dessus parce que chaque couche passe par
 * `useBackDismiss` (`lib/view/use-back-dismiss.ts`) : une feuille `Sheet`, un
 * `<dialog>`, `SendSheetFrame`, ou un menu `useRovingMenu`. Une couche montée à
 * la main hors de cette pile laisse le retour quitter l'écran, et un écouteur
 * Échap posé sur `window` ou `document` ferme deux niveaux d'un coup. La dette
 * se compte, elle ne monte pas : chaque couche qui rejoint la pile abaisse sa
 * base dans le même commit.
 *
 * Les commentaires sont retirés avant la mesure : citer `useBackDismiss` dans un
 * commentaire ne fait pas entrer une couche dans la pile.
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url));

const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sources = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === join(SRC, 'components', 'kit') ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });

const DECLARES_LAYER = /role=["{']*(?:dialog|alertdialog|menu)\b|aria-modal/;
const JOINS_STACK = /\buseBackDismiss\s*\(|\buseRovingMenu\s*\(|<Sheet\b|\bSendSheetFrame\b|<dialog\b/;
const ESCAPE_LISTENER = /\b(?:window|document)\.addEventListener\(\s*['"]keydown['"]/g;

const code = (file: string): string => stripComments(readFileSync(file, 'utf8'));
const relative = (file: string): string => file.slice(SRC.length);

const layersOutsideStack = (): readonly string[] =>
  sources(SRC)
    .filter((file) => {
      const text = code(file);
      return DECLARES_LAYER.test(text) && !JOINS_STACK.test(text);
    })
    .map(relative)
    .sort();

const escapeListeners = (): readonly string[] =>
  sources(SRC)
    .filter((file) => !file.endsWith(join('lib', 'view', 'use-back-dismiss.ts')))
    .flatMap((file) => {
      const text = code(file);
      if (!text.includes("'Escape'") && !text.includes('"Escape"')) return [];
      return (text.match(ESCAPE_LISTENER) ?? []).map(() => relative(file));
    })
    .sort();

/**
 * LES BASES DU JOUR, mesurées le 2026-11-14 sur la tête de `dev` (commentaires
 * retirés) : 24 fichiers déclarent une couche hors de la pile, et 19 écouteurs
 * Échap sont posés sur `window` ou `document` (dont deux dans `admin-shell` et
 * celui que `useRovingMenu` garde pour `layer: false`). Le relevé de l'audit en
 * comptait 26 : il lisait `role="menuitem"` comme un menu, et prenait ainsi
 * `reaction-rail` (des barreaux, sans couche) et `shortcut-scope` (une liste de
 * sélecteurs) pour des couches.
 */
const LAYERS_BASE = 24;
const ESCAPE_BASE = 19;

describe('aucune couche nouvelle n’échappe à la pile du retour', () => {
  test(`les couches hors de la pile ne dépassent pas ${LAYERS_BASE} fichiers`, () => {
    const sites = layersOutsideStack();
    expect({ compte: sites.length, base: LAYERS_BASE, sites: sites.length > LAYERS_BASE ? sites : [] }).toEqual({
      compte: sites.length,
      base: LAYERS_BASE,
      sites: [],
    });
  });

  test('la base des couches colle au compte réel — aucune marge dormante', () => {
    expect(layersOutsideStack()).toHaveLength(LAYERS_BASE);
  });

  test(`les écouteurs Échap sur window ou document ne dépassent pas ${ESCAPE_BASE}`, () => {
    const sites = escapeListeners();
    expect({ compte: sites.length, base: ESCAPE_BASE, sites: sites.length > ESCAPE_BASE ? sites : [] }).toEqual({
      compte: sites.length,
      base: ESCAPE_BASE,
      sites: [],
    });
  });

  test('la base des écouteurs Échap colle au compte réel — aucune marge dormante', () => {
    expect(escapeListeners()).toHaveLength(ESCAPE_BASE);
  });

  test('le parcours atteint bien les sources, et les motifs reconnaissent ce qu’ils comptent', () => {
    expect(sources(SRC).length).toBeGreaterThan(300);
    expect(DECLARES_LAYER.test('role="menu"')).toBe(true);
    expect(DECLARES_LAYER.test('aria-modal="true"')).toBe(true);
    expect(DECLARES_LAYER.test('role="menuitem"')).toBe(false);
    expect(JOINS_STACK.test('// useBackDismiss(close)')).toBe(true);
    expect(JOINS_STACK.test(stripComments('// useBackDismiss(close)'))).toBe(false);
    expect('document.addEventListener(\'keydown\', onKey)'.match(ESCAPE_LISTENER)).toHaveLength(1);
  });
});

describe('le menu ancré partagé est une couche de la pile', () => {
  test('useRovingMenu appelle useBackDismiss, actif quand le menu est ouvert', () => {
    expect(code(join(SRC, 'lib/view/roving-menu.ts'))).toMatch(/\buseBackDismiss\s*\(\s*closeAndFocusButton\s*,\s*\{[^}]*\bactive:\s*[^}]*\bopen\b[^}]*\}\s*\)/);
  });
});
