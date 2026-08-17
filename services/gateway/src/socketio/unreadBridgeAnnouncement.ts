import type { ConversationUnreadUpdatedEventData } from '@meeshy/shared/types/socketio-events';

/**
 * Ce qu'un émetteur de `conversation:unread-updated` DIT du pont ✦ quand il n'a
 * que le compteur sous la main.
 *
 * Le champ `bridge` porte trois états, pas deux — voir le tableau sur
 * `ConversationUnreadUpdatedEventData.bridge` :
 *
 *   `{…}`  → voici le pont de CE lecteur ;
 *   `null` → j'ai la réponse, il n'y a pas de pont ⇒ le client efface le sien ;
 *   absent → je ne l'ai pas calculé ⇒ le client garde le sien.
 *
 * Les deux clients recopient le champ INCONDITIONNELLEMENT dans leur cache de
 * liste : ce qui arrive ici ÉCRIT, y compris quand rien n'arrive. Tant que
 * l'absence et `null` étaient la même forme, un émetteur qui ne calcule pas le
 * pont ordonnait son effacement sans le savoir.
 *
 * Or un compteur suffit à trancher UN cas, et gratuitement : le contrat gelé
 * (§3.2) interdit un pont sans non-lu. Un émetteur qui vient de recalculer un
 * compteur à zéro SAIT donc qu'il n'y a pas de pont, sans ouvrir la moindre
 * requête — et c'est exactement ce qui doit retirer le pont périmé de la ligne
 * d'un lecteur qui vient de rattraper (sur un autre appareil, par exemple).
 * Au-dessus de zéro, le compteur ne dit rien du pont : il faudrait le calculer,
 * et se taire est alors la seule phrase honnête.
 *
 * Utilisé par les émetteurs qui ne font PAS la passe de ponts
 * (`broadcastReadStatus`, `conversation:join`) et comme repli par ceux qui la
 * font mais n'ont pas de réponse pour cette conversation-là (borne de
 * l'instantané de reconnexion, passe tombée).
 */
export function bridgeKnowledgeFromCount(
  unreadCount: number
): Pick<ConversationUnreadUpdatedEventData, 'bridge'> {
  return unreadCount === 0 ? { bridge: null } : {};
}
