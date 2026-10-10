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
