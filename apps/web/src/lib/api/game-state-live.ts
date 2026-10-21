import type { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import { shouldApplyGameState } from '@meeshy/shared/types/game-sync-order';

import type { SocketClient } from '../net/socket';

import type { EngagementWithGame } from './engagement';
import { readGameBlock } from './game';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, servedGameRevision } from './game-state-order';

/**
 * `game:updated` (#10900) — une frappe, un gain, une reprise, un prestige ou une dépense faits ailleurs (un autre appareil,
 * la passerelle) mettent l'état du jeu à jour sans attendre. L'événement porte le bloc `game` servi et sa révision : un
 * état plus ancien que celui en cache est ignoré ; un bloc illisible ou absent (`null`) fait relire la progression.
 * Le reste de la charge (solde, compteurs) se relit derrière, en silence.
 */
export function applyGameUpdated(queryClient: QueryClient, payload: unknown): void {
  const revision = servedGameRevision(payload);
  if (revision === undefined) return;
  const current = queryClient.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
  if (current !== undefined && !shouldApplyGameState(revision, current.gameRevision)) return;
  const game = typeof payload === 'object' && payload !== null ? readGameBlock(Reflect.get(payload, 'game')) : null;
  if (current !== undefined && game !== null) {
    queryClient.setQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY, { ...current, game, gameRevision: revision });
  }
  void queryClient.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
}

export function bindGameStateSync(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const { socket, queryClient } = params;
  const onUpdated = (payload: unknown): void => applyGameUpdated(queryClient, payload);
  socket.on(SERVER_EVENTS.GAME_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.GAME_UPDATED, onUpdated);
}
