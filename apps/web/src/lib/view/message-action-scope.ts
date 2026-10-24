import {
  messageActionsFor,
  viewerIsRegistered,
  type ActionConversation,
  type ActionViewer,
  type MessageActions,
  type MessageActionSubject,
} from '@meeshy/shared/utils/message-action-policy';

import type { Conversation, Message } from '@/lib/api/types';

import type { MediaPageOffers } from './viewer-page-offers';

import { placeOf, stickerOf } from './message-body';
import { metadataOf } from './message-metadata';

/**
 * QUI LIT, ET DANS QUELLE CONVERSATION (#11210) — la porte UNIQUE par laquelle
 * le web remet un message à `messageActionsFor` (`@meeshy/shared`). Le menu,
 * « Plus… », la suppression, l'épingle, le signalement et la modération en
 * lisent les verdicts : aucun ne recompose une règle de rôle ou d'auteur.
 *
 * Ce que le client ne sait pas, il le dit fermé — une conversation non lue ne
 * fait du lecteur ni un membre ni un rédacteur — SAUF ce que la passerelle ne
 * sert pas à tout le monde : la ligne de participation d'un invité arrivé
 * au-delà du plafond du détail (`CONVERSATION_DETAIL_PARTICIPANTS_CAP`, 100)
 * n'est pas servie, et son absence ne lui retire pas le droit d'écrire que le
 * composeur lui laisse (la passerelle refuse en 403 s'il le faut). Le mineur
 * déclaré se lit sur `viewerWriteRestriction`, servi sur chaque conversation.
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
  /** `viewerWriteRestriction === 'minor-global'` (#9927) : Meeshy Global se lit sans s'écrire. */
  readonly isDeclaredMinor: boolean;
};

export type ActionScope = { readonly viewer: MenuViewer; readonly conversation: ActionConversation };

type ScopeParticipant = {
  readonly id: string;
  readonly userId?: string | undefined;
  readonly role?: string | undefined;
  readonly permissions?: { readonly canSendMessages?: boolean } | undefined;
  readonly isActive?: boolean | undefined;
  readonly leftAt?: Date | string | null | undefined;
};

/**
 * LE LECTEUR EST-IL UN PARTICIPANT ACTIF ? (#11415) — la passerelle ne sert le
 * détail qu'à un participant actif (`verdictAccesConversation`) et exige la
 * même chose de « Supprimer pour moi », de la réaction et du signalement. Le
 * client dit fermé ce qu'il ne sait pas (aucune conversation lue), et rien ne
 * survit à ce que le serveur a dit : `isMember: false`, ou la ligne du lecteur
 * servie inactive ou quittée (`Participant.isActive`, `leftAt`).
 */
const viewerIsActiveMember = (
  conversation: { readonly isMember?: boolean | undefined } | undefined,
  participant: ScopeParticipant | undefined,
): boolean => conversation !== undefined && conversation.isMember !== false && participant?.isActive !== false && participant?.leftAt == null;

/** Le lecteur de l'écran, composé UNE fois : compte, rôles et permission d'envoi viennent de ce que le serveur a servi. */
export function menuViewerOf(input: {
  readonly viewer: { readonly id: string | null; readonly isAnonymous: boolean };
  readonly participants: readonly ScopeParticipant[] | undefined;
  readonly conversation:
    | {
        readonly currentUserRole?: string | null | undefined;
        readonly isMember?: boolean | undefined;
        readonly viewerWriteRestriction?: string | null | undefined;
      }
    | undefined;
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
    canSendMessages: participant?.permissions?.canSendMessages ?? id !== '',
    isActiveMember: viewerIsActiveMember(conversation, participant),
    isDeclaredMinor: conversation?.viewerWriteRestriction === 'minor-global',
  };
}

/**
 * Le régime d'une conversation que le fil n'a pas encore lue : INCONNU, donc
 * chiffré pour la loi (`sharedTranslationServerReadsMessage`) — rien de ce qui
 * ferait partir le clair ne s'offre avant de savoir.
 */
const UNREAD_REGIME = 'unread';

/**
 * LE RÉGIME EST-IL CONNU ? — non tant que le détail n'est pas lu. Les verdicts
 * restent fermés (chiffré par défaut), mais l'écran ne PRÉTEND rien : ni la
 * mention du bout en bout, ni « sur l'appareil » sur une conversation qui
 * sera peut-être en clair.
 */
export const menuRegimeKnown = (conversation: ActionConversation): boolean => conversation.encryptionMode !== UNREAD_REGIME;

/**
 * La conversation que la loi lit — un type inconnu n'ouvre rien qui dépende du
 * type, et un régime que la passerelle n'a pas SERVI (champ absent, forme
 * allégée d'un cache) est inconnu, jamais en clair : seul un `null` servi dit
 * « sans chiffrement » (#11372).
 */
export const menuConversationOf = (
  conversation: Pick<Conversation, 'type' | 'encryptionMode' | 'isActive' | 'isAnnouncementChannel' | 'defaultWriteRole'> | undefined,
): ActionConversation => ({
  type: conversation?.type ?? 'unknown',
  encryptionMode: conversation === undefined || !('encryptionMode' in conversation) ? UNREAD_REGIME : conversation.encryptionMode ?? null,
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

const actionViewerOf = (viewer: MenuViewer): ActionViewer => ({ ...viewer, participantId: viewer.participantId ?? null });

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

/**
 * LE WEB NE CHIFFRE PAS SES ENVOIS (#9224, #11372) — là où la loi dit que le
 * serveur ne doit pas lire le clair (bout en bout, régime inconnu, message
 * chiffré), une réponse ou un nouvel essai partirait EN CLAIR : le web n'arme
 * donc ni l'un ni l'autre, et la mention du bout en bout (`e2eeNotice`) dit
 * pourquoi. La passerelle, elle, accepte aujourd'hui ce clair et le stocke :
 * son refus est suivi par #11216 — cette garde est la seule qui tienne d'ici là.
 */
export const webSendsHere = (actions: MessageActions): boolean => actions.verdicts.serverFeatureAbsence === null;

/** Répondre depuis le web : le droit d'écrire (`canReply`) ET un envoi que le web sait faire ici. */
export const webRepliesTo = (actions: MessageActions): boolean => actions.verdicts.canReply && webSendsHere(actions);

/**
 * RÉPONDRE À CE MESSAGE D'ICI (#11372) — un message à vue unique ne se cite
 * pas, et `webRepliesTo` dit le reste. LA loi de toutes les portes : le menu
 * (`useMessageMenu.replyableOf`), le glissé, le résumé, la visionneuse et la
 * citation que le composeur arme ou restaure (`useThreadCompose`).
 */
export const webRepliesToMessage = (message: ActionMessage, scope: ActionScope, input: { readonly now: number; readonly failed?: boolean }): boolean =>
  message.isViewOnce !== true && webRepliesTo(messageActionsOf(message, scope, input));

/**
 * MODIFIER DEPUIS LE WEB, EN AUTEUR SEULEMENT (#11372) — la loi admet qu'un
 * rôle de plateforme réécrive le message d'un autre (`edit.asModerator`), mais
 * la passerelle n'enregistre pas l'auteur de la modification et l'interface ne
 * l'affiche pas : ce serait une réécriture silencieuse. Le web ne l'offre pas.
 */
export const webEditsAsAuthor = (actions: MessageActions): boolean => actions.verdicts.edit !== null && !actions.verdicts.edit.asModerator;

/**
 * LES OFFRES D'UNE PIÈCE, DANS CE QUE LE MESSAGE ADMET (#11210, #11372) — la
 * visionneuse et le menu d'une pièce lisent ici les mêmes verdicts que le menu
 * du message entier : réagir (`canReact`), répondre (`webRepliesTo`),
 * partager (`forward`). Sans verdict, rien de ce qu'un rôle décide ne s'offre.
 */
export const mediaOffersWithin = (offers: MediaPageOffers, actions: MessageActions | null): MediaPageOffers => ({
  ...offers,
  react: offers.react && actions !== null && actions.verdicts.canReact,
  reply: offers.reply && actions !== null && webRepliesTo(actions),
  share: offers.share && actions !== null && actions.verdicts.forward,
});
