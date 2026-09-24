import type { AttachmentMessageType } from '@meeshy/shared/utils/attachment-message-type';

import type { Message, Participant } from '@/lib/api/types';
import type { SentMessageAck } from '@/lib/api/messages';
import { attachmentPreviewOf, type PendingAttachment } from './attachments';
import { protectionFieldsOf, type ComposeProtection } from './compose-protection';
import type { SharedPlace } from './shared-place';

/**
 * LE MESSAGE LOCAL (#5813, étape 3) — la forme optimiste, avant confirmation.
 *
 * `clientMessageId` n'est PAS un champ du domaine partagé (`Message`,
 * `@meeshy/shared`) : c'est l'identifiant DE CE CLIENT, porté À CÔTÉ pour
 * que la réconciliation `message:new` (#5494, § 3.4 de la spécification
 * #5813) puisse le relire sans deviner — un contenu résolu voyage avec son
 * médium (CLAUDE.md racine, § Prisme, cycle 128). `id === clientMessageId`
 * AVANT confirmation, miroir `ConversationViewModel+Send.swift:440-448`
 * (« tempId EST le clientMessageId ») ; APRÈS confirmation, `id` devient
 * l'identifiant SERVEUR et `clientMessageId` reste le local, pour la même
 * raison.
 */
export type LocalMessage = Message & {
  readonly clientMessageId: string;
  /**
   * LE LIEU, SUR LE MESSAGE (#7328) — le champ que la passerelle HISSE sur
   * tout message qui en porte un (`messages-list.ts:687-692` en REST,
   * `MessageHandler.ts:1354` et `MeeshySocketIOManager.ts:3010-3019` en temps
   * réel), et que `placeOf` (`lib/view/message-body.ts`) lit pour les DEUX
   * peaux. Il n'est pas déclaré sur le `Message` de `@meeshy/shared` — voir
   * § « ce qui reste » de #7328 : le fil le porte, le type ne le dit pas
   * encore, et ce lot n'a pas le droit d'y toucher.
   *
   * #7280 le rangeait sur l'ENTRÉE d'outbox et non ici, avec un motif écrit :
   * « un client ne compose pas le champ du domaine ». Le motif était juste sur
   * ce qui PART (le corps du POST porte un `location` DÉDIÉ, que le serveur
   * seul valide) et faux sur ce qui S'AFFICHE : la bulle optimiste est rendue
   * depuis ce `LocalMessage`, et un lieu qu'elle ne porte pas est un lieu que
   * son expéditeur n'a AUCUN moyen de voir — ni avant l'accusé, ni après,
   * `confirmedMessageOf` n'étalant que le local.
   *
   * C'est donc le même statut que `clientMessageId` ci-dessus : porté À CÔTÉ,
   * pour que ce que l'on voit et ce qui part viennent d'UNE seule source
   * (`bodyOf`, `perform-send.ts`, le relit plutôt que de recomposer).
   */
  readonly location?: SharedPlace;
};

export function localMessageOf(input: {
  readonly clientMessageId: string;
  readonly conversationId: string;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly content: string;
  readonly originalLanguage: string;
  readonly replyToId?: string;
  /**
   * LE MESSAGE CITÉ, ENTIER (revue-correction #5813, défaut majeur 6) —
   * `replyToId` seul part dans le corps du POST (`bodyOf`, `perform-send.ts`),
   * mais les DEUX peaux rendent la citation depuis `message.replyTo`
   * (`bubble.tsx`, `focal-row.tsx`, via `Quote`) : sans lui, la bulle
   * optimiste envoyait le bon `replyToId` au serveur et n'affichait AUCUNE
   * citation ni saut jusqu'au prochain chargement complet du fil — la
   * référence voyageait, l'affichage la jetait (CLAUDE.md racine, § Prisme,
   * cycle 122, « qui AFFICHE ce qu'il élit ? »).
   */
  readonly replyTo?: Message;
  /**
   * LES PIÈCES JOINTES DE LA BULLE OPTIMISTE (#5668) — des `PendingAttachment`
   * (`send/attachments.ts`), projetées en `Attachment` du domaine par
   * `attachmentPreviewOf` (`fileUrl` = URL D'OBJET LOCAL, jamais le chemin
   * serveur). `undefined`/liste vide ⇒ clé `attachments` ABSENTE, jamais un
   * tableau vide posé (même discipline que `replyToId`).
   */
  readonly attachments?: readonly PendingAttachment[];
  /**
   * LE TYPE DÉCLARÉ (#5668) — `'text'` par défaut pour ne rien changer aux
   * appelants existants (revue-correction #5813 n'en avait pas besoin) ;
   * `perform-send.ts` le dérive de la sélection via `messageTypeOfPending`
   * (`send/attachments.ts`) avant d'appeler ce constructeur.
   */
  readonly messageType?: 'text' | AttachmentMessageType;
  /**
   * LA PROTECTION CHOISIE PAR L'AUTEUR (#6175) — résolue en champs `Message`
   * PAR `protectionFieldsOf` (`compose-protection.ts`), au MÊME instant
   * `now` que le reste du message : la bulle optimiste porte ainsi EXACTEMENT
   * ce qui partira dans le corps du POST (`bodyOf`, `perform-send.ts`, qui
   * relit ces mêmes champs plutôt que de recomposer une seconde fois), et
   * D-41 (« ce qu'on envoie flouté se rend flouté chez soi ») s'applique dès
   * l'accusé optimiste, jamais seulement après confirmation serveur.
   * `undefined` ⇒ aucune protection (comportement INCHANGÉ des appelants
   * historiques : tout à `false`/`0`, comme avant ce lot).
   */
  readonly protection?: ComposeProtection;
  /** LE LIEU ATTACHÉ (#7328) — `undefined` ⇒ clé `location` ABSENTE, jamais
   * `null` posé (`exactOptionalPropertyTypes`, même discipline que
   * `replyToId`). */
  readonly place?: SharedPlace;
  readonly now: Date;
}): LocalMessage {
  const protection = protectionFieldsOf(input.protection ?? {}, input.now.getTime());
  return {
    id: input.clientMessageId,
    clientMessageId: input.clientMessageId,
    conversationId: input.conversationId,
    senderId: input.viewerId,
    ...(input.sender === undefined ? {} : { sender: input.sender }),
    ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
    ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
    content: input.content,
    originalLanguage: input.originalLanguage,
    messageType: input.messageType ?? 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: protection.isViewOnce,
    viewOnceCount: 0,
    isBlurred: protection.isBlurred,
    ...(protection.effectFlags === 0 ? {} : { effectFlags: protection.effectFlags }),
    ...(protection.expiresAt === undefined ? {} : { expiresAt: protection.expiresAt }),
    // Rien n'est encore parti : `deliveredCount` à 0 est ce que `deliveryOf`
    // (`lib/view/message.ts`) lit comme « en attente », sans champ inventé.
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    ...(input.attachments === undefined || input.attachments.length === 0
      ? {}
      : { attachments: input.attachments.map(attachmentPreviewOf) }),
    ...(input.place === undefined ? {} : { location: input.place }),
    createdAt: input.now,
    timestamp: input.now,
  };
}

/**
 * LA GREFFE DE L'ACCUSÉ (§ 3.1 de la spécification #5813) — remplace
 * l'identifiant local par l'identifiant SERVEUR et pose les compteurs
 * confirmés ; tout le reste (contenu, langue, citation, expéditeur) reste le
 * LOCAL, jamais reconstruit depuis l'accusé (qui ne les porte pas forcément
 * — § 0 de la spécification, `data` peut omettre `content`).
 *
 * `createdAt`/`timestamp` restent la CHAÎNE que l'accusé a servie — jamais
 * décodés ICI : `decodeMessagesPage` (`api/messages.ts:69-71`) est le SEUL
 * site qui revit une date depuis le cache (D-26, « cache = forme du fil »).
 * Le cast reflète cet écart de forme, exactement comme `decodeMessage`
 * (`api/decode.ts:65-68`) le fait déjà pour les champs nullables du fil —
 * un second site de décodage recréerait la jumelle que D-26 existe pour
 * éviter.
 */
export function confirmedMessageOf(local: LocalMessage, ack: SentMessageAck): LocalMessage {
  return {
    ...local,
    id: ack.id,
    createdAt: ack.createdAt as unknown as Date,
    timestamp: ack.createdAt as unknown as Date,
    deliveredCount: typeof ack.deliveredCount === 'number' ? ack.deliveredCount : 0,
    readCount: typeof ack.readCount === 'number' ? ack.readCount : local.readCount,
  };
}
