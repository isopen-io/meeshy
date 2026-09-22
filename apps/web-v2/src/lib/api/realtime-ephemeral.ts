import type { QueryClient } from '@tanstack/react-query';

import type {
  MessageCountdownStartedEventData,
  MessageExpiredEventData,
  SocketIOMessage,
} from '@meeshy/shared/types/socketio-events/message';

import { DESTRUCTION_MS, announceDestruction } from '@/lib/view/ephemeral-destruction';
import { forgetEphemeral, noteEphemeralReception, noteServedDeadline } from '@/lib/view/ephemeral-reception';

import { patchThreadMessages } from './messages';

/**
 * LES DEUX PUITS DU DÉCOMPTE (#7454, travail 3) — `message:expired` et
 * `message:countdown-started`.
 *
 * Relevé sur `origin/dev` 3ff99d3aa3 : web-v2 n'écoutait NI l'un NI l'autre
 * (`socket.ts:751-758`). Un message détruit par le serveur restait donc
 * affiché jusqu'au prochain chargement du fil — sur une protection dont tout
 * l'intérêt est de disparaître, c'est le défaut qui compte le plus.
 *
 * Ils vivent dans un fichier à eux plutôt que dans `realtime-apply.ts` (892
 * lignes) : le budget du dépôt demande un découpage par RESPONSABILITÉ, et
 * l'échéance d'un éphémère en est une — elle touche le cache du fil ET le
 * registre de réception, que les autres puits ne connaissent pas.
 */

export function isMessageExpiredEvent(payload: unknown): payload is MessageExpiredEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.messageId === 'string' && typeof p.conversationId === 'string';
}

export function isMessageCountdownStartedEvent(payload: unknown): payload is MessageCountdownStartedEventData {
  if (!isMessageExpiredEvent(payload)) return false;
  return typeof (payload as unknown as Record<string, unknown>).expiresAt === 'string';
}

/**
 * `applyMessageExpired` — **LE MESSAGE DISPARAÎT SUR-LE-CHAMP.**
 *
 * RETIRÉ du cache, jamais marqué : le contrat (#7451, point 7) dit que le
 * serveur cesse de le servir à ce lecteur, et une rangée gardée avec un
 * drapeau « échu » serait un objet dont le contenu vit encore dans la mémoire
 * de l'onglet. C'est la différence avec `applyMessageConsumed`, qui fait
 * évoluer un message qui EXISTE toujours.
 *
 * Le registre de réception oublie le message du même mouvement : garder son
 * horodatage ne servirait plus rien et ferait fuir la mémoire d'un fil très
 * long (`ephemeral-reception.ts`, dimension 3).
 *
 * NO-OP silencieux quand la conversation n'a pas de cache ou que le message
 * n'y figure pas — même motif que les autres puits.
 */
export function applyMessageExpired(
  queryClient: QueryClient,
  data: MessageExpiredEventData,
  schedule: (fn: () => void, ms: number) => void = (fn, ms) => {
    setTimeout(fn, ms);
  },
): void {
  /**
   * **L'ANNONCE D'ABORD, LE RETRAIT ENSUITE** (#7468, travail 2). Retirer la
   * ligne sur-le-champ faisait disparaître la rangée d'une image à l'autre :
   * exactement le défaut que l'échéance locale vient de corriger, revenu par
   * la porte du temps réel — et c'est le chemin qui DEVIENDRA le plus fréquent
   * une fois #7451 fusionné, puisque la passerelle émettra alors `D(u)` pour
   * chaque destinataire.
   *
   * Le fil ouvert reçoit l'annonce, peint la combustion, et la ligne s'en va
   * quand l'effet est fini. Fil fermé : personne n'écoute, la ligne part
   * `DESTRUCTION_MS` plus tard — un délai que rien ne montre.
   *
   * `forgetEphemeral` attend lui aussi la fin de la fenêtre : oublier la
   * réception tout de suite rendrait l'échéance `awaiting-reception` pendant
   * la combustion, et la puce repasserait « en attente » sur un message en
   * train de brûler.
   */
  announceDestruction(data.messageId);
  schedule(() => {
    forgetEphemeral(data.messageId);
    patchThreadMessages(queryClient, data.conversationId, (messages) =>
      messages.some((m) => m.id === data.messageId) ? messages.filter((m) => m.id !== data.messageId) : messages,
    );
  }, DESTRUCTION_MS);
}

/**
 * `applyMessageCountdownStarted` — **L'ÉCHÉANCE SERVIE SE POSE.**
 *
 * Elle n'écrit PAS dans le cache du fil : `Message.expiresAt` y est ce que le
 * REST a servi, et l'écraser mêlerait deux sources dans un même champ. Elle
 * entre dans le registre, d'où la règle partagée la retient EN CONCURRENCE
 * avec la réception locale — la plus PROCHE gagne
 * (`@meeshy/shared/utils/ephemeral-deadline`).
 *
 * Aucun rendu n'est forcé : l'échéance servie ne peut que RAPPROCHER
 * l'échéance affichée, et le chrome de protection tourne déjà sur l'horloge
 * partagée — il lira la nouvelle valeur au prochain rendu de la liste, au plus
 * tard à l'échéance qu'il tient. Forcer une invalidation ici ferait repeindre
 * le fil entier pour une valeur qu'aucun pixel ne montre encore.
 */
export function applyMessageCountdownStarted(data: MessageCountdownStartedEventData): void {
  noteServedDeadline(data.messageId, data.expiresAt);
}

/**
 * LA RÉCEPTION AU SENS DU CONTRAT (#7451, point 2) — `message:new` est le
 * chemin NOMINAL, et il arrive que le fil soit FERMÉ : sans cet horodatage, un
 * éphémère reçu pendant qu'on lit la liste des conversations ne commencerait à
 * décompter qu'à l'ouverture du fil, minutes plus tard.
 *
 * Idempotent (première vue gagne), donc sans effet sur un message que le rendu
 * a déjà horodaté, et sans conséquence pour l'expéditeur — dont l'écho revient
 * par ce même canal et dont la règle partagée ignore la « réception » locale.
 */
export function noteEphemeralDelivery(message: SocketIOMessage, atMs: number): void {
  const duration = message.ephemeralDuration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return;
  noteEphemeralReception(message.id, atMs);
}
