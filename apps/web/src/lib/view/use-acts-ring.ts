import { useSyncExternalStore } from 'react';
import { gameActsRing, type GameActsRing, type GameActsRingSource } from '@meeshy/shared/utils/game/acts-ring';
import { gameAttention, type GameAttention, type GameAttentionSource } from '@meeshy/shared/utils/game/attention';

import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/game-state-order';
import { appQueryClient } from '@/lib/api/query-client';
import { useGamePrefs } from '@/lib/game/preferences';

/**
 * **L'ANNEAU DES ACTES DU JOUR** (#17768) — lu dans le CACHE du bloc `game`, sous la clé que le bandeau du joueur,
 * « Ma Légende » et le profil tiennent à jour (`ENGAGEMENT_PROGRESS_QUERY_KEY`, persistée). Aucune requête ne part
 * pour lui : il s'ABONNE au cache plutôt qu'à une requête (un `useQuery` sans `queryFn` se plaint, et rafraîchirait
 * au focus). Le bouton du menu est sur chaque écran, et un acte réalisé arrive dans cette entrée par ceux qui la
 * revalident. « Jeu masqué » : aucun anneau.
 *
 * Module à part de `api/engagement.ts`, et c'est une question de poids : le bouton flottant vit dans son propre
 * chunk, préchargé sur chaque écran à menus. Il n'a pas à emporter le chargeur du jeu pour compter trois actes.
 */
export function useActsRing(): GameActsRing | null {
  const hidden = useGamePrefs().hidden;
  const cached = useSyncExternalStore(subscribe, readCached, readCached);
  return gameActsRing(cached?.game, { hidden });
}

/**
 * **CE QUE LE JEU SIGNALE AU MENU** (#18165) — l'Offrande prête, la Flamme en danger, lues dans la MÊME entrée du
 * cache que l'anneau (`gameAttention`, #17796) : le barreau « Ma Légende » en porte un point. Aucune requête, aucune
 * règle recalculée ; « Jeu masqué » : rien.
 */
export function useGameAttention(): GameAttention {
  const hidden = useGamePrefs().hidden;
  const cached = useSyncExternalStore(subscribe, readCachedAttention, readCachedAttention);
  return gameAttention(attentionSource(cached?.game), { hidden });
}

const subscribe = (listener: () => void): (() => void) => appQueryClient.getQueryCache().subscribe(listener);

const readCached = (): { readonly game?: GameActsRingSource } | undefined =>
  appQueryClient.getQueryData<{ readonly game?: GameActsRingSource }>(ENGAGEMENT_PROGRESS_QUERY_KEY);

const readCachedAttention = (): { readonly game?: Partial<GameAttentionSource> } | undefined =>
  appQueryClient.getQueryData<{ readonly game?: Partial<GameAttentionSource> }>(ENGAGEMENT_PROGRESS_QUERY_KEY);

/** Un bloc d'un ancien serveur peut manquer l'Offrande ou la Flamme : alors rien à signaler, jamais une exception. */
const attentionSource = (game: Partial<GameAttentionSource> | undefined): GameAttentionSource | null =>
  game?.missions === undefined || game.chest === undefined || game.flame === undefined
    ? null
    : { missions: game.missions, chest: game.chest, flame: game.flame };
