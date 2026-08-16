import type { FastifyInstance } from 'fastify';
import { emitConversationPreviewUpdate } from '../../socketio/emitConversationPreviewUpdate';
import { resolveSocketIO } from '../../utils/socket-broadcast';
import { logger } from '../../utils/logger';

/**
 * Ce qu'un masquage PERSONNEL doit encore à son auteur : sa LIGNE DE LISTE.
 *
 * `message:hidden-for-me` retire la bulle du fil ; il ne dit rien de la ligne de
 * liste, qui porte son propre aperçu. Or cet aperçu n'est pas calculable par le
 * client : le remplaçant d'un dernier message masqué est le dernier message
 * ENCORE VISIBLE pour ce lecteur-là, que seul le serveur connaît (il peut être
 * hors de la page chargée, ou masqué lui aussi).
 *
 * La règle et sa machinerie existaient déjà, aux deux bouts :
 *   - à la LECTURE, `resolveVisibleLastMessages` (`GET /conversations`) sert à
 *     chaque lecteur son propre dernier message visible ;
 *   - en TEMPS RÉEL, `resolvePersonalPreviewOverrides` fait le même travail dans
 *     `emitConversationPreviewUpdate`.
 *
 * Il lui manquait un DÉCLENCHEUR : la seconde n'a jamais eu pour appelant le
 * geste qui crée le masquage. Elle corrigeait donc la ligne de liste à toute
 * mutation SANS RAPPORT — une édition d'un tiers, une suppression, une
 * traduction qui atterrit — mais pas à l'instant où le lecteur masque. Entre les
 * deux, sa liste réaffichait ce qu'il venait d'en retirer, indéfiniment si rien
 * d'autre ne bougeait dans la conversation.
 *
 * Trois écrivains créent ou lèvent un masquage personnel, et les trois passent
 * ici : « supprimer pour moi » (unitaire et en lot), sa restauration, et
 * « effacer l'historique » (`clearHistoryBefore`).
 *
 * Canal best-effort, comme la diffusion qu'il complète : un rafraîchissement
 * qu'on ne sait pas calculer ne doit jamais faire échouer un masquage qui, lui,
 * a bel et bien pris effet — l'utilisateur rejouerait un geste déjà appliqué.
 * `emitConversationPreviewUpdate` avale déjà ses propres pannes ; le `onError`
 * ci-dessous ne fait que les rendre corrélables à la requête d'origine.
 */
export interface RefreshPersonalPreviewParams {
  readonly userId: string;
  /** Les conversations touchées ; les doublons d'un lot sont coalescés. */
  readonly conversationIds: readonly string[];
}

export async function refreshPersonalConversationPreview(
  fastify: FastifyInstance,
  { userId, conversationIds }: RefreshPersonalPreviewParams
): Promise<void> {
  // UNE ligne par CONVERSATION, jamais une par message : le lot de masquage va
  // jusqu'à 100 ids et peut traverser plusieurs conversations, mais la ligne de
  // liste d'une conversation ne se recalcule qu'une fois.
  const targets = [...new Set(conversationIds)];
  if (targets.length === 0) return;

  const io = resolveSocketIO(fastify);
  if (!io) return;

  await Promise.all(
    targets.map((conversationId) =>
      emitConversationPreviewUpdate(
        fastify.prisma,
        io,
        conversationId,
        userId,
        (error: unknown) => {
          logger.warn('[personalPreviewRefresh] list-row refresh failed', {
            userId,
            conversationId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
        // La borne d'AUDIENCE : un masquage personnel ne change la ligne que de
        // son auteur. Le dernier message GLOBAL n'a pas bougé, donc servir ce
        // recalcul aux autres participants leur enverrait un payload identique à
        // l'octet près — un événement chacun, par geste.
        { onlyForReaderUserId: userId }
      )
    )
  );
}
