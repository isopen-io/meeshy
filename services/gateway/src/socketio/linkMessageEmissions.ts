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
 *
 * ─── UNE LISTE VIDE, ET PAS L'ENVELOPPE SEULE ───────────────────────────────
 *
 * Une enveloppe sans message exploitable rend `[]`, jamais l'unique émission
 * `link:message:new`. Le refus du message dérivé est ancien et juste ; ce qui
 * était faux, c'est de continuer à ANNONCER une émission après lui.
 *
 * **Ce que l'enveloppe seule livre : rien.** Son unique auditeur est le web
 * (`use-socket-cache-sync`), qui lit `data.message` — absent, il n'applique
 * rien ; iOS et Android n'écoutent pas cet événement du tout et ne reçoivent
 * donc que le `message:new` dérivé, c'est-à-dire précisément celui qu'on vient
 * de refuser. Émettre l'enveloppe seule, c'est émettre vers personne.
 *
 * **Ce que la liste non vide AFFIRME, en revanche, coûte cher.** Le rejeu hors
 * ligne lit la longueur de cette liste comme le verdict « sais-je diffuser
 * ceci ? » (`_drainedEmissions` : « une liste VIDE dit *je ne sais pas diffuser
 * ceci* »), et `'link-message'` était le seul membre de l'union pour lequel ce
 * verdict ne pouvait JAMAIS être négatif. Une entrée dégradée y passait donc
 * pour une livraison pleine, et le drain étant DESTRUCTIF, trois signaux
 * mentaient d'un coup :
 *
 * 1. `pending-messages:delivered.count` la comptait comme remise ;
 * 2. sa conversation n'était PAS nommée dans `conversationIds`, donc rien
 *    n'envoyait le client rechercher le message — qui est pourtant toujours en
 *    base ;
 * 3. `announcesMessageArrival('link-message')` étant VRAI, l'accusé de remise
 *    partait : le curseur `lastDeliveredAt` de l'auteur avançait (et il est
 *    MONOTONE — `_advanceCursor` ne recule jamais), et sa coche passait à
 *    « remis » pour un message qu'aucun destinataire n'a reçu.
 *
 * C'est la règle que le gate d'appartenance du drain énonce déjà — « l'affirmer
 * d'un message qu'on vient de refuser de livrer mentirait à son auteur » —
 * appliquée au seul refus qui ne l'appliquait pas. Rendre `[]` remet l'entrée
 * sur la voie de récupération : refusée, journalisée, sa conversation nommée,
 * et la coche de son auteur laissée honnête à « envoyé ».
 *
 * Le chemin VIVANT n'y perd rien : `broadcastLinkMessage` reçoit un
 * `QueuedPayloadFor<'link-message'>`, dont le `message` est REQUIS au typage et
 * composé sur place à partir du message qui vient d'être écrit.
 */
export function linkMessageEmissions(payload: unknown): SocketEmission[] {
  const message = (payload as { message?: unknown } | null | undefined)?.message;
  // Un tableau est un `object` : sans ce refus, une enveloppe dérivée
  // enverrait une liste là où le client attend un message.
  if (!message || typeof message !== 'object' || Array.isArray(message)) return [];

  return [
    { event: SERVER_EVENTS.LINK_MESSAGE_NEW, payload: payload as LinkMessageNewEventData },
    { event: SERVER_EVENTS.MESSAGE_NEW, payload: message as SocketIOMessage },
  ];
}
