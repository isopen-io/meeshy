import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { LinkMessageNewEventData, SocketIOMessage } from '@meeshy/shared/types/socketio-events';
import type { ServerEmission } from './serverEmit';

/**
 * Un couple `(événement, charge)` corrélé, alias de `ServerEmission`
 * (cycle 104). Le nom survit parce que le manager l'importe ; ce qui change,
 * c'est qu'il ne vaut plus `{ event: string; payload: unknown }` — les deux
 * moitiés viennent désormais du même membre de `ServerToClientEvents`.
 */
export type SocketEmission = ServerEmission;

/**
 * Ce qu'un message envoyé par lien de partage met sur le fil — **deux** events,
 * pas un.
 *
 * `link:message:new` a toujours été un event à auditeur unique : le web
 * (`use-socket-cache-sync`, `messaging.service`). iOS
 * (`MeeshySDK/Sockets/MessageSocketManager.swift`) et Android
 * (`sdk-core/socket/MessageSocketManager.kt`) n'enregistrent qu'un seul
 * listener de création, `message:new`. Or l'envoi par lien est le SEUL
 * transport d'envoi dont dispose un participant anonyme : un invité qui écrit
 * dans une conversation partagée n'arrivait donc en temps réel chez AUCUN
 * membre mobile — ni en direct par la room, ni au reconnect par la file hors
 * ligne, qui rejoue le même event unique. Le message n'apparaissait qu'au
 * prochain refetch complet, sans rien pour le déclencher (`staleTime` côté web,
 * cache-first côté mobile).
 *
 * Les deux formes diffèrent et c'est la raison d'être de cette unité :
 * `link:message:new` transporte l'enveloppe `{ message }`, `message:new`
 * transporte le message LUI-MÊME. Rejouer l'enveloppe sous `message:new`
 * donnerait aux clients mobiles un payload sans `conversationId` au premier
 * niveau — donc non routable, donc jeté.
 *
 * Additif, jamais substitutif : le web continue de recevoir l'event qu'il
 * écoute déjà. Les deux copies portent le même `id`, et les deux gestionnaires
 * web dédupent dessus (`old.pages.some((p) => p.messages.some((m) => m.id ===
 * …))`), donc le second arrivé est un no-op — quel que soit l'ordre. La
 * pastille de non-lus ne se déduit d'aucun des deux (elle vient de la valeur
 * absolue de `conversation:unread-updated`), il n'y a donc rien à double-compter.
 *
 * Un seul point d'appel public pour les DEUX diffuseurs — la room live
 * (`broadcastLinkMessage`) et le rejeu hors ligne
 * (`MeeshySocketIOManager._drainPendingMessages`) : c'est exactement là que la
 * divergence était née, l'un ne sachant rien de l'autre.
 */
/**
 * L'enveloppe arrive `unknown` de ses DEUX producteurs — la route d'envoi par
 * lien, qui la compose, et la file hors ligne, qui la relit de Redis. C'est ici,
 * et nulle part ailleurs, qu'elle se rattache au contrat : cette unité est déjà
 * celle qui INSPECTE la forme à l'exécution (`typeof`, `Array.isArray`), donc
 * celle qui a le droit de la nommer. Deux affirmations, à la frontière de
 * désérialisation, plutôt qu'une porte d'émission ouverte en aval.
 */
export function linkMessageEmissions(payload: unknown): SocketEmission[] {
  const emissions: SocketEmission[] = [
    { event: SERVER_EVENTS.LINK_MESSAGE_NEW, payload: payload as LinkMessageNewEventData },
  ];

  const message = (payload as { message?: unknown } | null | undefined)?.message;
  // Un tableau est un `object` : sans ce refus, une enveloppe dérivée
  // enverrait une liste là où le client attend un message.
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    emissions.push({ event: SERVER_EVENTS.MESSAGE_NEW, payload: message as SocketIOMessage });
  }

  return emissions;
}
