import type { QueryClient } from '@tanstack/react-query';

import { isPostEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { withKeptViewerPoints } from '@/lib/feed/viewer-points';
import type { SocketClient } from '@/lib/net/socket';

import { updateCardPost } from './card-caches';

/**
 * `engagement:post-updated` (#9570, contrat passerelle #9569) — après un geste
 * crédité, la passerelle pousse au SEUL lecteur crédité ce que le post lui a
 * rapporté depuis toujours (`{ postId, viewerPoints }`, valeur absolue). Elle
 * se pose sur CHAQUE caisse qui montre la carte de cet identifiant (le
 * registre, `card-caches.ts`, Réels et fiche compris), par la loi monotone :
 * une valeur plus petite est une annonce plus ancienne arrivée en retard, et
 * ne fait jamais reculer la carte. Rien n'est additionné ni deviné ici.
 *
 * L'identifiant est celui du post CRÉDITÉ : une republication simple a sa
 * propre carte et sa propre valeur, que l'annonce de son original ne touche
 * pas. Un identifiant qu'aucune caisse ne tient (une création dont la réponse
 * n'est pas encore là) ne change rien : la lecture suivante sert la valeur.
 * Une charge malformée est ignorée ENTIÈRE (`isPostEngagementSnapshot`).
 */
export function applyPostEngagement(queryClient: QueryClient, payload: unknown): void {
  if (!isPostEngagementSnapshot(payload)) return;
  updateCardPost(queryClient, payload.postId, (post) => withKeptViewerPoints(post, payload.viewerPoints));
}

/** Branche l'événement sur le cache de requêtes ; rend le débranchement. */
export function bindPostEngagement(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const { socket, queryClient } = params;
  const onUpdated = (payload: unknown): void => applyPostEngagement(queryClient, payload);
  socket.on(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED, onUpdated);
}
