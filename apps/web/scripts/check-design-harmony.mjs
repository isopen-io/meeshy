#!/usr/bin/env node
/**
 * LE GATE D'HARMONIE — une couleur de chrome se LIT dans la charte, elle ne
 * s'écrit pas (#8879, directive porteur 2026-09-30).
 *
 * La mesure de départ (dev, 2026-09-30) : 554 littéraux de couleur dans 102
 * fichiers d'écran, 210 `bg-white`/`text-black` bruts. Chacun était juste le
 * jour où il a été écrit ; ensemble, ils font une application où le même
 * voile noir vaut 35, 40, 45, 50, 55 ou 60 % selon l'écran. Les rôles vivent
 * dans le SDK (`MeeshyColors.swift` → `packages/design-tokens/ios.css`) et
 * leurs noms web dans `src/styles/ios.css` ; la table motif → jeton est
 * `docs/product/charte-visuelle-web.md`.
 *
 * CE QU'IL REFUSE, dans les CHAÎNES du code (un commentaire peut citer une
 * couleur, un texte JSX n'en porte pas) :
 *
 *   hex              '#fff', "#6366f1", `#11223344`
 *   rgb              rgb(), rgba(), hsl(), hsla() littéraux
 *   arbitrary-class  bg-[#111], text-[rgb(…)]
 *   raw-white-black  text-white, hover:bg-black/40, border-t-white/20
 *   keyword          'white', 'color-mix(in srgb, white 16%, …)', '1px solid black'
 *   palette          text-red-500, bg-indigo-950/60
 *
 * CE QU'IL EXEMPTE, et toujours avec sa RAISON :
 *
 *   - les CHEMINS de `EXEMPT_PATHS`, dont TOUTES les couleurs sont choisies
 *     par un tiers (auteur, utilisateur) ou peintes hors du DOM ;
 *   - une LIGNE marquée `harmony-exempt: <raison>` (en commentaire, sur la
 *     ligne ou la précédente) — une valeur de tiers dans un fichier de chrome.
 *     Un marqueur sans raison n'exempte rien et se signale lui-même.
 *
 *   node scripts/check-design-harmony.mjs                     tout src/
 *   node scripts/check-design-harmony.mjs --files a.tsx b.ts  un sous-ensemble (relatif à src/)
 *   node scripts/check-design-harmony.mjs --json              le rapport, lisible par un script
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/**
 * LE CHANTIER D'UN AUTRE MILESTONE — le studio de story, la composition
 * d'une publication et le composeur. Ils bougent sous un autre pilotage ; le
 * gate ne les lit pas plutôt que de les exempter ligne à ligne.
 */
const OUT_OF_SCOPE_BASENAME = /^(story-compose[-.]|use-studio-|publication-compose|composer|status-compose)/;

/**
 * LES CHEMINS DONT TOUTES LES COULEURS SONT CELLES D'UN TIERS. Un préfixe
 * n'entre ici que si AUCUNE de ses couleurs n'est du chrome ; un fichier qui
 * mêle les deux garde ses lignes de tiers MARQUÉES, une par une.
 */
export const EXEMPT_PATHS = [
  {
    prefix: 'lib/api/fixtures',
    reason: "fixtures de démonstration : des contenus d'utilisateurs fictifs, avec les couleurs que ces utilisateurs auraient choisies",
  },
  {
    prefix: 'lib/canvas/',
    reason: "le document d'une scène (story, réel, publication) : fonds, textes, tracés et filtres sont choisis par l'AUTEUR et peints tels quels",
  },
  {
    prefix: 'lib/calls/frames/',
    reason: "cadres d'appel peints en canvas : des modèles choisis par l'utilisateur, composés hors du DOM, où un jeton CSS n'a pas cours",
  },
  {
    prefix: 'lib/calls/call-montage',
    reason: "montages d'une capture d'appel peints en canvas : treize styles choisis par l'utilisateur, hors du DOM",
  },
  {
    prefix: 'lib/calls/face-effects',
    reason: "effets de visage d'un appel peints en canvas sur la vidéo : un rendu choisi par l'utilisateur, hors du DOM",
  },
  {
    prefix: 'lib/calls/call-recording-compositor',
    reason: "la composition d'un enregistrement vidéo, peinte en canvas pour le fichier exporté : hors du DOM, où un jeton CSS n'a pas cours",
  },
  {
    prefix: 'lib/calls/call-speaker-color',
    reason: "la couleur d'un locuteur est DÉRIVÉE de son identifiant (palette catégorielle d'iOS) : une identité, jamais un rôle de chrome",
  },
  {
    prefix: 'lib/effects-playback',
    reason: "les effets d'un message (confettis, feux, lueur) : un rendu choisi par l'EXPÉDITEUR, miroir de MessageEffects.swift",
  },
  {
    prefix: 'lib/view/effects-runner',
    reason: "le moteur des effets d'un message : il peint ce que l'EXPÉDITEUR a choisi, miroir de MessageEffectModifiers.swift",
  },
  {
    prefix: 'lib/export/',
    reason: "modèles de carte d'export : la palette de chaque modèle est choisie par l'utilisateur et exportée en image",
  },
  {
    prefix: 'lib/accent.ts',
    reason: "l'accent d'une conversation est DÉRIVÉ de ses métadonnées (langue, type, thème) — une couleur calculée, jamais un rôle de chrome",
  },
  {
    prefix: 'lib/languages.ts',
    reason: "la couleur d'identité d'une langue (projection de LanguageDisplay iOS) : une donnée du catalogue, entrée de l'accent dérivé",
  },
];

export const isInScope = (path) => {
  if (!/\.(ts|tsx)$/.test(path)) return false;
  if (/\.test\.tsx?$/.test(path) || /\.d\.ts$/.test(path)) return false;
  if (path.startsWith('test-support/')) return false;
  const basename = path.split('/').at(-1) ?? path;
  return !OUT_OF_SCOPE_BASENAME.test(basename);
};

export const exemptionOf = (path) => EXEMPT_PATHS.find((entry) => path.startsWith(entry.prefix))?.reason ?? null;

// --- la lecture : chaînes et commentaires, rien d'autre ----------------------

/**
 * Découpe une source en CHAÎNES (avec leur ligne de départ) et en
 * COMMENTAIRES. Une chaîne simple ou double qui ne se ferme pas sur sa ligne
 * n'en est pas une — c'est une apostrophe de texte JSX (`<p>l'écran</p>`), et
 * la lire comme une chaîne décalerait toute la suite du fichier.
 */
const lexe = (text) => {
  const strings = [];
  const comments = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '\n') {
      line += 1;
      i += 1;
    } else if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      comments.push({ line, text: text.slice(i + 2, stop) });
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      text
        .slice(i + 2, stop - 2)
        .split('\n')
        .forEach((part, offset) => comments.push({ line: line + offset, text: part }));
      line += (text.slice(i, stop).match(/\n/g) ?? []).length;
      i = stop;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      if (text[j] === c) {
        strings.push({ line, text: text.slice(i + 1, j) });
        i = j + 1;
      } else {
        i += 1;
      }
    } else if (c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== '`') j += text[j] === '\\' ? 2 : 1;
      const body = text.slice(i + 1, j);
      strings.push({ line, text: body });
      line += (body.match(/\n/g) ?? []).length;
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return { strings, comments };
};

// --- les motifs ---------------------------------------------------------------

const PREFIXES = '(?:bg|text|border(?:-[trblxyse])?|ring|fill|stroke|outline|divide|from|via|to|placeholder|decoration|shadow|caret|accent)';
const VARIANTS = '(?:[\\w-]+:)*';
const OPACITY = '(?:\\/(?:\\d+|\\[[^\\]]+\\]))?';
const PALETTE =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)';

const ARBITRARY = /-\[(?:color:)?(?:#|rgba?\(|hsla?\()[^\]]*\]/g;
const HEX = /(^|[^\w&#-])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))(?![\w-])/g;
const RGB = /\b(?:rgba?|hsla?)\(/g;
const RAW = new RegExp(`(?<![\\w-])${VARIANTS}${PREFIXES}-(?:white|black)${OPACITY}(?![\\w-])`, 'g');
const TAILWIND_PALETTE = new RegExp(`(?<![\\w-])${VARIANTS}${PREFIXES}-${PALETTE}${OPACITY}(?![\\w-])`, 'g');

const KEYWORD_ALONE = /^\s*(?:white|black)\s*$/g;
const KEYWORD_IN_VALUE = /(?:in srgb,\s*|,\s*|\(\s*|solid\s+|\d(?:px|rem|em)\s+)(?:white|black)(?![\w-])/g;

const MARKER = /harmony-exempt:(.*)$/;
const RANK = { 'marker-without-reason': 0, 'arbitrary-class': 1, hex: 2, rgb: 3, keyword: 4, 'raw-white-black': 5, palette: 6 };

const lineAt = (literal, index) => literal.line + (literal.text.slice(0, index).match(/\n/g) ?? []).length;

const inside = (ranges, index) => ranges.some(([start, end]) => index >= start && index < end);

const violationsOf = (literal) => {
  const arbitrary = [...literal.text.matchAll(ARBITRARY)];
  const ranges = arbitrary.map((m) => [m.index, m.index + m[0].length]);
  const found = (kind, pattern, group = 0, shift = () => 0) =>
    [...literal.text.matchAll(pattern)]
      .filter((m) => !inside(ranges, m.index + shift(m)))
      .map((m) => ({ line: lineAt(literal, m.index + shift(m)), kind, match: m[group] }));
  return [
    ...arbitrary.map((m) => ({ line: lineAt(literal, m.index), kind: 'arbitrary-class', match: m[0] })),
    ...found('hex', HEX, 2, (m) => m[1].length),
    ...found('rgb', RGB),
    ...found('keyword', KEYWORD_ALONE),
    ...found('keyword', KEYWORD_IN_VALUE),
    ...found('raw-white-black', RAW),
    ...found('palette', TAILWIND_PALETTE),
  ];
};

const reasonOf = (comment) => {
  const m = MARKER.exec(comment.text);
  if (m === null) return null;
  return m[1].replace(/\*\/.*$/, '').replace(/[}\s]+$/, '').trim();
};

/** Les violations d'UNE source, marqueurs appliqués, triées par ligne. */
export const scanSource = (text) => {
  const { strings, comments } = lexe(text);
  const markers = comments.flatMap((comment) => {
    const reason = reasonOf(comment);
    return reason === null ? [] : [{ line: comment.line, reason }];
  });
  const exempted = new Set(
    markers.filter((m) => /\p{L}/u.test(m.reason) && m.reason.length >= 3).flatMap((m) => [m.line, m.line + 1]),
  );
  const orphans = markers
    .filter((m) => !(/\p{L}/u.test(m.reason) && m.reason.length >= 3))
    .map((m) => ({ line: m.line, kind: 'marker-without-reason', match: 'harmony-exempt:' }));
  const found = strings.flatMap(violationsOf).filter((v) => !exempted.has(v.line));
  return [...orphans, ...found].sort((a, b) => a.line - b.line || RANK[a.kind] - RANK[b.kind]);
};

/** Le rapport sur un ensemble de sources `{ path, text }` (chemins relatifs à src/). */
export const auditSources = (sources) => {
  const scoped = sources.filter((source) => isInScope(source.path));
  const exempt = scoped.filter((source) => exemptionOf(source.path) !== null);
  const files = scoped
    .filter((source) => exemptionOf(source.path) === null)
    .map((source) => ({ path: source.path, violations: scanSource(source.text) }))
    .filter((file) => file.violations.length > 0)
    .sort((a, b) => b.violations.length - a.violations.length || a.path.localeCompare(b.path));
  return {
    total: files.reduce((sum, file) => sum + file.violations.length, 0),
    files,
    exemptFiles: exempt.map((source) => ({ path: source.path, reason: exemptionOf(source.path) })),
  };
};

// --- le pilote ------------------------------------------------------------------

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const normalise = (path) => path.replace(/^\.\//, '').replace(/^(?:apps\/web\/)?src\//, '');

const sourcesFrom = (paths) =>
  paths.map((path) => ({ path, text: readFileSync(join(SRC, path), 'utf8') }));

const format = (report) =>
  [
    ...report.files.flatMap((file) => [
      `${file.path}  (${file.violations.length})`,
      ...file.violations.map((v) => `  ${String(v.line).padStart(5)}  ${v.kind.padEnd(22)} ${v.match}`),
    ]),
    report.total === 0
      ? 'harmonie: aucune couleur écrite en dur hors des exemptions déclarées.'
      : `harmonie: ${report.total} violation(s) dans ${report.files.length} fichier(s) — table motif → jeton : docs/product/charte-visuelle-web.md`,
  ].join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const filesAt = args.indexOf('--files');
  const paths =
    filesAt === -1
      ? walk(SRC).map((full) => relative(SRC, full))
      : args.slice(filesAt + 1).filter((arg) => !arg.startsWith('--')).map(normalise);
  const report = auditSources(sourcesFrom(paths));
  process.stdout.write(args.includes('--json') ? `${JSON.stringify(report, null, 1)}\n` : `${format(report)}\n`);
  process.exitCode = report.total === 0 ? 0 : 1;
}
