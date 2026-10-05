/**
 * LES TROPHÉES ET LA VITRINE (#9387) — un objet reçu à un moment précis.
 * `docs/product/jeu-meeshy-conception.html` § II.9 et partie IX.
 *
 * Quatre types : la coupe de ligue (or, argent, bronze — top 3 d'une ligue en
 * fin de semaine), la coupe de saison (parcours terminé), le trophée de
 * Prestige (numéroté de 1 à 5), le trophée de Flamme (100 puis 365 jours de
 * série). Ni un trophée ni un succès ne rapporte de points : la Gloire d'une
 * coupe de ligue ou de saison est celle des lois de ligue et de saison.
 *
 * Chaque trophée a une CLÉ STABLE, lisible et sans espace — c'est elle que la
 * base grave et que la vitrine ordonne. La clé d'une coupe de ligue porte la
 * semaine, la ligue et le métal : un compte ne joue qu'une ligue par semaine, la
 * clé est donc unique, et un client la dessine sans autre lecture.
 *
 * Un trophée d'un type que ce client ne connaît pas n'est JAMAIS retiré de la
 * vitrine : il reste, en dernier, le temps d'une mise à jour.
 *
 * La vitrine se règle comme le rang et le trésor (#5738) : tout le monde, amis
 * (défaut), moi seul. Inconnu = fermé.
 */

import { isDayKey } from './day-prng.js';
import { GAME_PRESTIGE_MAX } from './levels.js';
import { LEAGUE_KEYS, type LeagueCup, type LeagueKey } from './league.js';

export const TROPHY_KINDS = ['league-cup', 'season-cup', 'prestige', 'flame'] as const;
export type TrophyKind = (typeof TROPHY_KINDS)[number];

export const FLAME_TROPHY_DAYS = [100, 365] as const;
export type FlameTrophyDays = (typeof FLAME_TROPHY_DAYS)[number];

const LEAGUE_CUPS: readonly LeagueCup[] = ['gold', 'silver', 'bronze'];

export type TrophySpec =
  | { readonly kind: 'league-cup'; readonly weekKey: string; readonly league: LeagueKey; readonly cup: LeagueCup }
  | { readonly kind: 'season-cup'; readonly season: number }
  | { readonly kind: 'prestige'; readonly number: number }
  | { readonly kind: 'flame'; readonly days: FlameTrophyDays };

export const leagueCupTrophy = (params: { weekKey: string; league: LeagueKey; cup: LeagueCup }): TrophySpec => ({
  kind: 'league-cup',
  ...params,
});
export const seasonCupTrophy = (season: number): TrophySpec => ({ kind: 'season-cup', season });
export const prestigeTrophy = (number: number): TrophySpec => ({ kind: 'prestige', number });
export const flameTrophy = (days: FlameTrophyDays): TrophySpec => ({ kind: 'flame', days });

export function trophyKey(spec: TrophySpec): string {
  switch (spec.kind) {
    case 'league-cup':
      return `trophy.league-cup.${spec.weekKey}.${spec.league}.${spec.cup}`;
    case 'season-cup':
      return `trophy.season-cup.${spec.season}`;
    case 'prestige':
      return `trophy.prestige.${spec.number}`;
    case 'flame':
      return `trophy.flame.${spec.days}`;
  }
}

const POSITIVE_INT = /^[1-9]\d*$/;

/** Le trophée d'une clé, `null` pour tout ce qui n'est pas une clé du catalogue. */
export function parseTrophyKey(key: string): TrophySpec | null {
  const parts = key.split('.');
  if (parts[0] !== 'trophy') return null;
  const [, kind, a, b, c] = parts;
  if (kind === 'league-cup' && parts.length === 5) {
    const league = LEAGUE_KEYS.find((l) => l === b);
    const cup = LEAGUE_CUPS.find((m) => m === c);
    return a !== undefined && isDayKey(a) && league !== undefined && cup !== undefined
      ? leagueCupTrophy({ weekKey: a, league, cup })
      : null;
  }
  if (parts.length !== 3 || a === undefined || !POSITIVE_INT.test(a)) return null;
  const n = Number(a);
  if (kind === 'season-cup') return seasonCupTrophy(n);
  if (kind === 'prestige') return n <= GAME_PRESTIGE_MAX ? prestigeTrophy(n) : null;
  if (kind === 'flame') return FLAME_TROPHY_DAYS.find((d) => d === n) === undefined ? null : flameTrophy(n as FlameTrophyDays);
  return null;
}

/** Les trophées de Flamme gagnés au franchissement du record de série. */
export const flameTrophiesEarned = (params: { readonly previousLongest: number; readonly longest: number }): readonly FlameTrophyDays[] =>
  FLAME_TROPHY_DAYS.filter((days) => params.previousLongest < days && params.longest >= days);

/** La valeur d'un trophée pour l'ordre par défaut : le plus précieux d'abord. */
function defaultWeight(spec: TrophySpec | null): number {
  if (spec === null) return 0;
  switch (spec.kind) {
    case 'prestige':
      return 1000 + spec.number;
    case 'season-cup':
      return 800;
    case 'flame':
      return spec.days === 365 ? 700 : 600;
    case 'league-cup':
      return { gold: 500, silver: 400, bronze: 300 }[spec.cup];
  }
}

export type TrophyRecord = { readonly key: string; /** ISO 8601. */ readonly awardedAt: string };

export const SHOWCASE_ORDER_MAX = 200;

/** L'ordre reçu d'un client, assaini : seulement des trophées POSSÉDÉS, uniques, bornés. */
export function sanitizeShowcaseOrder(params: { readonly order: readonly string[]; readonly ownedKeys: readonly string[] }): readonly string[] {
  const owned = new Set(params.ownedKeys);
  return [...new Set(params.order)].filter((key) => owned.has(key)).slice(0, SHOWCASE_ORDER_MAX);
}

/**
 * La vitrine, dans l'ordre : d'abord ce que le joueur a rangé, puis le reste du
 * plus précieux au moins précieux (le plus récent d'abord à valeur égale, la clé
 * en dernier recours — l'ordre ne dépend jamais de l'ordre de lecture).
 */
export function orderShowcase(params: { readonly owned: readonly TrophyRecord[]; readonly order: readonly string[] }): readonly string[] {
  const chosen = sanitizeShowcaseOrder({ order: params.order, ownedKeys: params.owned.map((t) => t.key) });
  const placed = new Set(chosen);
  const rest = params.owned
    .filter((t) => !placed.has(t.key))
    .sort((a, b) => {
      const weight = defaultWeight(parseTrophyKey(b.key)) - defaultWeight(parseTrophyKey(a.key));
      if (weight !== 0) return weight;
      if (a.awardedAt !== b.awardedAt) return a.awardedAt < b.awardedAt ? 1 : -1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  return [...chosen, ...new Set(rest.map((t) => t.key))];
}

export const SHOWCASE_VISIBILITIES = ['everyone', 'friends', 'me'] as const;
export type ShowcaseVisibility = (typeof SHOWCASE_VISIBILITIES)[number];
export const SHOWCASE_DEFAULT_VISIBILITY: ShowcaseVisibility = 'friends';

export type ShowcaseViewer = 'self' | 'friend' | 'other' | 'admin';

/**
 * L'Atlas des langues est PRIVÉ par défaut, quel que soit le réglage de la
 * vitrine : une langue minoritaire, diasporique ou liturgique peut laisser
 * inférer une origine ou une conviction (RGPD art. 9, conformité E-2). Le
 * montrer est un choix séparé et explicite.
 */
export const ATLAS_DEFAULT_VISIBILITY: ShowcaseVisibility = 'me';

/**
 * Le réglage de discrétion qui PLAFONNE la vitrine : un profil caché de la
 * recherche ne la montre qu'aux amis (même règle que #8285), le mode « Jeu
 * masqué » la ramène à « moi seul ». Une valeur inconnue vaut « moi seul ».
 */
export function capShowcaseVisibility(params: {
  readonly visibility: ShowcaseVisibility;
  readonly hideProfileFromSearch: boolean;
  readonly gameHidden: boolean;
}): ShowcaseVisibility {
  if (params.gameHidden) return 'me';
  if (!(SHOWCASE_VISIBILITIES as readonly string[]).includes(params.visibility)) return 'me';
  return params.hideProfileFromSearch && params.visibility === 'everyone' ? 'friends' : params.visibility;
}

/**
 * Ce qu'un visiteur apprend de la date d'un trophée : le MOIS. Une date
 * précise, croisée avec une Flamme de 365 jours, donne le rythme d'usage
 * (conformité D-3, leçon 275 : une protection se mesure sur tout ce que la
 * charge transporte). `null` pour une date illisible.
 */
export const visitorAwardedMonth = (awardedAt: string): string | null => {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(awardedAt);
  return match === null ? null : `${match[1]}-${match[2]}`;
};

/** Qui voit la vitrine. Une valeur inconnue ne s'ouvre qu'au propriétaire et à l'administration. */
export function canViewShowcase(params: { readonly visibility: ShowcaseVisibility; readonly viewer: ShowcaseViewer }): boolean {
  if (params.viewer === 'self' || params.viewer === 'admin') return true;
  if (params.visibility === 'everyone') return true;
  return params.visibility === 'friends' && params.viewer === 'friend';
}
