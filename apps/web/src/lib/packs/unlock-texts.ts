import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES TEXTES DE « CE QUI RESTE À DÉBLOQUER »** (W18, #11324 ; les Meeshes qui
 * manquent et le chemin vers la frappe, #20527) — hors du catalogue
 * des packs (`interface_catalogs_sticker_packs`, à son plafond de 13 Ko) : ils
 * voyagent avec la vitrine qui les affiche, chargée à la demande. Les sept
 * langues du Prisme ; le français est la source, les autres portent ses clés.
 */
const fr = {
  locked: "À débloquer",
  rank: "Rang {rank} — Gloire manquante : {missing}",
  glory: "Gloire manquante : {missing}",
  trophy: "Se gagne avec un trophée",
  season: "Récompense de la saison {number}",
  upcoming: "Disponible à partir du {date}",
  until: "Disponible jusqu’au {date}",
  closed: "N’est plus proposé",
  short_one: "Il vous manque 1 Meesh",
  short_many: "Il vous manque {missing} Meeshes",
  earn: "Frapper des Meeshes",
} as const;

export type UnlockTextKey = keyof typeof fr;

type Texts = Readonly<Record<UnlockTextKey, string>>;

const en = {
  locked: "Locked",
  rank: "Rank {rank} — Glory needed: {missing}",
  glory: "Glory needed: {missing}",
  trophy: "Earned with a trophy",
  season: "Season {number} reward",
  upcoming: "Available from {date}",
  until: "Available until {date}",
  closed: "No longer offered",
  short_one: "You need 1 more Meesh",
  short_many: "You need {missing} more Meeshes",
  earn: "Mint Meeshes",
} satisfies Texts;

const es = {
  locked: "Por desbloquear",
  rank: "Rango {rank} — Gloria que falta: {missing}",
  glory: "Gloria que falta: {missing}",
  trophy: "Se gana con un trofeo",
  season: "Recompensa de la temporada {number}",
  upcoming: "Disponible desde el {date}",
  until: "Disponible hasta el {date}",
  closed: "Ya no se ofrece",
  short_one: "Te falta 1 Meesh",
  short_many: "Te faltan {missing} Meeshes",
  earn: "Acuñar Meeshes",
} satisfies Texts;

const pt = {
  locked: "A desbloquear",
  rank: "Nível {rank} — Glória em falta: {missing}",
  glory: "Glória em falta: {missing}",
  trophy: "Ganha-se com um troféu",
  season: "Recompensa da temporada {number}",
  upcoming: "Disponível a partir de {date}",
  until: "Disponível até {date}",
  closed: "Já não está disponível",
  short_one: "Falta 1 Meesh",
  short_many: "Faltam {missing} Meeshes",
  earn: "Cunhar Meeshes",
} satisfies Texts;

const it = {
  locked: "Da sbloccare",
  rank: "Rango {rank} — Gloria mancante: {missing}",
  glory: "Gloria mancante: {missing}",
  trophy: "Si ottiene con un trofeo",
  season: "Ricompensa della stagione {number}",
  upcoming: "Disponibile dal {date}",
  until: "Disponibile fino al {date}",
  closed: "Non più disponibile",
  short_one: "Ti manca 1 Meesh",
  short_many: "Ti mancano {missing} Meeshes",
  earn: "Coniare Meeshes",
} satisfies Texts;

const de = {
  locked: "Gesperrt",
  rank: "Rang {rank} — fehlender Ruhm: {missing}",
  glory: "Fehlender Ruhm: {missing}",
  trophy: "Mit einer Trophäe zu gewinnen",
  season: "Belohnung der Saison {number}",
  upcoming: "Verfügbar ab {date}",
  until: "Verfügbar bis {date}",
  closed: "Nicht mehr im Angebot",
  short_one: "Dir fehlt 1 Meesh",
  short_many: "Dir fehlen {missing} Meeshes",
  earn: "Meeshes prägen",
} satisfies Texts;

const ar = {
  locked: "مقفل",
  rank: "الرتبة {rank} — المجد الناقص: {missing}",
  glory: "المجد الناقص: {missing}",
  trophy: "يُكسب بكأس",
  season: "مكافأة الموسم {number}",
  upcoming: "متاح ابتداءً من {date}",
  until: "متاح حتى {date}",
  closed: "لم يعد معروضًا",
  short_one: "ينقصك 1 من ميشيز",
  short_many: "ينقصك {missing} من ميشيز",
  earn: "سكّ ميشيز",
} satisfies Texts;

const TEXTS: Readonly<Record<InterfaceLanguage, Texts>> = { fr, en, es, pt, it, de, ar };

const PLACEHOLDER = /\{(\w+)\}/g;

export const unlockText = (language: InterfaceLanguage, key: UnlockTextKey, params?: Readonly<Record<string, string>>): string =>
  params === undefined ? TEXTS[language][key] : TEXTS[language][key].replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);

/** Témoins seulement : chaque langue porte les clés du français. */
export const unlockTextKeysOf = (language: InterfaceLanguage): readonly string[] => Object.keys(TEXTS[language]);
