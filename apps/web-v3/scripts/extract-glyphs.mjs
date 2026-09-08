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
const OVERRIDES = {
  'fill-play': join(CORE, 'fill/play-fill.svg'),
  /**
   * `flame-fill` (D-23, #5676) — iOS emploie `flame.fill` pour le badge
   * éphémère et le tombstone « Vu et supprimé »
   * (`BubbleMetaBadges.swift:146-171`, `BubbleSystemViews.swift:50-85`) et
   * `flame` régulier dans l'aperçu de LISTE
   * (`LentilleConversationRow.swift:600-631`, `previewKindOf` §5.9) — les
   * DEUX variants sont donc extraits, même dispositif que `fill-play`.
   */
  'flame-fill': join(CORE, 'fill/flame-fill.svg'),
};

/**
 * Noms de fichier phosphor (`push-pin.svg`) — le nom de propriété exporté est
 * la même chaîne en camelCase. Les cinq de la ligne 76-80 servent les actions
 * de rangée et le déclencheur de menu (#5559, §5.6) ; les trois derniers
 * (`user`, `key`, `caret-down`) servent les écrans de connexion et
 * d'inscription (#5555, § E1) — le champ identifiant, le champ de code à deux
 * facteurs, et le chevron du sélecteur de pays ; les vingt premiers sont
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
  'user',
  'key',
  'caret-down',
  /**
   * D-23, #5676 — la protection du fil : `flame` (aperçu de liste, vue
   * unique), `flame-fill` (badge éphémère, tombstone brûlé — voir
   * `OVERRIDES` ci-dessus), `prohibit` (≈ `nosign` iOS, tombstone
   * supprimé), `eye-slash` (aperçu de liste, message masqué).
   */
  'flame',
  'flame-fill',
  'prohibit',
  'eye-slash',
  /**
   * `timer` (revue #5676) — iOS distingue dans la LIGNE DE LISTE l'éphémère
   * (`timer`) de la vue unique (`flame`)
   * (`LentilleConversationRow.swift:578-584`, `:616`, `standardPreview`
   * `showEphemeralIcon`). Servir `flame` aux DEUX faisait porter au même
   * glyphe deux états différents dans la même colonne — l'ambiguïté que la
   * dimension 6 (cohérence de positionnement) interdit.
   */
  'timer',
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
