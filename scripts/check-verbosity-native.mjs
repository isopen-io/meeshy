#!/usr/bin/env node
// LE CLIQUET DU TEXTE NATIF (#17587, épure #17584).
//
// Mesure, dans la valeur FRANÇAISE de chaque libellé, ce que les écrans iOS et
// Android ont à dire, famille par famille :
//   - iOS : les deux catalogues de l'application et du kit
//     (`apps/ios/Meeshy/Localizable.xcstrings`,
//     `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`),
//     famille = premier segment de la clé (`settings.privacy.title` →
//     `settings`) ; une clé qui EST la phrase source va dans `(phrases)` ;
//   - Android : `values-fr/strings*.xml` de chaque module, famille = le module
//     (`feature/settings`, `sdk-ui`).
// Quatre compteurs par famille : libellés, mots, libellés de plus de 80
// caractères, libellés d'explication (clé qui contient hint, help,
// description, subtitle, detail, footer, info, explain ou caption).
//
// Deux compteurs mesurent le BAVARDAGE — libellés de plus de 80 caractères et
// libellés d'explication : rouge si l'un dépasse son budget
// (`scripts/verbosity-native-budgets.json`). Deux mesurent le VOLUME — libellés
// et mots : ils grandissent avec chaque feature, le script dit quand ils
// dépassent, sans rougir. Et rouge si un budget, quel qu'il soit, MONTE par
// rapport à la base (`origin/dev`, ou `VERBOSITY_BASE_REF`). Une famille neuve
// (sans budget) est signalée ; son cliquet part du jour où on l'inscrit.
//
// `--write` n'ABAISSE que : chaque compteur d'une famille inscrite prend le plus
// petit du budget et du relevé, une famille neuve est inscrite à son relevé.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IOS_CATALOGS = [
  { origin: 'Meeshy', path: 'apps/ios/Meeshy/Localizable.xcstrings' },
  { origin: 'MeeshyUI', path: 'packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings' },
];
export const BUDGETS_PATH = 'scripts/verbosity-native-budgets.json';
export const COUNTERS = ['labels', 'words', 'long', 'explanations'];
const CEILINGS = ['long', 'explanations'];
const LABELS = { labels: 'libellés', words: 'mots', long: 'libellés de plus de 80 caractères', explanations: "libellés d'explication" };
const EXPLANATION = /hint|help|description|subtitle|detail|footer|info|explain|caption/i;
const LONG = 80;
// #19710 — un `ECHEC` NOMME les libellés qu'il refuse : dire « 2 libellés de plus de 80
// caractères » sans dire LESQUELS fait refaire le relevé à chaque passant (mesuré sur #19709).
// Borné : au-delà, le reste est annoncé — un rapport illisible ne vaut pas mieux qu'un rapport muet.
const OFFENDERS_SHOWN = 10;
const OFFENDER_EXCERPT = 60;

const empty = () => ({ labels: 0, words: 0, long: 0, explanations: 0 });

const wordsOf = (value) => {
  const text = value.trim();
  return text === '' ? 0 : text.split(/\s+/).length;
};

const add = (families, family, key, value) => {
  const counters = families[family] ?? empty();
  families[family] = {
    labels: counters.labels + 1,
    words: counters.words + wordsOf(value),
    long: counters.long + (value.length > LONG ? 1 : 0),
    explanations: counters.explanations + (EXPLANATION.test(key) ? 1 : 0),
  };
};

export const iosFamilyOf = (key) => {
  const dotted = /^([A-Za-z0-9_-]+)\./.exec(key);
  if (dotted !== null) return dotted[1];
  if (/^[A-Za-z0-9_-]+$/.test(key) && key.includes('_')) return key.split('_')[0];
  return '(phrases)';
};

const frenchValues = (key, entry, sourceLanguage) => {
  const fr = entry.localizations?.fr;
  if (fr?.stringUnit?.value !== undefined) return [fr.stringUnit.value];
  const variations = fr?.variations;
  if (variations !== undefined) {
    return Object.values(variations).flatMap((cases) => Object.values(cases).map((variant) => variant.stringUnit?.value).filter((value) => typeof value === 'string'));
  }
  return sourceLanguage === 'fr' ? [key] : [];
};

// Les PAIRES `{ famille, clé, valeur }` sont la source unique des deux projections : les COMPTEURS
// (ce que les budgets tiennent) et le RELEVÉ des coupables (ce que l'`ECHEC` nomme). Deux balayages
// séparés divergeraient sur la famille, la valeur française ou les pluriels — un pour un.
export const iosPairs = (origin, catalog) =>
  Object.entries(catalog.strings ?? {}).flatMap(([key, entry]) =>
    frenchValues(key, entry, catalog.sourceLanguage).map((value) => ({ family: `ios:${origin}/${iosFamilyOf(key)}`, key, value })),
  );

const countPairs = (pairs) => {
  const families = {};
  for (const { family, key, value } of pairs) add(families, family, key, value);
  return families;
};

export const offendersOfPairs = (pairs) => {
  const byFamily = {};
  for (const { family, key, value } of pairs) {
    const slot = byFamily[family] ?? { long: [], explanations: [] };
    if (value.length > LONG) slot.long.push({ key, value });
    if (EXPLANATION.test(key)) slot.explanations.push({ key, value });
    byFamily[family] = slot;
  }
  return byFamily;
};

export const measureIosCatalog = (origin, catalog) => countPairs(iosPairs(origin, catalog));

const unescapeAndroid = (raw) =>
  raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\\(['"@?])/g, '$1')
    .replace(/\\n/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export const androidEntries = (xml) => {
  const source = xml.replace(/<!--[\s\S]*?-->/g, '');
  const strings = [...source.matchAll(/<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map(([, key, raw]) => ({ key, value: unescapeAndroid(raw) }));
  const groups = [...source.matchAll(/<(plurals|string-array)\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)].flatMap(([, , key, body]) =>
    [...body.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)].map(([, raw]) => ({ key, value: unescapeAndroid(raw) })),
  );
  return [...strings, ...groups];
};

export const androidPairs = (files) =>
  files.flatMap(({ module, xml }) => androidEntries(xml).map(({ key, value }) => ({ family: `android:${module}`, key, value })));

export const measureAndroidFiles = (files) => countPairs(androidPairs(files));

const sorted = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

const exceeding = (counters, budget, keys) => keys.filter((counter) => counters[counter] > budget[counter]);

const offenderLines = (list) => {
  const shown = list.slice(0, OFFENDERS_SHOWN);
  const lines = shown.map(({ key, value }) => {
    const excerpt = value.length > OFFENDER_EXCERPT ? `${value.slice(0, OFFENDER_EXCERPT)}…` : value;
    return `    ${String(value.length).padStart(4)}  ${key}  « ${excerpt} »`;
  });
  const rest = list.length - shown.length;
  return rest > 0 ? [...lines, `    … et ${rest} de plus`] : lines;
};

export const nativeVerdict = ({ measured, budgets, previous, offenders = {} }) => {
  const notes = [];
  const overBudget = Object.entries(measured).flatMap(([family, counters]) => {
    const budget = budgets.families[family];
    if (budget === undefined) {
      notes.push(`${family} : famille neuve, sans budget — inscris-la (node scripts/check-verbosity-native.mjs --write)`);
      return [];
    }
    for (const counter of exceeding(counters, budget, ['labels', 'words'])) notes.push(`${family} : ${counters[counter]} ${LABELS[counter]} pour un budget de ${budget[counter]}`);
    return exceeding(counters, budget, CEILINGS).map((counter) =>
      [
        `${family} : ${counters[counter]} ${LABELS[counter]} pour un budget de ${budget[counter]} — l'écran redevient bavard, range l'explication derrière un (i)`,
        ...offenderLines(offenders[family]?.[counter] ?? []),
      ].join('\n'),
    );
  });
  const raised =
    previous === null
      ? []
      : Object.entries(budgets.families).flatMap(([family, budget]) => {
          const base = previous.families[family];
          if (base === undefined) return [];
          return exceeding(budget, base, COUNTERS).map((counter) => `${family} : le budget de ${LABELS[counter]} passe de ${base[counter]} à ${budget[counter]} — un budget ne peut que baisser`);
        });
  return { problems: [...overBudget, ...raised], notes };
};

export const lowerBudgets = (existing, measured) => ({
  families: sorted(
    Object.fromEntries(
      Object.entries(measured).map(([family, counters]) => {
        const budget = existing.families?.[family];
        if (budget === undefined) return [family, counters];
        return [family, Object.fromEntries(COUNTERS.map((counter) => [counter, Math.min(budget[counter], counters[counter])]))];
      }),
    ),
  ),
});

const androidFiles = (root) => {
  const found = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      if (name === 'build' || name === 'node_modules' || name.startsWith('.')) continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/^strings.*\.xml$/.test(name) && directory.endsWith(`${join('res', 'values-fr')}`)) found.push(path);
    }
  };
  walk(join(root, 'apps/android'));
  return found.sort().map((path) => ({ module: relative(join(root, 'apps/android'), path).split(`${join('src')}/`)[0].replace(/\/$/, ''), xml: readFileSync(path, 'utf8') }));
};

/** `{ measured, offenders }` — les compteurs que les budgets tiennent, et le relevé que l'`ECHEC` nomme. */
export const measureRepository = (root) => {
  const pairs = [
    ...IOS_CATALOGS.flatMap(({ origin, path }) => iosPairs(origin, JSON.parse(readFileSync(join(root, path), 'utf8')))),
    ...androidPairs(androidFiles(root)),
  ];
  return { measured: sorted(countPairs(pairs)), offenders: offendersOfPairs(pairs) };
};

const readBase = (root, ref) => {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const show = () => JSON.parse(git(['show', `${ref}:${BUDGETS_PATH}`]));
  try {
    return show();
  } catch {
    // En intégration continue seulement (clone à une profondeur) : localement, un `--depth=1` poserait une
    // frontière superficielle sur la base et couperait l'historique commun — on y laisse `git fetch origin dev` à la main.
    if (process.env.CI !== 'true') return null;
    try {
      const [remote, ...branch] = ref.split('/');
      git(['fetch', '--no-tags', '--depth=1', remote, `${branch.join('/')}:refs/remotes/${ref}`]);
      return show();
    } catch {
      return null;
    }
  }
};

const main = () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { measured, offenders } = measureRepository(root);
  const budgetsFile = join(root, BUDGETS_PATH);
  if (process.argv.includes('--write')) {
    const existing = (() => {
      try {
        return JSON.parse(readFileSync(budgetsFile, 'utf8'));
      } catch {
        return { families: {} };
      }
    })();
    writeFileSync(budgetsFile, `${JSON.stringify(lowerBudgets(existing, measured), null, 2)}\n`);
    console.log(`  budgets abaissés : ${Object.keys(measured).length} familles`);
    return;
  }
  const budgets = JSON.parse(readFileSync(budgetsFile, 'utf8'));
  const ref = process.env.VERBOSITY_BASE_REF ?? 'origin/dev';
  const previous = readBase(root, ref);
  if (previous === null) console.log(`  note  aucun budget lisible sur ${ref} : le cliquet contre la base est sauté, les budgets restent tenus`);
  const { problems, notes } = nativeVerdict({ measured, budgets, previous, offenders });
  for (const note of notes) console.log(`  note  ${note}`);
  const below = Object.entries(measured).filter(([family, counters]) => {
    const budget = budgets.families[family];
    return budget !== undefined && CEILINGS.some((counter) => counters[counter] < budget[counter]);
  });
  if (below.length > 0) console.log(`  note  ${below.length} familles ont moins de bavardage que leur budget — abaisse-le (node scripts/check-verbosity-native.mjs --write)`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`ECHEC ${problem}`);
    process.exit(1);
  }
  const total = Object.values(measured).reduce((sum, counters) => ({ labels: sum.labels + counters.labels, explanations: sum.explanations + counters.explanations, long: sum.long + counters.long }), { labels: 0, explanations: 0, long: 0 });
  console.log(`  ok    ${Object.keys(measured).length} familles sous budget — ${total.labels} libellés, ${total.long} de plus de 80 caractères, ${total.explanations} d'explication`);
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
