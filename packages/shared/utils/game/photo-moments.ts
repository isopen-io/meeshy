/**
 * LES MOMENTS PHOTO DE LA VAGUE 2 (#9387, #9384, #9386, #9389) — trophée, montée
 * de ligue, saison, Prestige. `docs/product/jeu-meeshy-conception.html` partie VI.
 *
 * Au déclenchement, Mee et Meo « frappent en place » l'emblème du moment dans la
 * photo. La loi dit QUEL emblème et QUELLE identité : l'identité fait qu'un
 * « plus tard » puis un retour ne propose jamais deux fois la même photo, et
 * qu'une montée vers la même ligue une autre semaine est un moment nouveau.
 *
 * Ne se photographient pas : une première ligue, une descente (Meo la dit
 * calmement, rien à immortaliser), une saison inachevée, un simple tampon d'Atlas.
 */

import { ACHIEVEMENT_FAMILIES } from '../../types/achievement-families.js';
import { achievementKey, tiersOf } from '../../types/achievement-catalog.js';
import { ENGAGEMENT_ACHIEVEMENT_KEYS, type EngagementAchievementKey } from '../../types/engagement.js';
import { isDayKey } from './day-prng.js';
import type { GuideEventV2 } from './guide-v2.js';
import type { LeagueKey } from './league.js';

export type PhotoMomentEmblemV2 =
  | { readonly kind: 'trophy'; readonly trophyKey: string }
  | { readonly kind: 'league-up'; readonly league: LeagueKey; readonly weekKey: string }
  | { readonly kind: 'season'; readonly season: number }
  | { readonly kind: 'prestige'; readonly number: number };

export function photoMomentOfGuideEvent(event: GuideEventV2): PhotoMomentEmblemV2 | null {
  switch (event.kind) {
    case 'trophy':
      return { kind: 'trophy', trophyKey: event.trophyKey };
    case 'league-promoted':
      return { kind: 'league-up', league: event.to, weekKey: event.weekKey };
    case 'season-end':
      return event.completed ? { kind: 'season', season: event.season } : null;
    case 'prestige':
      return { kind: 'prestige', number: event.prestige };
    case 'league-first':
    case 'league-relegated':
    case 'season-start':
    case 'atlas-stamp':
      return null;
  }
}

export function photoMomentId(emblem: PhotoMomentEmblemV2): string {
  switch (emblem.kind) {
    case 'trophy':
      return `trophy:${emblem.trophyKey}`;
    case 'league-up':
      return `league-up:${emblem.weekKey}:${emblem.league}`;
    case 'season':
      return `season:${emblem.season}`;
    case 'prestige':
      return `prestige:${emblem.number}`;
  }
}

/**
 * LA RÉALISATION DU JOUR (D6, #10173) — un moment par jour de jeu, réalisé par un geste (l'ouverture du Coffre
 * du jour). Son identité porte la journée : `day:<AAAA-MM-JJ>` ; une clé qui n'est pas une VRAIE date du
 * calendrier (`2026-02-30`) n'a pas d'identité. La grammaire est celle de la garde serveur (`isDayKey`) :
 * un client ne nomme jamais un moment que la passerelle refuserait.
 */
export const photoDayMomentId = (dayKey: string): string | null => (isDayKey(dayKey) ? `day:${dayKey}` : null);

/** La journée d'une identité `day:<AAAA-MM-JJ>`, `null` pour toute autre identité. */
export const photoDayOfMomentId = (momentId: string): string | null =>
  momentId.startsWith('day:') && isDayKey(momentId.slice(4)) ? momentId.slice(4) : null;

/**
 * LE HAUT FAIT (LS, #10168) — l'identité commune du web (`achievementMoment`) et d'iOS (`GamePhotoMoments.achievement`),
 * simples et composés : `achievement:<clé du catalogue>`. La rareté n'y entre jamais : elle est SERVIE à part à la loi
 * des cadres (`gloryFramesFor({ rarity })`), et une photo gardée avant que la rareté ne soit connue reste la même photo.
 *
 * La grammaire n'est pas réécrite ici : la clé est celle que le jeu ATTRIBUE — les cinq succès simples
 * (`achievement.first_content`, `ENGAGEMENT_ACHIEVEMENT_KEYS`) et les composés de chaque famille et palier
 * (`achievement.parole.message.send.count:1`, `achievementKey`). Une clé hors du catalogue n'a pas d'identité.
 */
export const PHOTO_ACHIEVEMENT_KEYS: readonly string[] = [
  ...ENGAGEMENT_ACHIEVEMENT_KEYS,
  ...ACHIEVEMENT_FAMILIES.flatMap((family) => tiersOf(family).map((tier) => achievementKey(family, tier))),
];

const ACHIEVEMENT_KEY_SET: ReadonlySet<string> = new Set(PHOTO_ACHIEVEMENT_KEYS);

export function photoAchievementMomentId(key: EngagementAchievementKey): string;
export function photoAchievementMomentId(key: string): string | null;
export function photoAchievementMomentId(key: string): string | null {
  return ACHIEVEMENT_KEY_SET.has(key) ? `achievement:${key}` : null;
}

/** La clé du haut fait d'une identité `achievement:<clé>`, `null` pour toute autre identité. */
export const photoAchievementKeyOfMomentId = (momentId: string): string | null =>
  momentId.startsWith('achievement:') && ACHIEVEMENT_KEY_SET.has(momentId.slice(12)) ? momentId.slice(12) : null;
