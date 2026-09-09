import type { Message, Participant } from '@/lib/api/types';
import type { SentMessageAck } from '@/lib/api/messages';

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
export type LocalMessage = Message & { readonly clientMessageId: string };

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
  readonly now: Date;
}): LocalMessage {
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
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    // Rien n'est encore parti : `deliveredCount` à 0 est ce que `deliveryOf`
    // (`lib/view/message.ts`) lit comme « en attente », sans champ inventé.
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
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
