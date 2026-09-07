#!/usr/bin/env node
/**
 * LE GATE DE BOUT EN BOUT DE LA FUSION (#5445).
 *
 * `packages/design-tokens/scripts/generate-from-ios.mjs --check` prouve que
 * le CSS généré n'a pas dérivé de Swift. Ça ne prouve pas que le navigateur
 * PEINT ces valeurs-là : entre les deux il y a un import, un `@theme inline`,
 * la cascade et deux classes de schéma, et n'importe lequel peut avaler un
 * jeton sans rien casser de visible — un nom mal orthographié rend une couleur
 * vide, pas une erreur.
 *
 * Ce script ferme donc la boucle par l'autre bout : il lit dans le navigateur
 * la valeur RÉSOLUE de chaque jeton, dans les DEUX schémas, et l'oppose à ce
 * que les sources Swift déclarent. C'est la même leçon que le cycle 122 du
 * dépôt — un correctif dont la valeur n'atteint aucun lecteur n'a corrigé
 * personne : il ne suffit pas qu'un résolveur élise la bonne valeur, il faut
 * savoir QUI l'affiche.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const SWIFT = join(HERE, '../../../packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift');
const BASE = process.env.BASE ?? 'http://localhost:4173';

const swift = readFileSync(SWIFT, 'utf8');
const hexOf = (name) => {
  const m = new RegExp(`public static let ${name} = Color\\(hex: "([0-9A-Fa-f]{6})"\\)`).exec(swift);
  if (!m) throw new Error(`Constante Swift introuvable : ${name}`);
  return `#${m[1].toLowerCase()}`;
};
/**
 * Ramene toute ecriture de couleur a « r,g,b ».
 *
 * Le navigateur choisit sa propre forme : il rend `#ffffff` en `#fff` et une
 * couleur issue d'un `color-mix` en `rgb(...)`. Comparer les CHAINES a fait
 * echouer ce gate sur du blanc parfaitement juste — le defaut etait dans le
 * comparateur, pas dans le jeton. On normalise donc les DEUX cotes.
 */
const canon = (value) => {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return [...m[1]].map((c) => Number.parseInt(c + c, 16)).join(',');
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) {
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  }
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) return m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).join(',');
  return v; // un pourcentage ou une valeur non couleur : compare tel quel
};
const rgb = (hex) => hex;

/** jeton CSS -> ce que Swift dit, par schéma. */
const EXPECTED = {
  dark: {
    '--ios-indigo-500': rgb(hexOf('indigo500')),
    '--ios-indigo-400': rgb(hexOf('indigo400')),
    '--ios-success': rgb(hexOf('success')),
    '--ios-error': rgb(hexOf('error')),
    '--ios-warning': rgb(hexOf('warning')),
    '--ios-neutral-400': rgb(hexOf('neutral400')),
    // backgroundPrimary/Secondary(isDark: true)
    '--ios-surface': rgb('#09090b'),
    '--ios-surface-card': rgb('#13111c'),
    // textPrimary(isDark: true) == indigo50
    '--ios-ink': rgb(hexOf('indigo50')),
    '--ios-bubble-other-opacity': '28%',
  },
  light: {
    '--ios-surface': rgb('#ffffff'),
    '--ios-surface-card': rgb('#f8f7ff'),
    // textPrimary(isDark: false) == indigo950
    '--ios-ink': rgb(hexOf('indigo950')),
    '--ios-bubble-other-opacity': '16%',
  },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

let failures = 0;
for (const [scheme, table] of Object.entries(EXPECTED)) {
  const context = await browser.newContext({ colorScheme: scheme === 'light' ? 'light' : 'dark' });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const cssClass = await page.evaluate(() => document.documentElement.className);
  const resolved = await page.evaluate((names) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n).trim()]));
  }, Object.keys(table));

  console.log(`\n  ${scheme}  (html class="${cssClass}")`);
  for (const [token, expected] of Object.entries(table)) {
    const actual = resolved[token];
    // Un jeton VIDE est un echec, jamais une egalite : c'est le cas qu'un
    // nom mal orthographie produit, et il ne doit pas passer en silence.
    const ok = actual !== '' && canon(actual) === canon(expected);
    if (!ok) failures += 1;
    console.log(`    ${ok ? 'ok  ' : 'ECHEC'} ${token.padEnd(32)} ${actual || '(vide)'}${ok ? '' : `  != ${expected}`}`);
  }
  await context.close();
}
await browser.close();

console.log(
  failures === 0
    ? '\n  Tous les jetons peints par le navigateur viennent des sources Swift.\n'
    : `\n  ${failures} jeton(s) ne correspondent pas a Swift.\n`,
);
process.exit(failures === 0 ? 0 : 1);
