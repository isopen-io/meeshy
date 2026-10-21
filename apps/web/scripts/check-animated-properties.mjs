#!/usr/bin/env node
/**
 * LES ANIMATIONS DE GÉOMÉTRIE PASSENT SUR `transform` ET `opacity` (#11314).
 *
 * Animer `width`, `height`, `top`, `left`, `grid-template-rows`… recalcule la
 * mise en page À CHAQUE IMAGE : c'est la lenteur que la roadmap compte comme un
 * BUG (dimensions 2 et 4). Le gate lit les sources du web (CSS, TS, TSX hors
 * témoins) et relève toute géométrie nommée dans :
 *
 *  - une `transition` / `transition-property` (CSS ou objet de style) ;
 *  - une classe Tailwind `transition-[…]` ;
 *  - un `@keyframes` ;
 *  - les images clés d'un `.animate(` (animation Web).
 *
 * C'est un CLIQUET : les sites encore tolérés sont NOMMÉS dans
 * `KNOWN_GEOMETRY_ANIMATIONS`, ce qui refuse tout nouveau site, et la liste ne
 * fait que décroître (un site corrigé mais resté listé échoue aussi). Les six
 * sites du lot #11314 n'y figurent pas : ils sont à zéro.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const GEOMETRY =
  /^(?:(?:min-|max-)?(?:width|height)|top|right|bottom|left|inset(?:-(?:block|inline))?(?:-(?:start|end))?|(?:margin|padding)(?:-(?:top|right|bottom|left|block|inline))?(?:-(?:start|end))?|(?:row-|column-)?gap|grid-template(?:-rows|-columns)?|flex-basis|font-size|line-height|border(?:-[a-z]+)?-width|(?:min-|max-)?(?:block|inline)-size)$/;

/**
 * Les sites tolérés, par fichier (relatif à `src/`), une entrée par occurrence.
 * Hors lot #11314, chacun a son issue de suivi. Ne fait que décroître.
 */
export const KNOWN_GEOMETRY_ANIMATIONS = {
  'components/call-effects-companions.tsx': ['left'],
  'components/feed-carousel-chrome.tsx': ['width'],
  'components/ios-switch.tsx': ['inset-inline-start'],
  'routes/admin-shell.tsx': ['width'],
  'routes/communities-parts.tsx': ['inset-inline-start'],
  'routes/settings-sections.tsx': ['inset-inline-start'],
  'routes/share-link-form.tsx': ['inset-inline-start'],
  'routes/story-compose-camera-flash.tsx': ['margin', 'width'],
  'styles/scene-scrub.css': ['bottom', 'height', 'margin-top'],
  'styles/thread-protection.css': ['grid-template-rows', 'grid-template-rows', 'grid-template-rows'],
};

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Les commentaires s'effacent en gardant leurs retours à la ligne : les numéros restent justes. */
const blank = (text) => text.replace(/[^\n]/g, ' ');

function withoutComments(kind, text) {
  const block = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  return kind === 'css' ? block : block.replace(/(^|[^:'"`\w])(\/\/.*)$/gm, (_, before, comment) => before + blank(comment));
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Les noms de propriétés d'une valeur de `transition` : `left 180ms ease-out, top …` → left, top. */
function propertiesOfTransition(value) {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s,]+/)
    .map((token) => kebab(token.replace(/^['"`]|['"`]$/g, '')))
    .filter((token) => GEOMETRY.test(token));
}

function balanced(text, open, opening, closing) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === opening) depth += 1;
    if (text[index] === closing) depth -= 1;
    if (depth === 0) return text.slice(open + 1, index);
  }
  return text.slice(open + 1);
}

const sitesOf = (text, pattern, read) =>
  [...text.matchAll(pattern)].flatMap((match) => read(match).map((property) => ({ property, line: lineOf(text, match.index) })));

const declaredIn = (body) => [...body.matchAll(/(?:^|[{;\s,'"])([a-zA-Z-]+)['"]?\s*:/g)].map((found) => kebab(found[1])).filter((name) => GEOMETRY.test(name));

export function geometryAnimationsIn({ kind, text: source }) {
  const text = withoutComments(kind, source);
  const transitions =
    kind === 'css'
      ? sitesOf(text, /\btransition(?:-property)?\s*:\s*([^;}]*)/g, (match) => propertiesOfTransition(match[1]))
      : sitesOf(text, /\btransition(?:Property)?\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g, (match) => propertiesOfTransition(match[2]));
  const tailwind = sitesOf(text, /\btransition-\[([^\]]*)\]/g, (match) => propertiesOfTransition(match[1]));
  const keyframes = sitesOf(text, /@keyframes\s+[\w-]+\s*\{/g, (match) => declaredIn(balanced(text, match.index + match[0].length - 1, '{', '}')));
  const animate = kind === 'css' ? [] : sitesOf(text, /\.animate\(/g, (match) => declaredIn(balanced(text, match.index + match[0].length - 1, '(', ')')));
  return [...transitions, ...tailwind, ...keyframes, ...animate].sort((a, b) => a.line - b.line);
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const SOURCE = /\.(?:css|tsx?)$/;
const TEST = /\.test\.[a-z]+$|(?:^|\/)test-support\//;

export function scanSources(root = SRC) {
  const found = {};
  for (const path of walk(root)) {
    const name = relative(root, path);
    if (!SOURCE.test(name) || TEST.test(name)) continue;
    const sites = geometryAnimationsIn({ kind: name.endsWith('.css') ? 'css' : 'ts', text: readFileSync(path, 'utf8') });
    if (sites.length > 0) found[name] = sites.map((site) => site.property).sort();
  }
  return found;
}

export function auditRatchet({ found, known }) {
  const same = (a, b) => a.length === b.length && a.every((property, index) => property === b[index]);
  const files = [...new Set([...Object.keys(found), ...Object.keys(known)])].sort();
  return files.flatMap((file) => {
    const seen = [...(found[file] ?? [])].sort();
    const allowed = [...(known[file] ?? [])].sort();
    if (same(seen, allowed)) return [];
    const extra = seen.filter((property) => allowed.length === 0 || allowed.filter((p) => p === property).length < seen.filter((p) => p === property).length);
    if (extra.length > 0) return [`${file} anime de la géométrie (${[...new Set(extra)].join(', ')}) : passer par transform / opacity (FLIP, translate), jamais width / height / top / left`];
    return [`${file} n'anime plus ${[...new Set(allowed)].join(', ')} : retirer ce site de KNOWN_GEOMETRY_ANIMATIONS`];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = auditRatchet({ found: scanSources(), known: KNOWN_GEOMETRY_ANIMATIONS });
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  if (failures.length > 0) process.exit(1);
  console.log(`  ok    aucune animation de géométrie hors des ${Object.keys(KNOWN_GEOMETRY_ANIMATIONS).length} fichiers tolérés`);
}
