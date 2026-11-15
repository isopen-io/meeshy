import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { httpTransport, unwrap } from '@/lib/api/client';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { apiDeps } from '@/lib/api/deps';
import { GAME_SETTINGS_QUERY_KEY, loadGameSettings } from '@/lib/api/game-v2-queries';
import { appQueryClient } from '@/lib/api/query-client';

import { adoptServedHidden, persistGameHidden, type GameHiddenOutcome } from './game-hidden';
import { gamePrefs } from './preferences';

/**
 * LES RÉGLAGES DU JEU, LUS DU SERVEUR (#9481) — `GET /me/game/privacy`, cache-first : la dernière
 * lecture est persistée avec le cache de requêtes, donc l'écran se peint tout de suite et se
 * renouvelle en silence. Hors ligne, rien de nouveau n'arrive et la copie locale (`gamePrefs.hidden`)
 * reste le dernier état connu.
 *
 * Chaque lecture RÉGLE la copie locale de « Jeu masqué » sur ce que le serveur sert : un
 * autre appareil, une réinstallation, un compte différent sur le même navigateur ne laissent plus
 * un jeu masqué (ou affiché) à tort. Les consommateurs de `useGamePrefs` n'ont rien à changer.
 *
 * Monté par les écrans où le jeu se montre : le bandeau du haut, Progression, les profils.
 */
export function useGameSettings(enabled: boolean) {
  const query = useQuery(
    {
      queryKey: GAME_SETTINGS_QUERY_KEY,
      enabled,
      retry: false,
      staleTime: 5 * 60_000,
      queryFn: async ({ signal }) => unwrap(await loadGameSettings({ ...apiDeps, signal })),
    },
    appQueryClient,
  );
  const served = query.data?.gameHidden;
  useEffect(() => {
    if (served !== undefined) adoptServedHidden({ gameHidden: served }, gamePrefs);
  }, [served]);
  return query;
}

/** Le geste « masquer / réafficher », câblé sur l'application réelle. */
export const setGameHidden = (hidden: boolean): Promise<GameHiddenOutcome> =>
  persistGameHidden(hidden, {
    transport: httpTransport,
    client: appQueryClient,
    prefs: gamePrefs,
    isOnline: () => navigator.onLine,
    requestId: newClientMessageId,
    source: apiDeps.source,
  });
