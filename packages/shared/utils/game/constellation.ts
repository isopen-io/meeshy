/**
 * LA CONSTELLATION (#10053, décision du porteur du 2026-10-11) — à quoi servent les fragments d'étoile.
 *
 * Chaque compte a une constellation. Tous les DIX fragments d'étoile collectés (`star-fragments.ts`), une étoile
 * s'y allume, et chaque étoile allumée débloque UN cosmétique de profil — un halo, un cadre, un scintillement —
 * sans aucun avantage de jeu.
 *
 *     étoiles = ⌊ collectés ÷ 10 ⌋
 *
 * Les fragments ne se dépensent pas : la constellation LIT le total collecté, toujours dérivé, jamais gravé. Elle
 * ne porte aucune valeur — ni points, ni Meesh, ni argent — et rien ne s'y convertit. Elle se montre aux autres
 * selon le réglage de la vitrine (`showcase`), comme les trophées, sans rien dire de la présence de quiconque :
 * un VISITEUR la lit FIGÉE AU MOIS (`constellationVisitorBound`, `countsForVisitor`), comme `awardedMonth` — sur les
 * seuls fragments d'avant le 1er du mois courant —, jamais en direct, sinon relire la vitrine dirait le jour où une
 * étoile s'allume, donc quand la personne a joué. Le membre lui-même lit son total en direct.
 *
 * La clé d'un cosmétique est DÉTERMINISTE : `constellation.star-<n>.<genre>`, le genre tournant dans
 * `CONSTELLATION_COSMETIC_KINDS` (étoile 1 → halo, 2 → cadre, 3 → scintillement, 4 → halo…). Deux appareils, un
 * serveur et un client calculent donc la même clé pour la même étoile, sans table. Miroir Swift :
 * `GameConstellation` (SDK), rejoué sur les vecteurs partagés (`game.vectors.json`, loi `constellation`).
 */

import { addDays } from './day-prng.js';
import { seasonCalendar } from './season.js';

export const CONSTELLATION_FRAGMENTS_PER_STAR = 10;

/** Les genres de cosmétique de profil, dans l'ordre où les étoiles les débloquent. */
export const CONSTELLATION_COSMETIC_KINDS = ['halo', 'frame', 'sparkle'] as const;
export type ConstellationCosmeticKind = (typeof CONSTELLATION_COSMETIC_KINDS)[number];

export type ConstellationCosmetic = {
  /** L'étoile qui le débloque, à partir de 1. */
  readonly star: number;
  readonly kind: ConstellationCosmeticKind;
  readonly cosmeticKey: string;
};

export type Constellation = {
  /** Le total collecté, assaini (entier ≥ 0). */
  readonly collected: number;
  /** Les étoiles allumées : ⌊ collectés ÷ 10 ⌋. */
  readonly stars: number;
  /** Les fragments déjà réunis vers l'étoile suivante (0 à 9). */
  readonly inStar: number;
  /** Les fragments qui manquent à l'étoile suivante (1 à 10). */
  readonly toNextStar: number;
  /** Un cosmétique par étoile allumée, de la première à la dernière. */
  readonly cosmetics: readonly ConstellationCosmetic[];
};

const sanitize = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/** Le cosmétique que débloque l'étoile n (n ≥ 1, entier) ; `null` sinon. */
export function constellationStarCosmetic(star: number): ConstellationCosmetic | null {
  if (!Number.isInteger(star) || star < 1) return null;
  const kind = CONSTELLATION_COSMETIC_KINDS[(star - 1) % CONSTELLATION_COSMETIC_KINDS.length] as ConstellationCosmeticKind;
  return { star, kind, cosmeticKey: `constellation.star-${star}.${kind}` };
}

const KEY = /^constellation\.star-([1-9]\d{0,5})\.([a-z]+)$/;

/** `true` pour une clé que la constellation produit — l'étoile ET son genre doivent concorder. */
export function isConstellationCosmeticKey(key: string): boolean {
  const match = KEY.exec(key);
  if (match === null) return false;
  return constellationStarCosmetic(Number(match[1]))?.cosmeticKey === key;
}

/** La constellation d'un total collecté. */
export function constellationOf(collected: number): Constellation {
  const total = sanitize(collected);
  const stars = Math.floor(total / CONSTELLATION_FRAGMENTS_PER_STAR);
  const inStar = total % CONSTELLATION_FRAGMENTS_PER_STAR;
  const cosmetics: ConstellationCosmetic[] = [];
  for (let star = 1; star <= stars; star += 1) {
    const cosmetic = constellationStarCosmetic(star);
    if (cosmetic !== null) cosmetics.push(cosmetic);
  }
  return { collected: total, stars, inStar, toNextStar: CONSTELLATION_FRAGMENTS_PER_STAR - inStar, cosmetics };
}

/**
 * La borne de ce qu'un VISITEUR voit (#10053) : le 1er du mois courant, en UTC (`AAAA-MM-01`). Seuls les fragments
 * collectés STRICTEMENT avant comptent pour lui — la constellation qu'il lit ne bouge qu'au changement de mois.
 */
export function constellationVisitorBound(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * La borne comme INSTANT : minuit UTC du 1er du mois. Un coffre se juge sur l'instant où il a été RÉCLAMÉ
 * (`chestClaimedAt`), jamais sur son jour : le jour de jeu est local, choisi par le membre, et une journée se
 * réclame jusqu'à vingt heures après son ouverture — un coffre du « 31 » réclamé le 1er après minuit UTC
 * changerait encore, à l'heure près, ce que voit un visiteur (audit adversarial #10053).
 */
export const constellationVisitorBoundInstant = (bound: string): Date => new Date(`${bound}T00:00:00.000Z`);

/** Une étape de saison se réclame jusqu'au dimanche 20 h LOCAL de sa fin : deux jours couvrent tous les fuseaux. */
const SEASON_CLAIM_MARGIN_DAYS = 2;

/**
 * Une source de fragment compte-t-elle pour un visiteur ? Un coffre : réclamé avant l'instant de la borne
 * (`constellationVisitorBoundInstant`), ou — sans instant — d'un jour avant la borne. Une saison : terminée, marge de
 * réclamation comprise, avant la borne — ses étapes réclamées ne portent pas de date, une saison en cours ne compte
 * donc qu'à partir du mois qui suit sa fin.
 */
export function countsForVisitor(source: { readonly dayKey: string } | { readonly season: number }, bound: string): boolean {
  if ('dayKey' in source) return source.dayKey < bound;
  const calendar = seasonCalendar(source.season);
  return calendar !== null && addDays(calendar.endDay, SEASON_CLAIM_MARGIN_DAYS) < bound;
}
