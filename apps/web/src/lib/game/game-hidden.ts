import type { QueryClient } from '@tanstack/react-query';

import type { GameSettingsResponse } from '@meeshy/shared/types/game';

import { setGamePrivacy } from '@/lib/api/game-integration';
import { GAME_SETTINGS_QUERY_KEY } from '@/lib/api/game-v2-queries';
import type { DataSource } from '@/lib/api/config';
import type { HttpTransport } from '@/lib/api/http';
import { gameErrorMessage } from '@/lib/view/game-copy';

import type { GamePrefsStore } from './preferences';

/**
 * « JEU MASQUÉ », LE SERVEUR FAIT FOI (#9481) — `gameHidden` vit sur le compte
 * (`GET`/`PUT /me/game/privacy`) : un autre appareil, une réinstallation ou la
 * passerelle (notifications, profil) le savent. Le drapeau de l'appareil
 * (`gamePrefs.hidden`) n'en est plus que la COPIE du dernier état connu, celle
 * qui sert hors ligne et avant la première réponse :
 *
 *  - `adoptServedHidden` : une lecture du serveur remplace la copie, dans les
 *    deux sens ;
 *  - `persistGameHidden` : le geste. Optimiste (l'interrupteur bascule avant la
 *    réponse), retour arrière sur refus ou panne, RIEN hors ligne — une bascule
 *    qui ne partirait pas serait un contrôle qui ment, et la prochaine lecture
 *    la défairait. Réafficher écrit donc le serveur comme masquer : sans quoi le
 *    jeu se masquerait de nouveau à la lecture suivante.
 *
 * Les célébrations restent une commodité de l'appareil : aucun serveur ne les tient.
 */

export type GameHiddenDeps = {
  readonly transport: HttpTransport;
  readonly client: QueryClient;
  readonly prefs: Pick<GamePrefsStore, 'get' | 'set'>;
  readonly isOnline: () => boolean;
  readonly requestId: () => string;
  /** `'fixtures'` : le banc de recette — aucun réseau, le geste réussit comme le ferait le serveur. */
  readonly source?: DataSource;
};

export type GameHiddenOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'offline' }
  | { readonly status: 'refused'; readonly error: string };

export function adoptServedHidden(settings: Pick<GameSettingsResponse, 'gameHidden'>, prefs: Pick<GamePrefsStore, 'set'>): void {
  prefs.set({ hidden: settings.gameHidden });
}

export async function persistGameHidden(hidden: boolean, deps: GameHiddenDeps): Promise<GameHiddenOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { client, prefs } = deps;

  /* L'interrupteur bascule TOUT DE SUITE ; une lecture en vol, qui rendrait l'ancien état, est annulée avant de s'écrire dans le cache. */
  const previousHidden = prefs.get().hidden;
  prefs.set({ hidden });
  await client.cancelQueries({ queryKey: GAME_SETTINGS_QUERY_KEY });
  const snapshot = client.getQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY);
  if (snapshot !== undefined) client.setQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY, { ...snapshot, gameHidden: hidden });

  const result =
    __FIXTURES__ && deps.source === 'fixtures'
      ? ({ ok: true, data: { gameHidden: hidden, friendsLeagueOptOut: false } } as const)
      : await setGamePrivacy(deps.transport, deps.requestId(), { gameHidden: hidden });
  if (!result.ok) {
    prefs.set({ hidden: previousHidden });
    if (snapshot !== undefined) client.setQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY, snapshot);
    return { status: 'refused', error: gameErrorMessage(result.code) };
  }

  /* La réponse est la vérité : l'état RETENU par le serveur, pas celui qu'on a demandé. */
  prefs.set({ hidden: result.data.gameHidden });
  const current = client.getQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY);
  if (current !== undefined) client.setQueryData<GameSettingsResponse>(GAME_SETTINGS_QUERY_KEY, { ...current, ...result.data });
  return { status: 'saved' };
}
