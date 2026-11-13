import { useSyncExternalStore } from 'react';
import { gameActsRing, type GameActsRing, type GameActsRingSource } from '@meeshy/shared/utils/game/acts-ring';

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

const subscribe = (listener: () => void): (() => void) => appQueryClient.getQueryCache().subscribe(listener);

const readCached = (): { readonly game?: GameActsRingSource } | undefined =>
  appQueryClient.getQueryData<{ readonly game?: GameActsRingSource }>(ENGAGEMENT_PROGRESS_QUERY_KEY);
