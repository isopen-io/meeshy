import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events';

import { safeBroadcast, type ServerEmitIO } from './serverEmit';

/**
 * `conversation:updated`, UN LECTEUR À LA FOIS — et l'échec d'un lecteur ne
 * coûte que ce lecteur (#18380).
 *
 * ─── Pourquoi un site unique pour une boucle de trois lignes ───────────────
 *
 * Les trois émetteurs de cet événement composent une charge PAR destinataire
 * (le Prisme de l'aperçu est résolu par lecteur) et la poussent dans une
 * boucle. Les trois boucles étaient écrites à la main, et les trois portaient
 * la même propriété non voulue : **un lecteur qui lève emporte tous les
 * suivants**, plus tout ce que son appelant fait APRÈS la boucle.
 *
 * | émetteur | ce qu'une levée coûtait |
 * |---|---|
 * | `MessageHandler.broadcastNewMessage` (WS `message:send`, transport PRIMAIRE) | les lecteurs suivants, la pastille de non-lus, et l'accusé de remise automatique (✓ → ✓✓) |
 * | `postMessageSyncFanOut` (REST/ZMQ) | les lecteurs suivants et la pastille de non-lus |
 * | `emitConversationPreviewUpdate` (édition / suppression) | les lecteurs suivants |
 *
 * Les deux premiers avaient pourtant chacun un `catch` — de fin de méthode pour
 * l'un, nommé « non-bloquant » pour l'autre. Ils attrapaient bien la levée ;
 * ils ne la CONFINAIENT pas. C'est la leçon du cycle 127 dans sa variante de
 * portée : **une étiquette de `catch` ne qualifie que ce que son auteur avait
 * en tête**, et une portée grandit toute seule à chaque instruction ajoutée au
 * bloc.
 *
 * Ce n'est pas une panne hypothétique : le dépôt écrit lui-même que
 * `io.to(room).emit(...)` lève quand l'adaptateur ou l'encodeur est en défaut
 * (`emitWithSeq`), et la composition par lecteur en est une seconde source —
 * elle lit la ligne de CE participant.
 *
 * ─── Ce que ce site garantit, et ce qu'il ne garantit pas ─────────────────
 *
 * Il garantit que la boucle VA JUSQU'AU BOUT et qu'elle RETOURNE. Il ne rend
 * rien à un lecteur dont l'émission a échoué : `conversation:updated` est
 * cosmétique (le re-tri de la ligne de liste), et le client le retrouve au
 * prochain chargement. La garantie DURABLE est ailleurs — la file hors ligne,
 * qui passe AVANT tout ceci chez les deux producteurs de `message:new`.
 *
 * La composition est DANS la portée gardée, délibérément : `compose` lit la
 * ligne du participant courant, donc elle lève pour les mêmes raisons que
 * l'émission. La garder dehors laisserait la moitié du risque hors de la
 * garde.
 */
export function emitConversationUpdatedPerReader<TParticipant>(
  io: ServerEmitIO,
  targets: readonly { readonly room: string; readonly participant: TParticipant }[],
  /** La charge de CE lecteur, ou `null` pour ne rien lui envoyer. */
  compose: (participant: TParticipant) => ConversationUpdatedEventData | null,
  onError?: (error: unknown, room: string) => void,
): void {
  for (const { room, participant } of targets) {
    safeBroadcast(
      `conversation:updated → ${room}`,
      () => {
        const payload = compose(participant);
        if (payload === null) return;
        io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, payload);
      },
      onError === undefined ? undefined : (error) => onError(error, room),
    );
  }
}
