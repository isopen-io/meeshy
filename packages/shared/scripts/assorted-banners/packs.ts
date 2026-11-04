/**
 * Les packs de BANNIÈRES ASSORTIES (#15553) : un par pack de contours illustrés (#13960) et par pack de
 * Noël, sous le MÊME nom de pack, avec le même ordre de motifs, les mêmes clés et la même palette. Le slug
 * diffère (la table des noms de packs est commune à tous les domaines) ; la description dit ce que la
 * bannière montre, et nomme ses motifs.
 */
import { CHRISTMAS_BANNERS } from '../christmas/banners.js';
import { CHRISTMAS_RING_PACKS } from '../christmas/packs.js';
import { ILLUSTRATED_PACKS, LANGUAGES, type IllustratedPack, type Language } from '../illustrated-rings/packs.js';
import type { AssortedBanner } from './draw.js';
import { AFRICAINS_BANNERS, ASIATIQUES_BANNERS, CELTES_BANNERS, NORDIQUES_BANNERS } from './familles-est-nord.js';
import { AMERINDIENS_BANNERS, AUSTRAUX_BANNERS, EGYPTIENS_BANNERS, INDIENS_BANNERS, MAYAS_BANNERS } from './familles-sud-ouest.js';
import { VITRINE_BANNERS } from './vitrine.js';

export type AssortedBannerPack = {
  readonly slug: string;
  /** Le slug du pack de contours d'avatar dont il est le pendant. */
  readonly ringPack: string;
  readonly names: Readonly<Record<Language, { readonly name: string; readonly description: string }>>;
  readonly frames: readonly AssortedBanner[];
};

const ANDS: Readonly<Record<Language, string>> = { fr: ' et ', en: ' and ', es: ' y ', pt: ' e ', de: ' und ', it: ' e ', ar: ' و' };
const COMMAS: Readonly<Record<Language, string>> = { fr: ', ', en: ', ', es: ', ', pt: ', ', de: ', ', it: ', ', ar: '، ' };

const listOf = (language: Language, items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(COMMAS[language])}${ANDS[language]}${items[items.length - 1]}`;

const DESCRIBE: Readonly<Record<Language, (pack: string, motifs: string) => string>> = {
  fr: (pack, motifs) => `Les cadres de bannière assortis à « ${pack} » : ${motifs}, posés en bordure pour laisser voir votre photo.`,
  en: (pack, motifs) => `Banner frames to match “${pack}”: ${motifs}, kept to the edge so your photo stays in view.`,
  es: (pack, motifs) => `Los marcos de portada a juego con «${pack}»: ${motifs}, en el borde para que tu foto siga a la vista.`,
  pt: (pack, motifs) => `As molduras de capa a condizer com «${pack}»: ${motifs}, na borda para que a tua foto fique à vista.`,
  de: (pack, motifs) => `Bannerrahmen passend zu „${pack}“: ${motifs}, nur am Rand, damit dein Foto sichtbar bleibt.`,
  it: (pack, motifs) => `Le cornici per il banner abbinate a «${pack}»: ${motifs}, al bordo perché la tua foto resti visibile.`,
  ar: (pack, motifs) => `أطر لافتة تُناسب «${pack}»: ${motifs}، عند الحافة كي تبقى صورتك ظاهرة.`,
};

/** Le pack de bannières assorti à `ring` : même nom, motifs dans le même ordre, slug `bannieres-…`. */
function assorted(ring: IllustratedPack, slug: string, frames: readonly AssortedBanner[]): AssortedBannerPack {
  const keys = ring.frames.map((frame) => frame.key);
  if (frames.map((frame) => frame.key).join() !== keys.join()) throw new Error(`${slug} : les motifs ne suivent pas ceux de ${ring.slug}`);
  const names = Object.fromEntries(
    LANGUAGES.map((language) => {
      const name = ring.names[language].name;
      const motifs = listOf(language, ring.frames.map((frame) => frame.names[language]));
      return [language, { name, description: DESCRIBE[language](name, motifs) }];
    }),
  ) as AssortedBannerPack['names'];
  return { slug, ringPack: ring.slug, names, frames };
}

const BANNER_SLUGS: Readonly<Record<string, string>> = {
  'cadres-illustres': 'bannieres-illustrees',
  'cadres-asiatiques': 'bannieres-asiatiques',
  'cadres-africains': 'bannieres-africaines',
  'cadres-celtes': 'bannieres-celtes',
  'cadres-nordiques': 'bannieres-nordiques',
  'cadres-egyptiens': 'bannieres-egyptiennes',
  'cadres-mayas': 'bannieres-mayas',
  'cadres-indiens': 'bannieres-indiennes',
  'cadres-amerindiens': 'bannieres-amerindiennes',
  'cadres-australs': 'bannieres-australes',
  'noel-enneige': 'bannieres-noel-enneige',
  'lumieres-de-noel': 'bannieres-lumieres-noel',
  'atelier-du-pere-noel': 'bannieres-atelier-noel',
};

const ALL_BANNERS: readonly AssortedBanner[] = [
  ...VITRINE_BANNERS,
  ...ASIATIQUES_BANNERS,
  ...AFRICAINS_BANNERS,
  ...CELTES_BANNERS,
  ...NORDIQUES_BANNERS,
  ...EGYPTIENS_BANNERS,
  ...MAYAS_BANNERS,
  ...INDIENS_BANNERS,
  ...AMERINDIENS_BANNERS,
  ...AUSTRAUX_BANNERS,
  ...CHRISTMAS_BANNERS,
];

const byKey = (key: string): AssortedBanner => {
  const found = ALL_BANNERS.find((frame) => frame.key === key);
  if (found === undefined) throw new Error(`${key} : aucune bannière assortie`);
  return found;
};

export const ASSORTED_BANNER_PACKS: readonly AssortedBannerPack[] = [...ILLUSTRATED_PACKS, ...CHRISTMAS_RING_PACKS].map((ring) => {
  const slug = BANNER_SLUGS[ring.slug];
  if (slug === undefined) throw new Error(`${ring.slug} : aucun pack de bannière`);
  return assorted(ring, slug, ring.frames.map((frame) => byKey(frame.key)));
});
