#!/usr/bin/env node
/**
 * Extrait de `packages/icons/sprite.svg` le SOUS-ENSEMBLE de glyphes que la v4
 * emploie, et l'ecrit en module TypeScript inlinable.
 *
 * Pourquoi extraire plutot que servir le sprite entier : le sprite complet pese
 * 9 058 o gzip pour 73 glyphes ; cet ecran en emploie une quinzaine. Et
 * pourquoi INLINER plutot que referencer `<use href="/sprite.svg#id">` : sous
 * Capacitor le document est servi depuis le systeme de fichiers, ou la
 * resolution d'un `<use>` externe depend du schema d'URL de la coque. Un
 * fragment inline se comporte identiquement dans les deux variantes — c'est la
 * condition pour que le POC compare des variantes, et non des bugs.
 *
 * Pourquoi un GENERATEUR plutot qu'un fichier ecrit a la main : recopier des
 * chemins SVG est exactement la « seconde table » que la charte interdit. Ici
 * le sprite reste la source ; ce module en est une projection rejouable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SPRITE = join(ICI, '../../../packages/icons/sprite.svg');
const SORTIE = join(ICI, '../src/components/glyphes.ts');

const EMPLOYES = [
  'ph-caret-left',
  'ph-phone',
  'ph-magnifying-glass',
  'ph-translate',
  'ph-check',
  'ph-checks',
  'ph-clock',
  'ph-warning-circle',
  'ph-plus',
  'ph-microphone',
  'ph-arrow-up',
  'ph-image',
  'ph-file',
  'ph-fill-play',
  'ph-lock',
  'ph-x',
  'ph-smiley',
  'ph-users',
  'ph-bell',
  'ph-link-simple',
];

const sprite = readFileSync(SPRITE, 'utf8');
const symboles = new Map();
for (const m of sprite.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)) {
  const id = /id="([^"]+)"/.exec(m[1])?.[1];
  const viewBox = /viewBox="([^"]+)"/.exec(m[1])?.[1] ?? '0 0 256 256';
  if (id) symboles.set(id, { viewBox, corps: m[2].trim() });
}

const manquants = EMPLOYES.filter((id) => !symboles.has(id));
if (manquants.length) {
  console.error(`Glyphes absents du sprite : ${manquants.join(', ')}`);
  process.exit(1);
}

const entrees = EMPLOYES.map((id) => {
  const { viewBox, corps } = symboles.get(id);
  const nom = id.replace(/^ph-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return `  ${nom}: { viewBox: ${JSON.stringify(viewBox)}, corps: ${JSON.stringify(corps)} },`;
}).join('\n');

writeFileSync(
  SORTIE,
  `/* GENERE par scripts/extrait-glyphes.mjs depuis packages/icons/sprite.svg.
 * Ne pas editer a la main : relancer \`node scripts/extrait-glyphes.mjs\`.
 * La liste des glyphes employes vit dans ce script, pas ici. */

export const GLYPHES = {
${entrees}
} as const;

export type NomDeGlyphe = keyof typeof GLYPHES;
`,
);

const octets = Buffer.byteLength(readFileSync(SORTIE));
console.log(`  ${EMPLOYES.length} glyphes extraits · ${octets} o de module`);
