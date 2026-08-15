import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

/**
 * Une entrée de la file hors ligne annonce-t-elle l'ARRIVÉE d'un message, ou
 * une MUTATION de message déjà arrivé ?
 *
 * La question a exactement un consommateur — l'accusé de remise du drain
 * (`MeeshySocketIOManager._emitDeliveryForDrainedMessages`) — et une seule bonne
 * réponse par famille d'`eventType`. Elle vit ici, en face du vocabulaire
 * qu'elle interroge, pour qu'une famille NOUVELLE ne puisse pas se glisser dans
 * l'union sans que quelqu'un ait tranché son cas : le prédicat énumère, il ne
 * teste pas l'égalité à une valeur.
 *
 * ─── CE QUE LE PRÉDICAT REMPLACE, ET POURQUOI IL SE TROMPAIT ────────────────
 *
 * Le filtre était `(entry.eventType ?? 'new') === 'new'`, sous un commentaire
 * qui énonçait la bonne règle — « seuls les VRAIS nouveaux messages » — et une
 * justification qui ne nommait que `edited`/`deleted`. Entre l'intention et le
 * test littéral s'est glissée `link-message`, ajoutée plus tard : un message
 * envoyé par un invité de lien partagé, que `linkMessageEmissions` rejoue sous
 * `message:new` AUTANT que sous `link:message:new` — parce que iOS et Android
 * n'écoutent que le premier. C'est une arrivée pleine et entière ; le filtre la
 * lisait comme une mutation.
 *
 * ─── CE QUE ÇA COÛTAIT ──────────────────────────────────────────────────────
 *
 * `broadcastLinkMessage` doit quatre signaux, et le quatrième est le seul dont
 * le bénéficiaire est l'AUTEUR : sa coche « envoyé » → « remis ». Il est servi
 * par `autoDeliverToOnlineRecipients`, qui ne connaît que les destinataires
 * CONNECTÉS. Le destinataire absent, lui, dépend entièrement de ce drain — et
 * n'y produisait ni ligne `received` ni accusé. L'auteur restait donc sur un tic
 * unique jusqu'à ce que quelqu'un OUVRE la conversation, c'est-à-dire
 * exactement l'attente que `_emitDeliveryForDrainedMessages` existe pour
 * supprimer (« matching WhatsApp / iMessage behaviour instead of waiting for the
 * user to open the conversation »).
 *
 * L'envoi par lien étant le SEUL transport d'envoi d'un participant anonyme, la
 * moitié en défaut était précisément celle de l'utilisateur qui n'a pas d'autre
 * recours. Le correctif jumeau côté diffusion existait d'ailleurs déjà : le
 * fan-out adresse les lignes sans compte par `Participant.id` « parce que le
 * pair sans compte est peut-être l'AUTEUR qui attend son tic ». Cet effort était
 * annulé un cran plus haut, par un filtre que l'entrée n'atteignait jamais.
 *
 * ─── LE DISCRIMINANT QUI INTERDIT LA SUR-CORRECTION ─────────────────────────
 *
 * Élargir aux arrivées ne doit rien élargir d'autre. Les huit autres familles
 * portent une mutation d'un message DÉJÀ arrivé (`edited`, `deleted`, les deux
 * paires de réactions, `pinned`/`unpinned`, `attachment-updated`,
 * `translation`) : leur accuser réception affirmerait une remise qui n'a pas eu
 * lieu — et pour `deleted`, la remise d'un message qui n'existe plus.
 */
export function announcesMessageArrival(eventType: QueuedMessagePayload['eventType']): boolean {
  // `undefined` = héritage : les entrées écrites avant l'existence du champ
  // sont des `message:new`, ce que le drain suppose déjà partout ailleurs.
  return eventType === undefined || eventType === 'new' || eventType === 'link-message';
}
