#!/usr/bin/env node
/**
 * Extrait de `@phosphor-icons/core` (regular) le SOUS-ENSEMBLE de glyphes que
 * la v3.1 emploie, et l'ecrit en module TypeScript inlinable.
 *
 * Pourquoi lire les tracés BRUTS de `@phosphor-icons/core/assets/regular/`
 * plutôt que `packages/icons/sprite.svg` (l'ancienne source de ce script) :
 * ce sprite est le sous-sprite de 72 symboles CURATE pour `apps/web-old-version3`
 * (README `packages/icons/README.md`, `budgets.json` de ce dépôt), un chantier
 * ARRÊTÉ (2026-09-07) — s'y accrocher pour un glyphe absent de son curatage
 * (`push-pin`, `bell-slash`, `envelope-open`, `archive`, `dots-three-vertical`,
 * requis par #5559) aurait obligé à étendre un pipeline gelé. `@phosphor-icons/core`
 * est la source UNIQUE dont dérivent les deux : une dépendance de dépôt
 * (racine, `package.json`), jamais un téléchargement au build. Vérifié
 * OCTET POUR OCTET avant bascule : chaque tracé déjà extrait via le sprite
 * (`check`, `bell`, …) est identique lu depuis l'asset brut — la bascule ne
 * fait bouger AUCUN pixel des 20 glyphes existants, elle en ajoute cinq.
 *
 * Pourquoi INLINER plutot que referencer `<use href="/sprite.svg#id">` : sous
 * Capacitor le document est servi depuis le systeme de fichiers, ou la
 * resolution d'un `<use>` externe depend du schema d'URL de la coque. Un
 * fragment inline se comporte identiquement dans les deux variantes — c'est la
 * condition pour que le POC compare des variantes, et non des bugs.
 *
 * Pourquoi un GENERATEUR plutot qu'un fichier ecrit a la main : recopier des
 * chemins SVG est exactement la « seconde table » que la charte interdit. Ici
 * la source reste `@phosphor-icons/core` ; ce module en est une projection
 * rejouable — `node scripts/extract-glyphs.mjs` la regenere a l'identique.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = join(HERE, '../../../node_modules/@phosphor-icons/core/assets');
const OUTPUT = join(HERE, '../src/components/glyphs.ts');

/**
 * Tous les glyphes viennent du dossier `regular`, à UNE exception : le
 * triangle de lecture est le variant PLEIN (`fill/play-fill.svg`) — phosphor
 * ne publie pas de `regular/play.svg` équivalent visuellement à l'ancien id
 * `ph-fill-play` du sprite curaté. `fill-play` (le nom conservé pour ne pas
 * renommer un glyphe déjà consommé par `message-blocks.tsx`) résout donc vers
 * ce fichier précis plutôt que le motif `regular/<id>.svg`.
 */
const OVERRIDES = { 'fill-play': join(CORE, 'fill/play-fill.svg') };

/**
 * Noms de fichier phosphor (`push-pin.svg`) — le nom de propriété exporté est
 * la même chaîne en camelCase. Les cinq derniers servent les actions de
 * rangée et le déclencheur de menu (#5559, §5.6) ; les vingt premiers sont
 * repris tels quels du curatage précédent.
 */
const USED = [
  'caret-left',
  'phone',
  'magnifying-glass',
  'translate',
  'check',
  'checks',
  'clock',
  'warning-circle',
  'plus',
  'microphone',
  'arrow-up',
  'image',
  'file',
  'fill-play',
  'lock',
  'x',
  'smiley',
  'users',
  'bell',
  'link-simple',
  'push-pin',
  'bell-slash',
  'envelope-open',
  'archive',
  'dots-three-vertical',
];

const missing = [];
const entries = USED.map((id) => {
  const path = OVERRIDES[id] ?? join(CORE, 'regular', `${id}.svg`);
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    missing.push(id);
    return '';
  }
  const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1] ?? '0 0 256 256';
  const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(source)?.[1]?.trim() ?? '';
  const name = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  return `  ${name}: { viewBox: ${JSON.stringify(viewBox)}, body: ${JSON.stringify(body)} },`;
}).join('\n');

if (missing.length) {
  console.error(`Glyphes absents de @phosphor-icons/core/assets/regular : ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(
  OUTPUT,
  `/* GENERE par scripts/extract-glyphs.mjs depuis @phosphor-icons/core.
 * Ne pas editer a la main : relancer \`node scripts/extract-glyphs.mjs\`.
 * La liste des glyphes employes vit dans ce script, pas ici. */

export const GLYPHS = {
${entries}
} as const;

export type GlyphName = keyof typeof GLYPHS;
`,
);

const bytes = Buffer.byteLength(readFileSync(OUTPUT));
console.log(`  ${USED.length} glyphes extraits · ${bytes} o de module`);
