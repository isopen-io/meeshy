import {
  ALL_TEMPLATE_IDS,
  CARD_LINKS,
  CARD_PALETTE_IDS,
  CARD_PALETTES,
  CARD_TYPEFACE_IDS,
  templateIdOf,
  templateOf,
  type CardLinkId,
  type CardPalette,
  type CardTypefaceId,
  type MessageCardTemplateId,
} from './message-card-templates';
import type { TemplateUsage } from './message-card-usage';

/**
 * **CHERCHER PARMI LES TEMPLATES** — la galerie du composer montre des
 * centaines de cartes ; on y cherche avec les MOTS que l'utilisateur voit
 * (le nom de la palette, de la typographie, de la liaison, dans sa langue) et
 * ceux qui décrivent le ton (« sombre », « clair »). La recherche ignore la
 * casse et les accents, et chaque mot tapé doit commencer un mot d'un template :
 * « pl sombre » trouve les cartes « Plume » sur fond sombre.
 *
 * L'ORDRE DE LA GALERIE est pensé pour être parcouru : les templates les plus
 * utilisés d'abord, puis un brassage où deux cartes voisines ne partagent ni
 * palette, ni typographie, ni liaison — la première rangée montre déjà l'éventail.
 */

export type CardTone = 'dark' | 'light';

/** Une palette sombre s'écrit en blanc ; une claire, à l'encre. */
export const paletteTone = (palette: CardPalette): CardTone => (palette.replyInk === '#FFFFFF' ? 'dark' : 'light');

export type TemplateVocabulary = {
  readonly typeface: Readonly<Record<CardTypefaceId, string>>;
  readonly link: Readonly<Record<CardLinkId, string>>;
  readonly tone: Readonly<Record<CardTone, string>>;
};

export const foldText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLocaleLowerCase('en');

const wordsOf = (text: string): readonly string[] => foldText(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');

/** Les mots d'un template, dans la langue de l'interface — et ses identifiants, stables d'une langue à l'autre. */
export function templateWords(id: MessageCardTemplateId, vocabulary: TemplateVocabulary): readonly string[] {
  const template = templateOf(id);
  return [
    template.palette.name,
    vocabulary.typeface[template.typefaceId],
    vocabulary.link[template.link],
    vocabulary.tone[paletteTone(template.palette)],
    template.paletteId,
    template.typefaceId,
    template.link,
  ].flatMap(wordsOf);
}

/**
 * Les 784 templates dans l'ordre de la galerie : un brassage BIJECTIF — la
 * palette tourne à chaque pas, la typographie et la liaison aussi, décalées —
 * si bien que deux voisins diffèrent sur les trois dimensions.
 */
export const GALLERY_ORDER: readonly MessageCardTemplateId[] = ALL_TEMPLATE_IDS.map((_, k) => {
  const a = k % CARD_PALETTE_IDS.length;
  const b = Math.floor(k / CARD_PALETTE_IDS.length) % CARD_TYPEFACE_IDS.length;
  const c = Math.floor(k / (CARD_PALETTE_IDS.length * CARD_TYPEFACE_IDS.length)) % CARD_LINKS.length;
  return templateIdOf({
    palette: CARD_PALETTE_IDS[a] ?? 'aurore',
    typeface: CARD_TYPEFACE_IDS[(a + b) % CARD_TYPEFACE_IDS.length] ?? 'rond',
    link: CARD_LINKS[(a + b + c) % CARD_LINKS.length] ?? 'orbite',
  });
});

/** Les templates qui répondent à `query`, les plus utilisés en tête ; une requête vide les rend tous. */
export function searchTemplates(params: {
  readonly query: string;
  readonly vocabulary: TemplateVocabulary;
  readonly usage?: TemplateUsage;
  readonly tone?: CardTone | null;
}): readonly MessageCardTemplateId[] {
  const terms = wordsOf(params.query);
  const usage = params.usage ?? {};
  const matches = GALLERY_ORDER.filter((id) => {
    if (params.tone != null && paletteTone(CARD_PALETTES[templateOf(id).paletteId]) !== params.tone) return false;
    if (terms.length === 0) return true;
    const words = templateWords(id, params.vocabulary);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  });
  const used = matches.filter((id) => (usage[id] ?? 0) > 0).sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0));
  return [...used, ...matches.filter((id) => (usage[id] ?? 0) === 0)];
}
