import {
  messageActionsFor,
  viewerIsRegistered,
  type ActionConversation,
  type ActionViewer,
  type MessageActions,
  type MessageActionSubject,
} from '@meeshy/shared/utils/message-action-policy';

import type { Conversation, Message } from '@/lib/api/types';

import { placeOf, stickerOf } from './message-body';
import { metadataOf } from './message-metadata';

/**
 * QUI LIT, ET DANS QUELLE CONVERSATION (#11210) — la porte UNIQUE par laquelle
 * le web remet un message à `messageActionsFor` (`@meeshy/shared`). Le menu,
 * « Plus… », la suppression, l'épingle, le signalement et la modération en
 * lisent les verdicts : aucun ne recompose une règle de rôle ou d'auteur.
 *
 * Ce que le client ne sait pas, il le dit fermé : un mineur déclaré n'est pas
 * connu du web (la passerelle refuse alors en 403, et le refus se dit), une
 * conversation non lue ne fait du lecteur ni un membre ni un rédacteur.
 */
export type MenuViewer = {
  /** `User.id` d'un inscrit, `Participant.id` d'un invité ; vide sans session. */
  readonly id: string;
  readonly participantId?: string | null;
  readonly hasAccount: boolean;
  readonly isAnonymous: boolean;
  /** `User.role` servi (`useServedGlobalRole`), jamais deviné ; `null` pour un invité. */
  readonly platformRole: string | null;
  /** `Participant.role` dans CETTE conversation. */
  readonly conversationRole: string | null;
  readonly canSendMessages: boolean;
  readonly isActiveMember: boolean;
};

export type ActionScope = { readonly viewer: MenuViewer; readonly conversation: ActionConversation };

type ScopeParticipant = {
  readonly id: string;
  readonly userId?: string | undefined;
  readonly role?: string | undefined;
  readonly permissions?: { readonly canSendMessages?: boolean } | undefined;
};

/** Le lecteur de l'écran, composé UNE fois : compte, rôles et permission d'envoi viennent de ce que le serveur a servi. */
export function menuViewerOf(input: {
  readonly viewer: { readonly id: string | null; readonly isAnonymous: boolean };
  readonly participants: readonly ScopeParticipant[] | undefined;
  readonly conversation: { readonly currentUserRole?: string | null | undefined; readonly isMember?: boolean | undefined } | undefined;
  readonly platformRole: string | null;
}): MenuViewer {
  const { viewer, conversation } = input;
  const id = viewer.id ?? '';
  const participant = id === '' ? undefined : input.participants?.find((p) => p.userId === id || p.id === id);
  const hasAccount = !viewer.isAnonymous && id !== '';
  return {
    id,
    participantId: participant?.id ?? null,
    hasAccount,
    isAnonymous: viewer.isAnonymous,
    platformRole: hasAccount ? input.platformRole : null,
    conversationRole: conversation?.currentUserRole ?? participant?.role ?? null,
    canSendMessages: participant?.permissions?.canSendMessages ?? hasAccount,
    isActiveMember: conversation !== undefined && conversation.isMember !== false,
  };
}

/**
 * Le régime d'une conversation que le fil n'a pas encore lue : INCONNU, donc
 * chiffré pour la loi (`sharedTranslationServerReadsMessage`) — rien de ce qui
 * ferait partir le clair ne s'offre avant de savoir.
 */
const UNREAD_REGIME = 'unread';

/** La conversation que la loi lit — un type inconnu n'ouvre rien qui dépende du type. */
export const menuConversationOf = (
  conversation: Pick<Conversation, 'type' | 'encryptionMode' | 'isActive' | 'isAnnouncementChannel' | 'defaultWriteRole'> | undefined,
): ActionConversation => ({
  type: conversation?.type ?? 'unknown',
  encryptionMode: conversation === undefined ? UNREAD_REGIME : conversation.encryptionMode ?? null,
  isActive: conversation?.isActive ?? null,
  isAnnouncementChannel: conversation?.isAnnouncementChannel ?? null,
  defaultWriteRole: conversation?.defaultWriteRole ?? null,
});

/** La forme qu'un message doit porter pour être jugé — celle du fil, ou une forme allégée du cache. */
export type ActionMessage = Pick<Message, 'id' | 'senderId' | 'content' | 'createdAt' | 'isViewOnce' | 'isBlurred'> &
  Partial<
    Pick<
      Message,
      'messageType' | 'deletedAt' | 'isEncrypted' | 'encryptionMode' | 'effectFlags' | 'expiresAt' | 'ephemeralDuration' | 'metadata' | 'pinnedAt' | 'sender'
    >
  > & {
    readonly attachments?: MessageActionSubject['attachments'];
    readonly location?: unknown;
    readonly sticker?: unknown;
  };

/** Le lieu et le sticker sont servis À LA RACINE par la passerelle (`message-body.ts`) : la loi les lit dans `metadata`. */
function subjectMetadataOf(message: ActionMessage): Readonly<Record<string, unknown>> {
  const place = placeOf(message);
  const sticker = stickerOf(message);
  return { ...(metadataOf(message) ?? {}), ...(place === null ? {} : { location: place }), ...(sticker === null ? {} : { sticker }) };
}

const subjectOf = (message: ActionMessage, failed: boolean): MessageActionSubject => ({
  id: message.id,
  content: message.content,
  messageType: message.messageType ?? null,
  deletedAt: message.deletedAt ?? null,
  isViewOnce: message.isViewOnce,
  isBlurred: message.isBlurred,
  isEncrypted: message.isEncrypted ?? null,
  encryptionMode: message.encryptionMode ?? null,
  effectFlags: message.effectFlags ?? null,
  expiresAt: message.expiresAt ?? null,
  ephemeralDuration: message.ephemeralDuration ?? null,
  metadata: subjectMetadataOf(message),
  attachments: message.attachments ?? null,
  failed,
  senderId: message.senderId,
  authorUserId: message.sender?.userId ?? message.senderId,
  createdAt: message.createdAt,
  pinnedAt: message.pinnedAt ?? null,
});

const actionViewerOf = (viewer: MenuViewer): ActionViewer => ({ ...viewer, participantId: viewer.participantId ?? null, isDeclaredMinor: false });

/** Un inscrit, jamais un invité — la loi partagée (`viewerIsRegistered`) : le favori, l'épingle et la suppression le demandent. */
export const menuViewerRegistered = (viewer: MenuViewer): boolean => viewerIsRegistered(actionViewerOf(viewer));

/** Les verdicts et les groupes de `messageActionsFor` pour CE lecteur, à l'instant `now` (jamais une seconde horloge). */
export function messageActionsOf(message: ActionMessage, scope: ActionScope, input: { readonly now: number; readonly failed?: boolean }): MessageActions {
  return messageActionsFor({
    message: subjectOf(message, input.failed === true),
    conversation: scope.conversation,
    viewer: actionViewerOf(scope.viewer),
    now: input.now,
  });
}
