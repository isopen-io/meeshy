#!/usr/bin/env node
/**
 * LES POLICES DES CADRES DE GLOIRE NE PÈSENT PAS SUR LE PREMIER AFFICHAGE
 * (#10158, L6, § 5.6 du prompt des Cadres de gloire) — le budget tenu sur les
 * SOURCES, avant toute émission.
 *
 * POURQUOI UN SECOND GATE À CÔTÉ DE `measure-weight.mjs`. Celui-ci compare
 * `budgets.json › glory_fonts` aux `.woff2` que Vite ÉMET, et sa garde est
 * conditionnelle : tant qu'aucun module n'importe la feuille, Vite n'en émet
 * aucun, et il n'y a rien à comparer. C'est exact — et c'est une fenêtre : un
 * septième fichier `glory-*.woff2` posé sous `styles/fonts/`, une substitution
 * qui change les octets, une seconde feuille ou un second module qui importe
 * les faces, ne faisaient rougir AUCUN gate pendant que le peintre n'existait
 * pas. La table TS (`lib/game-photo/glory-fonts.ts`) se compare à elle-même ;
 * le cliquet du budget attendait une émission qui ne venait pas (leçon 231 :
 * un témoin qui ne peut pas tomber n'atteste rien).
 *
 * CE QU'IL TIENT, sur l'arbre de travail et sans construire :
 *   · INVENTAIRE : autant de fichiers `glory-*.woff2` sur disque que le budget
 *     en déclare ;
 *   · CLIQUET : la somme EXACTE de leurs octets (un binaire ne dérive pas ; le
 *     seul geste qui bouge ce nombre est une substitution, qui rouvre l'entrée) ;
 *   · FEUILLE : chaque fichier a sa `@font-face`, chaque `@font-face` son fichier ;
 *   · IMPORTEUR : la feuille n'est importée que par `lib/game-photo/glory-fonts.ts`
 *     — l'unique arête qui la relie au graphe, que le témoin d'entrée
 *     (`glory-fonts.test.ts`) prouve hors du socle (leçon 589). Le relevé
 *     compte TOUTE arête qui nomme la feuille, quel que soit son idiome
 *     (`@import './glory-fonts.css'` depuis une feuille voisine, `url(...)`,
 *     `?inline` / `?url`, `import()` dynamique, `<link href>` de `index.html`) :
 *     sa première forme ne connaissait que deux graphies et laissait passer
 *     celle que le dépôt emploie réellement pour ses feuilles (2026-10-22) ;
 *   · NOTICE : chaque fichier redistribué y est nommé (la licence l'exige) ;
 *   · PRECACHE : si `dist/sw.js` existe, aucune police de cadre n'y figure.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FONTS_DIR = join(APP, 'src', 'styles', 'fonts');
const SHEET = join(APP, 'src', 'styles', 'glory-fonts.css');
const NOTICE = join(FONTS_DIR, 'NOTICE.md');
const BUDGETS = join(APP, 'budgets.json');
const SW = join(APP, 'dist', 'sw.js');
const SOLE_IMPORTER = 'src/lib/game-photo/glory-fonts.ts';

const GLORY_FILE = /^glory-[A-Za-z0-9_-]+\.woff2$/;
const SHEET_URL = /url\(['"]?\.\/fonts\/(glory-[A-Za-z0-9_-]+\.woff2)['"]?\)/g;
const COMMENTS = /\/\*[\s\S]*?\*\/|(^|[^:'"\\])\/\/[^\n]*/g;
const QUOTED_SPECIFIER = /['"]([^'"\n]*?)['"]/g;
const URL_SPECIFIER = /url\(\s*([^'")\s]+)\s*\)/g;
const SHEET_PATH = /(?:^|\/)glory-fonts\.css$/;

const sum = (files) => files.reduce((total, f) => total + f.bytes, 0);

/**
 * La loi, pure : des faits relevés, une liste d'écarts nommés. Vide ⇒ vert.
 * Le témoin (`check-glory-fonts.test.ts`) la fait tomber écart par écart.
 */
export function auditGloryFonts({ files, budget, sheet, importers, notice, precached }) {
  const failures = [];
  const onDisk = files.map((f) => f.file);
  const inSheet = [...new Set([...sheet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(SHEET_URL)].map((m) => m[1]))];

  if (files.length !== budget.files) {
    failures.push(
      `  INVENTAIRE : ${files.length} police(s) de cadre sous styles/fonts/, ${budget.files} declaree(s) (budgets.json › glory_fonts.files)` +
        ' — une famille de plus ou de moins se dit dans le budget, jamais en silence',
    );
  }
  const bytes = sum(files);
  if (bytes !== budget.bytes) {
    failures.push(
      `  CLIQUET : ${bytes} octets de polices de cadre, ${budget.bytes} declares (budgets.json › glory_fonts.bytes)` +
        ' — un binaire ne DERIVE pas, cet ecart est une SUBSTITUTION : rouvrir l entree est le geste attendu',
    );
  }
  for (const file of onDisk.filter((f) => !inSheet.includes(f))) {
    failures.push(`  ORPHELIN : ${file} est sous styles/fonts/ et aucune @font-face de glory-fonts.css ne le sert`);
  }
  for (const file of inSheet.filter((f) => !onDisk.includes(f))) {
    failures.push(`  ABSENT : glory-fonts.css sert ${file}, qui n existe pas — une famille proposee que personne ne peint`);
  }
  if (importers.length !== 1 || importers[0] !== SOLE_IMPORTER) {
    failures.push(
      `  IMPORTEUR : glory-fonts.css doit etre importee par ${SOLE_IMPORTER} et par lui seul ; trouve : ${importers.length > 0 ? importers.join(', ') : '(personne)'}`,
    );
  }
  for (const file of onDisk.filter((f) => !notice.includes(f))) {
    failures.push(`  NOTICE : ${file} est redistribue sans etre nomme dans styles/fonts/NOTICE.md — la licence en fait la condition`);
  }
  for (const entry of precached.filter((e) => /glory-[A-Za-z0-9_-]+\.woff2$/.test(e))) {
    failures.push(`  PRECACHE : ${entry} est au manifeste du service worker — chaque visiteur la telechargerait a l installation`);
  }
  return failures;
}

/**
 * Le relevé des IMPORTEURS, pur : les chemins (triés) des entrées dont la
 * source nomme la feuille par une arête — spécificateur entre guillemets ou
 * `url(...)`, commentaires ôtés, suffixe Vite (`?inline`, `?url`) toléré. La
 * reconnaissance est LARGE à dessein : un faux positif rougit en nommant le
 * fichier, un faux négatif se tait.
 */
export function sheetImportersOf(entries) {
  const namesSheet = (source) => {
    const code = source.replace(COMMENTS, '$1');
    const specifiers = [...code.matchAll(QUOTED_SPECIFIER), ...code.matchAll(URL_SPECIFIER)].map((m) => m[1].replace(/[?#].*$/, ''));
    return specifiers.some((specifier) => SHEET_PATH.test(specifier));
  };
  return entries
    .filter((entry) => namesSheet(entry.source))
    .map((entry) => entry.path)
    .sort();
}

const sources = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(tsx?|jsx?|mjs|css|html)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

/** Les faits, relevés sur l'arbre de travail — jamais sur `dist`, sauf le manifeste du service worker s'il existe. */
export function collectGloryFonts() {
  const files = readdirSync(FONTS_DIR)
    .filter((name) => GLORY_FILE.test(name))
    .sort()
    .map((file) => ({ file, bytes: statSync(join(FONTS_DIR, file)).size }));
  const spec = JSON.parse(readFileSync(BUDGETS, 'utf8')).glory_fonts ?? {};
  const budget = { files: spec.files?.value ?? NaN, bytes: spec.bytes?.value ?? NaN };
  const sheet = readFileSync(SHEET, 'utf8');
  const importers = sheetImportersOf(
    [...sources(join(APP, 'src')), join(APP, 'index.html')]
      .filter((path) => path !== SHEET)
      .map((path) => ({ path: relative(APP, path), source: readFileSync(path, 'utf8') })),
  );
  const notice = readFileSync(NOTICE, 'utf8');
  const precached = existsSync(SW) ? [...readFileSync(SW, 'utf8').matchAll(/"([^"]+\.woff2)"/g)].map((m) => m[1]) : [];
  return { files, budget, sheet, importers, notice, precached };
}

/* Le pilote ne tourne QUE si ce fichier est le point d'entrée : importé (par
   son témoin), le module n'expose que la loi et le relevé. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const facts = collectGloryFonts();
  const failures = auditGloryFonts(facts);
  if (failures.length > 0) {
    console.error('\n  LES POLICES DES CADRES DE GLOIRE (#10158) :\n');
    for (const failure of failures) console.error(failure);
    console.error('');
    process.exit(1);
  }
  console.log(
    `  Polices de cadre : ${facts.files.length} fichier(s), ${sum(facts.files)} octets (cliquet exact), ` +
      `feuille importee par ${facts.importers[0]} seul, ${facts.precached.length === 0 ? 'rien' : facts.precached.length} au precache.`,
  );
}
