/**
 * LES LIGUES HEBDOMADAIRES (#9384) ET LA LIGUE AMIS (#9385) — la loi pure.
 * `docs/product/jeu-meeshy-conception.html` § II.7 et partie IX.
 *
 * Huit ligues, du Quartz au Prisme. La semaine s'identifie par son LUNDI local
 * (`AAAA-MM-JJ`) et ferme le dimanche à 20 h, heure locale : un point gagné
 * après la fermeture compte pour la semaine SUIVANTE. On classe les points
 * GAGNÉS dans la semaine, jamais le score en poche : une frappe débite le
 * score, elle ne retire rien à la semaine.
 *
 * Les groupes sont de 30 joueurs d'activité comparable — la répartition est une
 * fonction déterministe : même entrée, même sortie, sur le serveur comme sur
 * un client. Les 7 premiers montent, les 5 derniers descendent, les 3
 * premiers reçoivent une coupe ; les bornes tiennent aux extrémités (rien au-
 * dessus du Prisme, rien sous le Quartz).
 *
 * ## Ce que la loi se refuse
 *
 *  - aucune horloge, aucun fuseau, aucun aléa implicite : le jour, la minute
 *    locale et la graine sont des PARAMÈTRES ;
 *  - AUCUNE heure d'activité ne sort du classement : le seul total est celui de
 *    la semaine, et un ex æquo se tranche par un hachage de la semaine — jamais
 *    par « qui a atteint le total en premier », qui révélerait un rythme ;
 *  - aucun texte en toutes lettres : des clés stables, que les clients habillent.
 *
 * La ligue publique est SUR CONSENTEMENT, sous PSEUDONYME, ouverte au niveau 10
 * (niveau record) et — en attendant la revue de conformité sur les mineurs —
 * aux seuls majeurs vérifiés. La ligue Amis est toujours disponible.
 */

import { addDays, dayNumber, fnv1a } from './day-prng.js';
import { GLORY_POINTS } from './glory.js';

export const LEAGUE_KEYS = ['quartz', 'ambre', 'jade', 'saphir', 'rubis', 'amethyste', 'diamant', 'prisme'] as const;
export type LeagueKey = (typeof LEAGUE_KEYS)[number];

/** Les ligues s'ouvrent au niveau 10 (palier Lueur), lu sur le niveau RECORD. */
export const LEAGUE_MIN_LEVEL = 10;
export const LEAGUE_GROUP_SIZE = 30;
export const LEAGUE_PROMOTED = 7;
export const LEAGUE_RELEGATED = 5;
export const LEAGUE_CUP_COUNT = 3;
/** Dimanche, le lundi valant 0. */
export const LEAGUE_CLOSE_WEEKDAY = 6;
/** 20 h 00, en minutes depuis minuit local. */
export const LEAGUE_CLOSE_MINUTE = 20 * 60;

export const leagueIndex = (league: LeagueKey): number => LEAGUE_KEYS.indexOf(league);
export const nextLeague = (league: LeagueKey): LeagueKey | null => LEAGUE_KEYS[leagueIndex(league) + 1] ?? null;
export const previousLeague = (league: LeagueKey): LeagueKey | null => LEAGUE_KEYS[leagueIndex(league) - 1] ?? null;

/** 0 pour le lundi, 6 pour le dimanche. */
export const weekdayIndex = (dayKey: string): number => (((dayNumber(dayKey) + 3) % 7) + 7) % 7;

/** La clé de la semaine : le lundi local qui la commence. */
export const leagueWeekKey = (dayKey: string): string => addDays(dayKey, -weekdayIndex(dayKey));

export type LeagueMoment = { readonly dayKey: string; readonly minuteOfDay: number };

/** Le dimanche 20 h local de la semaine. */
export const leagueWeekClose = (weekKey: string): LeagueMoment => ({
  dayKey: addDays(weekKey, LEAGUE_CLOSE_WEEKDAY),
  minuteOfDay: LEAGUE_CLOSE_MINUTE,
});

/** La semaine à laquelle un moment appartient : passé la fermeture, c'est la suivante. */
export function leagueWeekOfMoment(moment: LeagueMoment): string {
  const week = leagueWeekKey(moment.dayKey);
  const closed = weekdayIndex(moment.dayKey) === LEAGUE_CLOSE_WEEKDAY && moment.minuteOfDay >= LEAGUE_CLOSE_MINUTE;
  return closed ? addDays(week, 7) : week;
}

/** `true` quand le moment est à la fermeture de la semaine ou après. */
export const isLeagueWeekClosed = (params: { readonly weekKey: string } & LeagueMoment): boolean =>
  leagueWeekOfMoment(params) > params.weekKey;

export type LeagueGain = LeagueMoment & { readonly points: number };

/**
 * Les points de la semaine : la somme des points GAGNÉS dont le moment tombe
 * dans la semaine. Un débit (la frappe) n'est pas un gain : il ne retire rien.
 */
export const leagueWeekPoints = (params: { readonly weekKey: string; readonly gains: readonly LeagueGain[] }): number =>
  params.gains
    .filter((gain) => leagueWeekOfMoment(gain) === params.weekKey)
    .reduce((total, gain) => total + (Number.isFinite(gain.points) ? Math.max(0, Math.trunc(gain.points)) : 0), 0);

export type LeagueAccess = { readonly status: 'locked' | 'minor' | 'consent-required' | 'open' };

/**
 * Qui peut jouer la ligue PUBLIQUE. Dans l'ordre : le niveau record, la
 * majorité vérifiée (fail-closed — l'absence de preuve n'est pas une preuve),
 * puis le consentement. `consent-required` dit « éligible, il reste à
 * consentir » : c'est ce que le geste de consentement exige.
 */
export function leagueAccess(params: {
  readonly levelRecord: number;
  readonly adultVerified: boolean;
  readonly consented: boolean;
}): LeagueAccess {
  if (!(params.levelRecord >= LEAGUE_MIN_LEVEL)) return { status: 'locked' };
  if (!params.adultVerified) return { status: 'minor' };
  return { status: params.consented ? 'open' : 'consent-required' };
}

export const LEAGUE_PSEUDONYM_MIN = 3;
export const LEAGUE_PSEUDONYM_MAX = 20;

const PSEUDONYM_SHAPE = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

const codePoints = (value: string): number => Array.from(value).length;

/**
 * Un pseudonyme de ligue : 3 à 20 caractères, lettres de toute langue, chiffres,
 * point, tiret et tiret bas ; il ne commence pas par un signe, n'est pas un
 * nombre (un numéro de téléphone) et ne ressemble pas à une adresse.
 */
export function isValidLeaguePseudonym(value: string): boolean {
  const length = codePoints(value);
  if (length < LEAGUE_PSEUDONYM_MIN || length > LEAGUE_PSEUDONYM_MAX) return false;
  if (!PSEUDONYM_SHAPE.test(value)) return false;
  if (/^\p{N}+$/u.test(value)) return false;
  return !/^www\./i.test(value) && !/\.(com|net|org|me|fr|io|app)$/i.test(value);
}

const BASE36_CAP = 36 ** 4;

/** Le pseudonyme de départ — un colibri et quatre signes dérivés du compte, stable et sans rien du nom. */
export const defaultLeaguePseudonym = (userId: string): string =>
  `Colibri-${(fnv1a(`${userId}|league-pseudonym`) % BASE36_CAP).toString(36).padStart(4, '0')}`;

/** Ce que la ligue publique montre d'un joueur : son pseudonyme, jamais son nom. */
export const leagueDisplayName = (params: { readonly userId: string; readonly pseudonym: string | null }): string =>
  params.pseudonym !== null && isValidLeaguePseudonym(params.pseudonym) ? params.pseudonym : defaultLeaguePseudonym(params.userId);

/**
 * Ce qu'un lecteur apprend d'un joueur de la ligue. La publique ne sert que le
 * pseudonyme et le total de la semaine, et seulement à ses membres ; aucune
 * présence n'en sort jamais (la loi de présence reste celle des amis acceptés).
 */
export function canSeeLeagueMember(params: { readonly board: 'public' | 'friends'; readonly viewerIsMember: boolean }): {
  readonly pseudonym: boolean;
  readonly realIdentity: boolean;
  readonly presence: false;
} {
  if (!params.viewerIsMember) return { pseudonym: false, realIdentity: false, presence: false };
  return params.board === 'public'
    ? { pseudonym: true, realIdentity: false, presence: false }
    : { pseudonym: false, realIdentity: true, presence: false };
}

export type LeagueEntrant = {
  readonly userId: string;
  /** Une mesure d'activité comparable (points gagnés sur les semaines récentes). */
  readonly activity: number;
};

export type LeagueGroup = {
  readonly groupId: string;
  readonly league: LeagueKey;
  readonly weekKey: string;
  readonly memberIds: readonly string[];
};

const tieHash = (seed: string, userId: string): number => fnv1a(`${seed}|${userId}`);

const byDescendingThenHash =
  <T extends { readonly userId: string }>(measure: (item: T) => number, seed: string) =>
  (a: T, b: T): number => {
    const delta = measure(b) - measure(a);
    if (delta !== 0) return delta;
    const hash = tieHash(seed, a.userId) - tieHash(seed, b.userId);
    return hash !== 0 ? hash : a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  };

const safeNumber = (value: number): number => (Number.isFinite(value) ? Math.trunc(value) : 0);

/**
 * La répartition des inscrits d'une ligue en groupes de 30 au plus, d'activité
 * comparable : on classe par activité décroissante (ex æquo : hachage de la
 * semaine) puis on coupe en tranches CONTINUES, de tailles égales à un près —
 * 31 inscrits font 16 et 15, jamais 30 et 1.
 */
export function partitionLeagueGroups(params: {
  readonly weekKey: string;
  readonly league: LeagueKey;
  readonly entrants: readonly LeagueEntrant[];
}): readonly LeagueGroup[] {
  const seed = `${params.weekKey}|${params.league}`;
  const unique = [...new Map(params.entrants.map((e) => [e.userId, e])).values()];
  const ranked = unique.sort(byDescendingThenHash((e) => safeNumber(e.activity), seed));
  if (ranked.length === 0) return [];

  const groupCount = Math.ceil(ranked.length / LEAGUE_GROUP_SIZE);
  const base = Math.floor(ranked.length / groupCount);
  const extra = ranked.length % groupCount;

  return Array.from({ length: groupCount }, (_, index) => {
    const start = index * base + Math.min(index, extra);
    const size = base + (index < extra ? 1 : 0);
    return {
      groupId: `${params.weekKey}:${params.league}:${index + 1}`,
      league: params.league,
      weekKey: params.weekKey,
      memberIds: ranked.slice(start, start + size).map((e) => e.userId),
    };
  });
}

export type LeagueZone = 'promotion' | 'safe' | 'relegation';
export type LeagueCup = 'gold' | 'silver' | 'bronze';

const CUPS: readonly LeagueCup[] = ['gold', 'silver', 'bronze'];

export type LeagueMemberPoints = { readonly userId: string; readonly weekPoints: number };

export type LeagueStanding = LeagueMemberPoints & {
  /** À partir de 1. */
  readonly rank: number;
  readonly zone: LeagueZone;
  readonly cup: LeagueCup | null;
};

/**
 * Le classement d'un groupe. La zone de montée est de 7 (la moitié du groupe au
 * plus), celle de descente de 5 (idem) : dans un petit groupe, personne ne
 * monte et ne descend à la fois. Qui n'a gagné aucun point ne monte pas et ne
 * reçoit pas de coupe.
 */
export function leagueStandings(params: {
  readonly groupId: string;
  readonly league: LeagueKey;
  readonly members: readonly LeagueMemberPoints[];
}): readonly LeagueStanding[] {
  const ranked = [...params.members].sort(byDescendingThenHash((m) => safeNumber(m.weekPoints), params.groupId));
  const half = Math.floor(ranked.length / 2);
  const promotedCount = nextLeague(params.league) === null ? 0 : Math.min(LEAGUE_PROMOTED, half);
  const relegatedCount = previousLeague(params.league) === null ? 0 : Math.min(LEAGUE_RELEGATED, half);

  return ranked.map((member, index) => {
    const weekPoints = Math.max(0, safeNumber(member.weekPoints));
    const earned = weekPoints > 0;
    const zone: LeagueZone =
      index < promotedCount && earned ? 'promotion' : index >= ranked.length - relegatedCount ? 'relegation' : 'safe';
    return {
      userId: member.userId,
      weekPoints,
      rank: index + 1,
      zone,
      cup: earned && index < LEAGUE_CUP_COUNT ? (CUPS[index] ?? null) : null,
    };
  });
}

/**
 * Les points qui manquent pour entrer dans la zone de montée : `0` quand on y
 * est, `null` au sommet, en cas d'erreur de joueur, ou quand il n'y a pas de zone.
 */
export function leaguePointsToPromotion(params: {
  readonly league: LeagueKey;
  readonly standings: readonly LeagueStanding[];
  readonly userId: string;
}): number | null {
  if (nextLeague(params.league) === null) return null;
  const mine = params.standings.find((s) => s.userId === params.userId);
  if (mine === undefined) return null;
  if (mine.zone === 'promotion') return 0;
  const lastPromoted = [...params.standings].reverse().find((s) => s.zone === 'promotion');
  const bar = lastPromoted === undefined ? 1 : lastPromoted.weekPoints + 1;
  return Math.max(0, bar - mine.weekPoints);
}

export type LeagueOutcome = {
  readonly nextLeague: LeagueKey;
  readonly promoted: boolean;
  readonly relegated: boolean;
  /** +30 à la montée, +100 de plus pour une coupe ; rien n'en retire à la descente. */
  readonly glory: number;
};

export type SettledLeagueMember = LeagueStanding & { readonly outcome: LeagueOutcome };

/** Le règlement d'un groupe à la fermeture : où chacun joue la semaine suivante, et sa Gloire. */
export function settleLeagueGroup(params: {
  readonly groupId: string;
  readonly league: LeagueKey;
  readonly members: readonly LeagueMemberPoints[];
}): readonly SettledLeagueMember[] {
  return leagueStandings(params).map((standing) => {
    const promoted = standing.zone === 'promotion';
    const relegated = standing.zone === 'relegation';
    const destination = promoted ? nextLeague(params.league) : relegated ? previousLeague(params.league) : null;
    return {
      ...standing,
      outcome: {
        nextLeague: destination ?? params.league,
        promoted,
        relegated,
        glory: (promoted ? GLORY_POINTS.leagueUp : 0) + (standing.cup === null ? 0 : GLORY_POINTS.leagueCup),
      },
    };
  });
}

export type FriendsLeagueEntry = {
  readonly userId: string;
  readonly weekPoints: number;
  readonly rank: number;
  readonly isMe: boolean;
};

/**
 * La ligue Amis : le MÊME classement, restreint au joueur et à ses amis
 * ACCEPTÉS. Les points d'une personne hors de cette liste n'y entrent jamais,
 * même s'ils sont fournis. Ni montée ni descente : on se mesure, on ne se
 * relègue pas entre amis.
 */
export function friendsLeagueRanking(params: {
  readonly weekKey: string;
  readonly viewerId: string;
  readonly friendIds: readonly string[];
  readonly weekPoints: Readonly<Record<string, number>>;
}): readonly FriendsLeagueEntry[] {
  const ids = [...new Set([params.viewerId, ...params.friendIds])];
  const entries = ids.map((userId) => ({ userId, weekPoints: Math.max(0, safeNumber(params.weekPoints[userId] ?? 0)) }));
  return entries
    .sort(byDescendingThenHash((e) => e.weekPoints, `${params.weekKey}|friends`))
    .map((entry, index) => ({ ...entry, rank: index + 1, isMe: entry.userId === params.viewerId }));
}
