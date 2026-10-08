/**
 * LES ÉLÉMENTS DU JEU QUI SE TOUCHENT (#9563, amendement n° 2) — la liste
 * FERMÉE des familles d'élément et des données qui ont leurs précisions. Chaque
 * famille porte deux phrases au catalogue (`game.detail.<famille>.what` et
 * `.how`), chaque donnée une (`game.detail.fact.<donnée>`) : les mêmes clés sur
 * le web et sur iOS.
 *
 * Écrite ici, sans dépendance, pour que le catalogue, le modèle des précisions
 * (`lib/view/game-detail.ts`) et leurs témoins lisent la MÊME liste.
 */

/** Une famille d'élément : badge, succès, défi, trophée, tampon, étape et sceau de saison, gemme de ligue, étoile de Prestige, blason de rang, forme de Flamme, gel, mission, coffre, pièce Meesh, anneau de niveau, palier du trésor, famille d'élan, étape des niveaux (#9706). */
export const GAME_DETAIL_FAMILIES = [
  'badge',
  'succes',
  'defi',
  'trophy',
  'stamp',
  'step',
  'seal',
  'gem',
  'star',
  'rank',
  'flame',
  'freeze',
  'mission',
  'chest',
  'coin',
  'ring',
  'treasury',
  'elan',
  'levelstep',
] as const;

export type GameDetailFamily = (typeof GAME_DETAIL_FAMILIES)[number];

/**
 * Ce que la seconde phrase d'une famille dit : comment on OBTIENT l'élément, ou
 * ce qu'il DONNE. Le libellé de la modale en dépend.
 */
export const GAME_DETAIL_HOW: Readonly<Record<GameDetailFamily, 'obtain' | 'gives'>> = {
  badge: 'obtain',
  succes: 'obtain',
  defi: 'obtain',
  trophy: 'obtain',
  stamp: 'obtain',
  step: 'obtain',
  seal: 'obtain',
  gem: 'obtain',
  star: 'obtain',
  rank: 'obtain',
  flame: 'gives',
  freeze: 'obtain',
  mission: 'gives',
  chest: 'gives',
  coin: 'obtain',
  ring: 'obtain',
  treasury: 'obtain',
  elan: 'gives',
  levelstep: 'obtain',
};

/** Les données (pastilles et lignes des fiches et du tableau de bord) qui ont leur phrase. */
export const GAME_DETAIL_FACTS = [
  'tier',
  'score',
  'level_next',
  'level_record',
  'tailwind',
  'mint_price',
  'mint_missing',
  'can_mint',
  'factor',
  'mint_next',
  'mint_glory',
  'minted',
  'glory',
  'glory_missing',
  'streak',
  'streak_record',
  'flame_state',
  'missions_done',
  'league_place',
  'week_points',
  'league_zone',
  'league_missing',
  'league_closes',
  'league_friends',
  'season',
  'season_week',
  'season_steps',
  'season_stars',
  'prestige_glory',
  'elan_families',
  'badges_earned',
  'defis_earned',
  'succes_earned',
  'trophies',
  'showcase_visibility',
  'atlas_stamps',
  'atlas_pending',
  'spend_held',
  'spend_cost',
  'spend_after',
  'spend_missing',
  'level_now',
  'level_required',
] as const;

export type GameDetailFact = (typeof GAME_DETAIL_FACTS)[number];
