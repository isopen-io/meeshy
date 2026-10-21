#!/usr/bin/env node
/**
 * LA TABLE DES EMOJIS ET LEURS NOMS DE RECHERCHE (#10531) — générés, jamais
 * écrits à la main, et sans aucune dépendance : les deux sources sont les
 * fichiers publiés par Unicode.
 *
 *   - la liste, l'ordre, les groupes et la version de chaque emoji :
 *     `emoji-test.txt` (Unicode Emoji 16.0) ;
 *   - le nom et les mots-clés dans les sept langues du produit : les
 *     annotations du CLDR 47 (`cldr-annotations-full` et
 *     `cldr-annotations-derived-full`, cette dernière pour les drapeaux).
 *
 * Usage :
 *   node scripts/generate-emojis.mjs                 télécharge les sources puis écrit
 *   node scripts/generate-emojis.mjs --sources <dir> lit des sources déjà téléchargées
 *
 * Ce qui sort : `src/lib/emoji/emoji-table.ts` (les emojis par catégorie, et le
 * palier de version de chacun) et `src/lib/emoji/emoji-names-<langue>.ts` (une
 * ligne par emoji, dans l'ordre de la table : `nom|mot-clé|mot-clé`, sans les
 * mots-clés dont chaque mot figure déjà dans la ligne).
 *
 * Les variantes de teinte de peau et le groupe « Component » n'entrent pas dans
 * la table : elle ne porte que l'emoji de base, et UN DRAPEAU pour ceux qui
 * acceptent une teinte (#10533). La variante se CALCULE (`withSkinTone`,
 * `src/lib/emoji/emoji-skin-tone.ts` : le modificateur après le premier
 * caractère, à la place du sélecteur de présentation) ; le drapeau n'est posé
 * que si les CINQ variantes ainsi calculées figurent dans la liste d'Unicode —
 * un emoji à plusieurs personnages, qui veut un modificateur par personne, ne
 * le reçoit donc pas.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EMOJI_VERSION = '16.0';
const CLDR_VERSION = '47.0.0';
const LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'];

/** L'ordre des catégories est celui d'`EmojiGridCategory` (iOS), pas celui d'Unicode. */
const GROUPS = [
  ['smileys', 'Smileys & Emotion'],
  ['people', 'People & Body'],
  ['animals', 'Animals & Nature'],
  ['food', 'Food & Drink'],
  ['activities', 'Activities'],
  ['travel', 'Travel & Places'],
  ['objects', 'Objects'],
  ['symbols', 'Symbols'],
  ['flags', 'Flags'],
];

const SOURCES = {
  'emoji-test.txt': `https://unicode.org/Public/emoji/${EMOJI_VERSION}/emoji-test.txt`,
  ...Object.fromEntries(
    LANGUAGES.flatMap((language) => [
      [
        `ann-${language}.json`,
        `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}/cldr-json/cldr-annotations-full/annotations/${language}/annotations.json`,
      ],
      [
        `der-${language}.json`,
        `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}/cldr-json/cldr-annotations-derived-full/annotationsDerived/${language}/annotations.json`,
      ],
    ]),
  ),
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/lib/emoji');

const sourcesFlag = process.argv.indexOf('--sources');
const sourcesDir = sourcesFlag === -1 ? join(tmpdir(), `meeshy-emoji-sources-${EMOJI_VERSION}-${CLDR_VERSION}`) : resolve(process.argv[sourcesFlag + 1]);

async function source(name) {
  const path = join(sourcesDir, name);
  try {
    return await readFile(path, 'utf8');
  } catch {
    const response = await fetch(SOURCES[name]);
    if (!response.ok) throw new Error(`${SOURCES[name]} : HTTP ${response.status}`);
    const text = await response.text();
    await mkdir(sourcesDir, { recursive: true });
    await writeFile(path, text);
    return text;
  }
}

const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u;
const VARIATION_SELECTOR = /️/g;
const SKIN_TONE_MODIFIERS = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];

/** La jumelle de `withSkinTone` (`src/lib/emoji/emoji-skin-tone.ts`) — le témoin `emoji-catalogue.test.ts` tient les deux ensemble. */
function withSkinTone(emoji, modifier) {
  const [head, ...rest] = [...emoji];
  return [head, modifier, ...(rest[0] === '\uFE0F' ? rest.slice(1) : rest)].join('');
}

/** Le PALIER d'un emoji : la version majeure d'Unicode Emoji qui l'a introduit (0 avant la 1.0). */
const levelOf = (version) => Math.floor(Number(version));

function parseEmojiTest(text) {
  const byGroup = new Map(GROUPS.map(([id]) => [id, []]));
  const idOf = new Map(GROUPS.map(([id, title]) => [title, id]));
  const variants = new Set();
  let current = null;
  for (const line of text.split('\n')) {
    const group = /^# group: (.+)$/.exec(line);
    if (group !== null) {
      current = idOf.get(group[1].trim()) ?? null;
      continue;
    }
    if (current === null) continue;
    const entry = /^[0-9A-F ]+; fully-qualified\s+# (\S+) E(\d+\.\d+) (.+)$/.exec(line);
    if (entry === null) continue;
    const [, emoji, version, name] = entry;
    if (SKIN_TONE.test(emoji)) {
      variants.add(emoji);
      continue;
    }
    byGroup.get(current).push({ emoji, level: levelOf(version), name });
  }
  for (const emojis of byGroup.values()) {
    for (const entry of emojis) entry.toned = SKIN_TONE_MODIFIERS.every((modifier) => variants.has(withSkinTone(entry.emoji, modifier)));
  }
  return byGroup;
}

const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * La recherche exige chaque MOT de la requête quelque part dans la ligne : un mot-clé dont tous les mots
 * figurent déjà dans le nom ou dans un mot-clé précédent n'ajoute aucun résultat, il ne pèse que des octets.
 */
const wordsOf = (text) => fold(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);

function namesOf(emojis, annotations, derived) {
  return emojis.map(({ emoji, name: fallback }) => {
    const key = emoji.replace(VARIATION_SELECTOR, '');
    const found = annotations[emoji] ?? annotations[key] ?? derived[emoji] ?? derived[key];
    const name = (found?.tts?.[0] ?? fallback).replace(/[|\n]/g, ' ').trim();
    const seen = new Set(wordsOf(name));
    const keywords = (found?.default ?? [])
      .map((keyword) => keyword.replace(/[|\n]/g, ' ').trim())
      .filter((keyword) => {
        const fresh = wordsOf(keyword).filter((word) => !seen.has(word));
        fresh.forEach((word) => seen.add(word));
        return fresh.length > 0;
      });
    return [name, ...keywords].join('|');
  });
}

const header = `/* GÉNÉRÉ par scripts/generate-emojis.mjs (Unicode Emoji ${EMOJI_VERSION}, CLDR ${CLDR_VERSION}) — ne pas modifier à la main. */\n`;

const byGroup = parseEmojiTest(await source('emoji-test.txt'));
const flat = GROUPS.flatMap(([id]) => byGroup.get(id));

const table = [
  header,
  `export const EMOJI_TABLE_SOURCE = { emoji: '${EMOJI_VERSION}', cldr: '${CLDR_VERSION}' } as const;\n`,
  '/**',
  ' * Une ligne par catégorie : son identifiant, ses emojis séparés par une espace, et le PALIER de chacun',
  ' * (un caractère en base 36 par emoji, dans le même ordre : la version majeure d’Unicode Emoji qui l’a introduit).',
  ' * Une catégorie dont des emojis acceptent une TEINTE DE PEAU porte un quatrième champ : un `1` ou un `0` par emoji.',
  ' */',
  'export const EMOJI_GROUPS: ReadonlyArray<readonly [id: string, emojis: string, levels: string, tones?: string]> = [',
  ...GROUPS.map(([id]) => {
    const emojis = byGroup.get(id);
    const tones = emojis.some(({ toned }) => toned) ? `, '${emojis.map(({ toned }) => (toned ? '1' : '0')).join('')}'` : '';
    return `  ['${id}', '${emojis.map(({ emoji }) => emoji).join(' ')}', '${emojis.map(({ level }) => level.toString(36)).join('')}'${tones}],`;
  }),
  '];',
  '',
].join('\n');

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'emoji-table.ts'), table);

for (const language of LANGUAGES) {
  const annotations = JSON.parse(await source(`ann-${language}.json`)).annotations.annotations;
  const derived = JSON.parse(await source(`der-${language}.json`)).annotationsDerived.annotations;
  const lines = namesOf(flat, annotations, derived);
  await writeFile(
    join(outDir, `emoji-names-${language}.ts`),
    `${header}\n/** Une ligne par emoji, dans l’ordre de \`EMOJI_GROUPS\` : \`nom|mot-clé|mot-clé\`. */\nexport default ${JSON.stringify(lines.join('\n'))};\n`,
  );
}

console.log(
  `${flat.length} emojis (${flat.filter(({ toned }) => toned).length} acceptent une teinte de peau), ${GROUPS.length} catégories, ${LANGUAGES.length} langues → ${outDir}`,
);
