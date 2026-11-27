#!/usr/bin/env node
/**
 * LE GATE « UN SEUL MOTEUR DE THÈME » (#6020).
 *
 * Le schéma clair/sombre se décide en UN lieu, et en deux temps :
 *
 *   src/lib/inline-scheme-bootstrap.js  au démarrage, avant le premier rendu
 *   src/lib/scheme.ts                   à chaud, ensuite (choix, suivi du système)
 *
 * Les jetons font tout le reste : un composant n'a pas à connaître le schéma
 * pour se peindre juste. Celui qui interroge lui-même `prefers-color-scheme`,
 * ou qui pose `dark`/`light` sur une classe, est un SECOND moteur : il suit le
 * système pendant que l'app est réglée sur l'autre schéma, et l'écran se peint
 * en deux thèmes à la fois. Aucun gate ne l'interdisait depuis le retrait de
 * celui de l'ancienne refonte (#6000).
 *
 * CE QU'IL REFUSE, dans le CODE (les commentaires sont blanchis d'abord) :
 *
 *   system-query     toute requête `prefers-color-scheme` du CODE — en argument
 *                    de matchMedia, rangée dans une constante, appelée par
 *                    `matchMedia?.(…)` — hors d'un attribut `media=`
 *   scheme-class     classList.add|remove|toggle|replace('dark' | 'light', …)
 *   theme-attribute  setAttribute('data-theme', …), dataset.theme = …
 *
 * CE QU'IL LAISSE PASSER à dessein : un attribut `media=` déclaratif (une
 * balise <meta> ou <source> que le navigateur résout seul), une LECTURE du
 * schéma (`classList.contains('light')`), un `colorScheme` de surface (les
 * contrôles natifs d'un lecteur sombre), un commentaire qui cite le moteur.
 *
 *   node scripts/check-theme-engine.mjs               tout src/
 *   node scripts/check-theme-engine.mjs --src <dir>   un autre arbre (le témoin)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SRC = fileURLToPath(new URL('../src', import.meta.url));

export const ENGINE_FILES = Object.freeze(['lib/scheme.ts', 'lib/inline-scheme-bootstrap.js']);

export const isInScope = (path) => {
  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(path)) return false;
  if (/\.test\.[jt]sx?$/.test(path) || /\.d\.ts$/.test(path)) return false;
  return !path.startsWith('test-support/');
};

/**
 * Blanchit les commentaires, en gardant chaînes et sauts de ligne à leur place
 * (les lignes rapportées restent celles de la source). Une chaîne simple ou
 * double qui ne se ferme pas sur sa ligne est une apostrophe de texte JSX.
 */
const withoutComments = (text) => {
  const blank = (part) => part.replace(/[^\n]/g, ' ');
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && (c === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1;
      const stop = text[j] === c ? j + 1 : i + 1;
      out += text.slice(i, stop);
      i = stop;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
};

const QUOTE = '[\'"`]';
const PATTERNS = [
  {
    kind: 'system-query',
    pattern: new RegExp(`(?<!media\\s*=\\s*\\{?\\s*${QUOTE}\\s*\\(?\\s*)prefers-color-scheme`, 'g'),
  },
  {
    kind: 'scheme-class',
    pattern: new RegExp(`classList\\s*\\.\\s*(?:add|remove|toggle|replace)\\s*\\(\\s*${QUOTE}(?:dark|light)${QUOTE}`, 'g'),
  },
  { kind: 'theme-attribute', pattern: new RegExp(`setAttribute\\s*\\(\\s*${QUOTE}data-theme${QUOTE}`, 'g') },
  { kind: 'theme-attribute', pattern: /\bdataset\s*\.\s*theme\s*=(?!=)/g },
];

/** Les violations d'UNE source, triées par ligne. */
export const scanSource = (text) => {
  const code = withoutComments(text);
  const lineOf = (index) => (code.slice(0, index).match(/\n/g) ?? []).length + 1;
  return PATTERNS.flatMap(({ kind, pattern }) =>
    [...code.matchAll(pattern)].map((m) => ({ line: lineOf(m.index), kind, match: m[0].replace(/\s+/g, ' ') })),
  ).sort((a, b) => a.line - b.line);
};

/** Le rapport sur un ensemble de sources `{ path, text }` (chemins relatifs à src/). */
export const auditSources = (sources) => {
  const files = sources
    .filter((source) => isInScope(source.path) && !ENGINE_FILES.includes(source.path))
    .map((source) => ({ path: source.path, violations: scanSource(source.text) }))
    .filter((file) => file.violations.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
  const present = new Set(sources.map((source) => source.path));
  return {
    total: files.reduce((sum, file) => sum + file.violations.length, 0),
    files,
    missingEngineFiles: ENGINE_FILES.filter((path) => !present.has(path)),
  };
};

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const format = (report) =>
  [
    ...report.missingEngineFiles.map((path) => `moteur déclaré introuvable : src/${path} (mettre ENGINE_FILES à jour)`),
    ...report.files.flatMap((file) => [
      `src/${file.path}  (${file.violations.length})`,
      ...file.violations.map((v) => `  ${String(v.line).padStart(5)}  ${v.kind.padEnd(16)} ${v.match}`),
    ]),
    report.total === 0 && report.missingEngineFiles.length === 0
      ? `thème: un seul moteur (${ENGINE_FILES.map((p) => `src/${p}`).join(', ')}).`
      : `thème: ${report.total} second(s) moteur(s) — le schéma se lit dans les jetons et se décide dans src/lib/scheme.ts.`,
  ].join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const srcAt = args.indexOf('--src');
  const src = srcAt === -1 ? DEFAULT_SRC : args[srcAt + 1];
  const sources = walk(src).map((full) => ({
    path: relative(src, full).split(sep).join('/'),
    text: readFileSync(full, 'utf8'),
  }));
  const report = auditSources(sources);
  process.stdout.write(`${format(report)}\n`);
  process.exitCode = report.total === 0 && report.missingEngineFiles.length === 0 ? 0 : 1;
}
