#!/usr/bin/env node
/**
 * LE GATE DE BOUT EN BOUT DE LA FUSION (#5445).
 *
 * `packages/design-tokens/scripts/genere-depuis-ios.mjs --verifie` prouve que
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

const ICI = dirname(fileURLToPath(import.meta.url));
const SWIFT = join(ICI, '../../../packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift');
const BASE = process.env.BASE ?? 'http://localhost:4173';

const swift = readFileSync(SWIFT, 'utf8');
const hexDe = (nom) => {
  const m = new RegExp(`public static let ${nom} = Color\\(hex: "([0-9A-Fa-f]{6})"\\)`).exec(swift);
  if (!m) throw new Error(`Constante Swift introuvable : ${nom}`);
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
const canon = (valeur) => {
  const v = valeur.trim().toLowerCase();
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
const ATTENDU = {
  sombre: {
    '--ios-indigo-500': rgb(hexDe('indigo500')),
    '--ios-indigo-400': rgb(hexDe('indigo400')),
    '--ios-succes': rgb(hexDe('success')),
    '--ios-erreur': rgb(hexDe('error')),
    '--ios-alerte': rgb(hexDe('warning')),
    '--ios-neutre-400': rgb(hexDe('neutral400')),
    // backgroundPrimary/Secondary(isDark: true)
    '--ios-plan-fond': rgb('#09090b'),
    '--ios-plan-carte': rgb('#13111c'),
    // textPrimary(isDark: true) == indigo50
    '--ios-encre': rgb(hexDe('indigo50')),
    '--ios-bulle-recue-opacite': '28%',
  },
  clair: {
    '--ios-plan-fond': rgb('#ffffff'),
    '--ios-plan-carte': rgb('#f8f7ff'),
    // textPrimary(isDark: false) == indigo950
    '--ios-encre': rgb(hexDe('indigo950')),
    '--ios-bulle-recue-opacite': '16%',
  },
};

const navigateur = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

let echecs = 0;
for (const [schema, attendus] of Object.entries(ATTENDU)) {
  const contexte = await navigateur.newContext({ colorScheme: schema === 'clair' ? 'light' : 'dark' });
  const page = await contexte.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const classe = await page.evaluate(() => document.documentElement.className);
  const resolus = await page.evaluate((noms) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(noms.map((n) => [n, style.getPropertyValue(n).trim()]));
  }, Object.keys(attendus));

  console.log(`\n  ${schema}  (html class="${classe}")`);
  for (const [jeton, attendu] of Object.entries(attendus)) {
    const obtenu = resolus[jeton];
    // Un jeton VIDE est un echec, jamais une egalite : c'est le cas qu'un
    // nom mal orthographie produit, et il ne doit pas passer en silence.
    const ok = obtenu !== '' && canon(obtenu) === canon(attendu);
    if (!ok) echecs += 1;
    console.log(`    ${ok ? 'ok  ' : 'ECHEC'} ${jeton.padEnd(32)} ${obtenu || '(vide)'}${ok ? '' : `  != ${attendu}`}`);
  }
  await contexte.close();
}
await navigateur.close();

console.log(
  echecs === 0
    ? '\n  Tous les jetons peints par le navigateur viennent des sources Swift.\n'
    : `\n  ${echecs} jeton(s) ne correspondent pas a Swift.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
