import type { FastifyInstance } from 'fastify';

import { enhancedLogger } from '../../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'RejoinRestoredMembership' });

/**
 * **Rebrancher les sockets d'un compte dont l'appartenance vient d'être
 * RENDUE** (#16964) — l'inverse exact de l'éviction.
 *
 * L'éviction est partagée et explicite : `endConversationMembership` sort
 * TOUTES les sockets du compte de `conversation:<id>`, et c'est elle que le
 * départ, le bannissement et `delete-for-me` appellent. La RÉINTÉGRATION ne
 * l'était pas — chaque porte rebranche chez elle — et `restore-for-me` ne le
 * faisait pas du tout.
 *
 * Ce que coûte l'oubli, et c'est le raisonnement que `participant-ban-core.ts`
 * écrit déjà pour sa jumelle le débannissement : la ligne redevient active,
 * mais rien ne remet les sockets dans la room avant la prochaine reconnexion
 * (`AuthHandler._joinUserConversations`) ou un `conversation:join` spontané du
 * client. L'appareil est alors dans l'état le plus défavorable qui soit —
 * `connectedUsers` le rapporte EN LIGNE, donc tout expéditeur saute la file de
 * remise hors ligne pour lui, pendant qu'aucun événement de room ne l'atteint.
 * Messages, réactions, éditions et accusés émis entre-temps sont PERDUS, pas
 * différés : rien ne rejoue.
 *
 * ─── Les deux règles d'emploi ────────────────────────────────────────────────
 *
 * 1. **N'appeler qu'après une restauration EFFECTIVE.** Rebrancher les sockets
 *    de quelqu'un qui n'avait rien à défaire le ferait entrer dans un fil
 *    qu'il avait quitté de lui-même — c'est la condition `membershipRestored`
 *    de la jumelle.
 * 2. **Appeler AVANT la diffusion du fait.** Rebrancher d'abord, c'est
 *    s'assurer qu'aucun événement de room émis entre les deux ne manque à
 *    l'appareil.
 *
 * Best-effort, par construction : le geste est déjà persisté quand on arrive
 * ici, et rendre une erreur ferait croire à l'appelant que sa restauration n'a
 * pas eu lieu. Un échec est journalisé, jamais propagé.
 *
 * La clé est la room PERSONNELLE du participant (`userId ?? id`) — un
 * participant sans ligne `User` a une room nommée d'après son `Participant.id`.
 */
export async function rejoinRestoredMembership(
  fastify: Pick<FastifyInstance, 'socketIOHandler'>,
  params: { readonly roomKey: string; readonly conversationId: string },
): Promise<void> {
  const manager = fastify.socketIOHandler?.getManager?.();
  if (!manager) return;
  try {
    await manager.joinUserToConversationRoom(params.roomKey, params.conversationId);
  } catch (err) {
    logger.error('Failed to re-join restored membership to conversation room', {
      userId: params.roomKey,
      conversationId: params.conversationId,
      err,
    });
  }
}
