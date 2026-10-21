/**
 * LE CATALOGUE DES EMOJIS (#10531) — la jumelle web d'`EmojiGridCategory`
 * (`apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`) : les mêmes
 * catégories dans le même ordre, mais sur la liste ENTIÈRE d'Unicode plutôt
 * que sur une sélection écrite à la main.
 *
 * Ce module ne porte AUCUNE donnée. La table (`emoji-table.ts`) et les noms de
 * recherche (`emoji-names-<langue>.ts`) sont générés par
 * `scripts/generate-emojis.mjs` et n'arrivent que par `import()` : la table à
 * l'ouverture de la feuille, les noms d'UNE langue à la première recherche.
 */
import type { InterfaceLanguage } from '@/lib/interface-language';

import { skinToneKey } from './emoji-skin-tone';

export const EMOJI_GROUP_IDS = ['smileys', 'people', 'animals', 'food', 'activities', 'travel', 'objects', 'symbols', 'flags'] as const;

export type EmojiGroupId = (typeof EMOJI_GROUP_IDS)[number];

export type EmojiCategoryId = 'recent' | EmojiGroupId;

export const EMOJI_CATEGORY_IDS: readonly EmojiCategoryId[] = ['recent', ...EMOJI_GROUP_IDS];

export type EmojiEntry = {
  readonly emoji: string;
  /** La version majeure d'Unicode Emoji qui l'a introduit (`emoji-support.ts`). */
  readonly level: number;
  /** Son rang dans la table entière : la ligne de son nom dans `emoji-names-<langue>.ts`. */
  readonly position: number;
  /** Accepte-t-il une teinte de peau (`emoji-skin-tone.ts`) ? */
  readonly toned: boolean;
};

export type EmojiIndex = {
  readonly all: readonly EmojiEntry[];
  readonly byGroup: ReadonlyMap<EmojiGroupId, readonly EmojiEntry[]>;
  /** Les emojis qui acceptent une teinte, par leur clé (`skinToneKey`) : une variante y retrouve sa base. */
  readonly tonable: ReadonlyMap<string, string>;
};

type RawGroup = readonly [id: string, emojis: string, levels: string, tones?: string];

type Sized = { readonly entries: readonly EmojiEntry[]; readonly groups: ReadonlyArray<readonly [EmojiGroupId, readonly EmojiEntry[]]> };

export function buildEmojiIndex(groups: readonly RawGroup[]): EmojiIndex {
  const sized = EMOJI_GROUP_IDS.reduce<Sized>(
    (built, id) => {
      const raw = groups.find(([candidate]) => candidate === id);
      if (raw === undefined) return built;
      const emojis = raw[1].split(' ');
      if (emojis.length !== raw[2].length) throw new Error(`Table des emojis « ${id} » : ${emojis.length} emojis pour ${raw[2].length} paliers.`);
      const tones = raw[3] ?? '';
      if (tones !== '' && tones.length !== emojis.length) throw new Error(`Table des emojis « ${id} » : ${emojis.length} emojis pour ${tones.length} drapeaux de teinte.`);
      const entries = emojis.map((emoji, rank) => ({
        emoji,
        level: Number.parseInt(raw[2].charAt(rank), 36),
        position: built.entries.length + rank,
        toned: tones.charAt(rank) === '1',
      }));
      return { entries: [...built.entries, ...entries], groups: [...built.groups, [id, entries] as const] };
    },
    { entries: [], groups: [] },
  );
  return {
    all: sized.entries,
    byGroup: new Map(sized.groups),
    tonable: new Map(sized.entries.filter((entry) => entry.toned).map((entry) => [skinToneKey(entry.emoji), entry.emoji])),
  };
}

type OnDemand<T> = { value: T | null; pending: Promise<T> | null };

function onDemand<T>(slot: OnDemand<T>, load: () => Promise<T>): Promise<T> {
  if (slot.value !== null) return Promise.resolve(slot.value);
  if (slot.pending !== null) return slot.pending;
  const request = load().then(
    (value) => {
      slot.value = value;
      slot.pending = null;
      return value;
    },
    (error: unknown) => {
      slot.pending = null;
      throw error;
    },
  );
  slot.pending = request;
  return request;
}

const indexSlot: OnDemand<EmojiIndex> = { value: null, pending: null };

export const loadedEmojiIndex = (): EmojiIndex | null => indexSlot.value;

export const loadEmojiIndex = (): Promise<EmojiIndex> =>
  onDemand(indexSlot, () => import('./emoji-table').then((table) => buildEmojiIndex(table.EMOJI_GROUPS)));

/** Les lignes de recherche d'une langue, DÉJÀ pliées (`foldSearch`) : `nom|mot-clé|mot-clé`, une par emoji. */
export type EmojiNames = readonly string[];

const NAME_LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<{ readonly default: string }>>> = {
  fr: () => import('./emoji-names-fr'),
  en: () => import('./emoji-names-en'),
  es: () => import('./emoji-names-es'),
  pt: () => import('./emoji-names-pt'),
  de: () => import('./emoji-names-de'),
  it: () => import('./emoji-names-it'),
  ar: () => import('./emoji-names-ar'),
};

const nameSlots = new Map<InterfaceLanguage, OnDemand<EmojiNames>>();

function nameSlot(language: InterfaceLanguage): OnDemand<EmojiNames> {
  const known = nameSlots.get(language);
  if (known !== undefined) return known;
  const fresh: OnDemand<EmojiNames> = { value: null, pending: null };
  nameSlots.set(language, fresh);
  return fresh;
}

export const loadedEmojiNames = (language: InterfaceLanguage): EmojiNames | null => nameSlot(language).value;

export const loadEmojiNames = (language: InterfaceLanguage): Promise<EmojiNames> =>
  onDemand(nameSlot(language), () => NAME_LOADERS[language]().then((names) => names.default.split('\n').map(foldSearch)));

const LIGATURES: Readonly<Record<string, string>> = { œ: 'oe', æ: 'ae', ß: 'ss' };

/** Sans casse, sans accent, sans ligature : « Cœur » et « coeur » cherchent la même chose. */
export const foldSearch = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[œæß]/g, (ligature) => LIGATURES[ligature] ?? ligature)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

const nameOf = (line: string): string => line.split('|', 1)[0] ?? '';

/**
 * CHAQUE MOT de la requête doit se trouver dans la ligne de l'emoji. Ceux dont
 * le NOM les porte tous passent devant ceux qui ne les doivent qu'à un mot-clé ;
 * dans chaque rang, l'ordre de la table.
 */
export function searchEmojis({
  index,
  names,
  query,
  maxLevel,
  limit,
}: {
  readonly index: EmojiIndex;
  readonly names: EmojiNames;
  readonly query: string;
  readonly maxLevel: number;
  readonly limit: number;
}): readonly string[] {
  const terms = foldSearch(query).split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) return [];
  const holds = (text: string) => terms.every((term) => text.includes(term));
  const matches = index.all.filter((entry) => entry.level <= maxLevel && holds(names[entry.position] ?? ''));
  const named = matches.filter((entry) => holds(nameOf(names[entry.position] ?? '')));
  const keyworded = matches.filter((entry) => !holds(nameOf(names[entry.position] ?? '')));
  return [...named, ...keyworded].slice(0, Math.max(0, limit)).map((entry) => entry.emoji);
}
