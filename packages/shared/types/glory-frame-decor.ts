/**
 * LE TRI DES TEXTES DE DÉCOR D'UN CADRE DE GLOIRE (#10256, § 5.2 de
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md`). L'export sort
 * chaque `<text>` hors plaque en emplacement `decor.<n>` ; la table
 * `packages/shared/design/glory-frames/decor-texts.json`, écrite à la main, le
 * range dans l'un de trois sorts :
 *  - `baked` : neutre (nombre, unité, symbole chimique, nom propre) — l'export
 *    le CUIT dans la couche `decor`, il quitte le contrat ;
 *  - `translated` : sa clé `game.frame.decor.<mot>` vit dans le catalogue des
 *    sept langues (`decor-strings/<langue>.json`), le contrat la porte et les
 *    chaînes du pack la servent ;
 *  - `live` : une donnée du moment (niveau, numéro, date, missions) que le
 *    peintre remplit (L14, #10167).
 *
 * Un texte de décor que la table ne range pas est REFUSÉ, et l'échantillon
 * de l'export (`sample`) doit être celui que la table a rangé : un emplacement
 * renuméroté ne garde pas son tri en silence.
 */
import * as z from 'zod/mini';
import { PACK_LANGUAGES, type PackLanguage } from './content-pack.js';
import type { PackStrings } from './glory-frame-pack.js';
import type { GloryFrame } from './glory-frames.js';
import { GLORY_DECOR_KEY_PATTERN, GLORY_DECOR_LIVE_DATA, GLORY_DECOR_SLOT_PATTERN, type GloryDecorLiveData } from './glory-frame-decor-vocabulary.js';

export { GLORY_DECOR_KEY_PATTERN, GLORY_DECOR_LIVE_DATA, GLORY_DECOR_SLOT_PATTERN, type GloryDecorLiveData };

const sample = z.string().check(z.maxLength(400));

const sortSchema = z.discriminatedUnion('sort', [
  z.object({ sample, sort: z.literal('baked') }),
  z.object({ sample, sort: z.literal('translated'), key: z.string().check(z.regex(GLORY_DECOR_KEY_PATTERN)) }),
  z.object({ sample, sort: z.literal('live'), data: z.enum(GLORY_DECOR_LIVE_DATA) }),
]);
export type GloryDecorTextSort = z.infer<typeof sortSchema>;

const tableSchema = z.object({
  frames: z.record(z.string(), z.record(z.string().check(z.regex(GLORY_DECOR_SLOT_PATTERN)), sortSchema)),
});

/** `cadre → emplacement → tri`. */
export type GloryDecorTextTable = Readonly<Record<string, Readonly<Record<string, GloryDecorTextSort>>>>;

/** Le catalogue des textes de décor traduits, une table par langue. */
export type GloryDecorCatalogue = Partial<Record<PackLanguage, PackStrings>>;

/** Lit la table ; `null` dès qu'une ligne est illisible : une source de design ne se lit pas à moitié. */
export function parseGloryDecorTextTable(input: unknown): GloryDecorTextTable | null {
  const parsed = tableSchema.safeParse(input);
  return parsed.success ? parsed.data.frames : null;
}

const isDecorSlot = (slot: string): boolean => GLORY_DECOR_SLOT_PATTERN.test(slot);

type TextSlot = GloryFrame['formats']['story']['text'][string];

const sortedSlot = (slot: TextSlot, sort: GloryDecorTextSort | undefined): TextSlot => {
  const { i18n: _i18n, live: _live, ...bare } = slot;
  if (sort?.sort === 'translated') return { ...bare, i18n: sort.key };
  if (sort?.sort === 'live') return { ...bare, live: sort.data };
  return bare;
};

/** Le cadre dont chaque texte de décor porte le tri de la table : la clé d'un texte traduit, la donnée d'un texte vivant. */
export function sortGloryDecorTexts(frame: GloryFrame, table: GloryDecorTextTable): GloryFrame {
  const sorts = table[frame.id] ?? {};
  const story = frame.formats.story;
  const text = Object.fromEntries(Object.entries(story.text).map(([key, slot]) => [key, isDecorSlot(key) ? sortedSlot(slot, sorts[key]) : slot]));
  return { ...frame, formats: { ...frame.formats, story: { ...story, text } } };
}

const agrees = (slot: TextSlot, sort: GloryDecorTextSort): boolean => {
  const expected = sortedSlot(slot, sort);
  return expected.i18n === slot.i18n && expected.live === slot.live;
};

function slotViolations(frame: GloryFrame, table: GloryDecorTextTable): readonly string[] {
  const sorts = table[frame.id] ?? {};
  return Object.entries(frame.formats.story.text)
    .filter(([key]) => isDecorSlot(key))
    .flatMap(([key, slot]) => {
      const sort = sorts[key];
      const where = `${frame.id}#${key}`;
      if (sort === undefined) return [`${where} : texte de décor ni traduit ni déclaré neutre (« ${slot.sample} »)`];
      if (sort.sample !== slot.sample) return [`${where} : la table range « ${sort.sample} », l’export porte « ${slot.sample} »`];
      if (!agrees(slot, sort)) return [`${where} : le contrat ne porte pas le tri de la table (rejouer \`bun run glory-frames:decor-texts\`)`];
      return [];
    });
}

function orphanEntries(frames: readonly GloryFrame[], table: GloryDecorTextTable): readonly string[] {
  const slots = new Set(frames.flatMap((frame) => Object.keys(frame.formats.story.text).map((key) => `${frame.id}#${key}`)));
  return Object.entries(table).flatMap(([id, sorts]) =>
    Object.entries(sorts)
      .filter(([key, sort]) => sort.sort !== 'baked' && !slots.has(`${id}#${key}`))
      .map(([key]) => `${id}#${key} : entrée de table sans emplacement dans le contrat`),
  );
}

const translatedKeys = (table: GloryDecorTextTable): readonly string[] =>
  [...new Set(Object.values(table).flatMap((sorts) => Object.values(sorts).flatMap((sort) => (sort.sort === 'translated' ? [sort.key] : []))))].sort();

function catalogueViolations(table: GloryDecorTextTable, catalogue: GloryDecorCatalogue): readonly string[] {
  const used = translatedKeys(table);
  const missing = used.flatMap((key) => PACK_LANGUAGES.filter((language) => !catalogue[language]?.[key]).map((language) => `${key} : clé absente en ${language}`));
  const offered = [...new Set(PACK_LANGUAGES.flatMap((language) => Object.keys(catalogue[language] ?? {})))].sort();
  const unused = offered.filter((key) => !used.includes(key)).map((key) => `${key} : clé du catalogue que rien n’emploie`);
  return [...missing, ...unused];
}

/** Tout ce qui empêche les textes de décor d'être rangés : vide quand chacun est traduit, cuit ou vivant, et dit dans les sept langues. */
export function gloryDecorTextViolations(input: {
  readonly frames: readonly GloryFrame[];
  readonly table: GloryDecorTextTable;
  readonly catalogue: GloryDecorCatalogue;
}): readonly string[] {
  return [...input.frames.flatMap((frame) => slotViolations(frame, input.table)), ...orphanEntries(input.frames, input.table), ...catalogueViolations(input.table, input.catalogue)];
}

/** Les textes NEUTRES que le contrat porte encore en emplacement : le prochain réexport les cuit dans le décor. */
export function bakedGloryDecorTextsInContract(frames: readonly GloryFrame[], table: GloryDecorTextTable): readonly string[] {
  return frames.flatMap((frame) =>
    Object.keys(frame.formats.story.text)
      .filter((key) => table[frame.id]?.[key]?.sort === 'baked')
      .map((key) => `${frame.id}#${key}`),
  );
}

/** Les chaînes de décor d'un pack dans une langue : les seules clés que ses cadres emploient. */
export function gloryDecorStringsOf(frames: readonly GloryFrame[], strings: PackStrings): PackStrings {
  const keys = new Set(frames.flatMap((frame) => Object.values(frame.formats.story.text).flatMap((slot) => (slot.i18n === undefined ? [] : [slot.i18n]))));
  return Object.fromEntries(Object.entries(strings).filter(([key]) => keys.has(key)));
}
