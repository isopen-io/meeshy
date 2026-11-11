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
// Rouge si un compteur dépasse son budget (`scripts/verbosity-native-budgets.json`),
// si une famille mesurée n'a pas de budget, ou si un budget MONTE par rapport à
// la base (`origin/dev`, ou `VERBOSITY_BASE_REF`). Les deux compteurs de
// BAVARDAGE — longs et explications — ne remontent jamais. Les deux compteurs
// de VOLUME — libellés et mots — grandissent avec une feature : une famille
// listée dans `growth` avec son issue (`"#1234 — raison"`) peut les relever,
// et seulement eux.
//
// `--write` réécrit les budgets depuis le relevé (pour ABAISSER après une
// épure, ou inscrire une famille neuve) ; `growth` est conservé.
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
const VOLUME = new Set(['labels', 'words']);
const LABELS = { labels: 'libellés', words: 'mots', long: 'libellés de plus de 80 caractères', explanations: "libellés d'explication" };
const EXPLANATION = /hint|help|description|subtitle|detail|footer|info|explain|caption/i;
const LONG = 80;

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

export const measureIosCatalog = (origin, catalog) => {
  const families = {};
  for (const [key, entry] of Object.entries(catalog.strings ?? {})) {
    for (const value of frenchValues(key, entry, catalog.sourceLanguage)) add(families, `ios:${origin}/${iosFamilyOf(key)}`, key, value);
  }
  return families;
};

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

export const measureAndroidFiles = (files) => {
  const families = {};
  for (const { module, xml } of files) {
    for (const { key, value } of androidEntries(xml)) add(families, `android:${module}`, key, value);
  }
  return families;
};

const sorted = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

export const nativeProblems = ({ measured, budgets, previous }) => {
  const growth = budgets.growth ?? {};
  const overBudget = Object.entries(measured).flatMap(([family, counters]) => {
    const budget = budgets.families[family];
    if (budget === undefined) return [`${family} : famille sans budget — inscris-la (node scripts/check-verbosity-native.mjs --write)`];
    return COUNTERS.filter((counter) => counters[counter] > budget[counter]).map(
      (counter) => `${family} : ${counters[counter]} ${LABELS[counter]} pour un budget de ${budget[counter]} — l'écran redevient bavard`,
    );
  });
  if (previous === null) return overBudget;
  const raised = Object.entries(budgets.families).flatMap(([family, budget]) => {
    const base = previous.families[family];
    if (base === undefined) return [];
    const mayGrow = /#\d+/.test(growth[family] ?? '');
    return COUNTERS.filter((counter) => budget[counter] > base[counter] && !(VOLUME.has(counter) && mayGrow)).map((counter) =>
      VOLUME.has(counter)
        ? `${family} : le budget de ${LABELS[counter]} passe de ${base[counter]} à ${budget[counter]} — un budget ne peut que baisser (une feature qui ajoute des libellés courts inscrit la famille dans « growth » avec son issue)`
        : `${family} : le budget de ${LABELS[counter]} passe de ${base[counter]} à ${budget[counter]} — un budget ne peut que baisser`,
    );
  });
  return [...overBudget, ...raised];
};

export const budgetsFromMeasure = (measured, growth = {}) => ({ growth: sorted(growth), families: sorted(measured) });

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

export const measureRepository = (root) => {
  const ios = IOS_CATALOGS.map(({ origin, path }) => measureIosCatalog(origin, JSON.parse(readFileSync(join(root, path), 'utf8'))));
  return sorted(Object.assign({}, ...ios, measureAndroidFiles(androidFiles(root))));
};

const readBase = (root, ref) => {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const show = () => JSON.parse(git(['show', `${ref}:${BUDGETS_PATH}`]));
  try {
    return show();
  } catch {
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
  const measured = measureRepository(root);
  const budgetsFile = join(root, BUDGETS_PATH);
  if (process.argv.includes('--write')) {
    const growth = (() => {
      try {
        return JSON.parse(readFileSync(budgetsFile, 'utf8')).growth ?? {};
      } catch {
        return {};
      }
    })();
    writeFileSync(budgetsFile, `${JSON.stringify(budgetsFromMeasure(measured, growth), null, 2)}\n`);
    console.log(`  budgets réécrits : ${Object.keys(measured).length} familles`);
    return;
  }
  const budgets = JSON.parse(readFileSync(budgetsFile, 'utf8'));
  const ref = process.env.VERBOSITY_BASE_REF ?? 'origin/dev';
  const previous = readBase(root, ref);
  if (previous === null) console.log(`  note  aucun budget lisible sur ${ref} : le cliquet contre la base est sauté, les budgets restent tenus`);
  const problems = nativeProblems({ measured, budgets, previous });
  const below = Object.entries(measured).filter(([family, counters]) => {
    const budget = budgets.families[family];
    return budget !== undefined && COUNTERS.some((counter) => counters[counter] < budget[counter]);
  });
  if (below.length > 0) console.log(`  note  ${below.length} familles sous leur budget — abaisse-le (node scripts/check-verbosity-native.mjs --write)`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`ECHEC ${problem}`);
    process.exit(1);
  }
  const total = Object.values(measured).reduce((sum, counters) => ({ labels: sum.labels + counters.labels, explanations: sum.explanations + counters.explanations, long: sum.long + counters.long }), { labels: 0, explanations: 0, long: 0 });
  console.log(`  ok    ${Object.keys(measured).length} familles sous budget — ${total.labels} libellés, ${total.long} de plus de 80 caractères, ${total.explanations} d'explication`);
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
