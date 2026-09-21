/**
 * Ce qu'une ligne de la liste des favoris SERT — champ par champ (#7377).
 *
 * Règle 4 de `services/gateway/decisions.md` (§ « Le favori de message ») :
 * chaque champ servi l'est par choix. Les requêtes lisent les `select` NOMMÉS
 * ci-dessous, et la projection RECONSTRUIT chaque objet au lieu de répandre une
 * ligne Prisma : une colonne ajoutée demain au `select` n'atteint pas le fil
 * tant qu'une ligne d'ici ne la nomme pas.
 */
import { Prisma } from '@meeshy/shared/prisma/client';
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';
import { resolveParticipantAvatar, resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import type {
  StarredMessageAttachment,
  StarredMessageBody,
  StarredMessageConversation,
  StarredMessageItem,
  StarredMessageSender,
  StarredMessageTranslation,
} from '@meeshy/shared/types/message-star';

import { attachmentForwardPreviewSelect, attachmentProtectionSelect } from '../../attachments/attachmentIncludes';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../../utils/translation-transformer';
import type { StarredMessageVerdict } from './starredMessageVerdict';

/** Au plus quatre pièces en aperçu : la ligne d'une liste montre un type et une vignette, jamais un carrousel. */
export const STARRED_MESSAGE_ATTACHMENT_PREVIEW_COUNT = 4;

/**
 * Le message VIVANT : les colonnes du verdict, le contenu que le Prisme lit, et
 * l'auteur SANS aucune présence. Rien du chiffrement, des métadonnées, des
 * réactions ni des mentions.
 */
export const STARRED_MESSAGE_SELECT = Prisma.validator<Prisma.MessageSelect>()({
  id: true,
  conversationId: true,
  messageType: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  expiresAt: true,
  isViewOnce: true,
  isBlurred: true,
  isEncrypted: true,
  effectFlags: true,
  content: true,
  originalLanguage: true,
  translations: true,
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      user: { select: { username: true, displayName: true, avatar: true } },
    },
  },
  attachments: {
    select: { ...attachmentForwardPreviewSelect, ...attachmentProtectionSelect },
    orderBy: { createdAt: 'asc' },
    take: STARRED_MESSAGE_ATTACHMENT_PREVIEW_COUNT,
  },
});

export type StarredMessageRow = Prisma.MessageGetPayload<{ select: typeof STARRED_MESSAGE_SELECT }>;

/** De quoi nommer la conversation et calculer son accent (`type`) — rien de plus. */
export const STARRED_CONVERSATION_SELECT = Prisma.validator<Prisma.ConversationSelect>()({
  id: true,
  identifier: true,
  type: true,
  title: true,
  avatar: true,
});

export type StarredConversationRow = Prisma.ConversationGetPayload<{ select: typeof STARRED_CONVERSATION_SELECT }>;

/** L'autre participant d'une conversation DIRECTE — son nom et son avatar, jamais sa présence. */
export const STARRED_DIRECT_PEER_SELECT = Prisma.validator<Prisma.ParticipantSelect>()({
  conversationId: true,
  displayName: true,
  avatar: true,
  user: { select: { username: true, displayName: true, avatar: true } },
});

export type StarredDirectPeerRow = Prisma.ParticipantGetPayload<{ select: typeof STARRED_DIRECT_PEER_SELECT }>;

type StarRow = { readonly id: string; readonly createdAt: Date };

/**
 * `Message.translations` est un document Mongo lu SANS validation : seule une
 * CARTE est une carte de traductions. `transformTranslationsToArray` écarte
 * ensuite, entrée par entrée, toute traduction sans texte.
 */
function isTranslationMap(value: unknown): value is Record<string, MessageTranslationJSON> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Les traductions en tableau — la forme que les clients décodent déjà pour un
 * message. Une traduction CHIFFRÉE n'est pas un contenu lisible : elle ne part
 * pas, et l'enveloppe de chiffrement ne part jamais.
 */
function projectTranslations(row: StarredMessageRow): StarredMessageTranslation[] {
  if (!isTranslationMap(row.translations)) return [];
  return transformTranslationsToArray(row.id, row.translations)
    .filter((translation) => translation.isEncrypted !== true)
    .map((translation) => ({
      id: translation.id,
      messageId: translation.messageId,
      targetLanguage: translation.targetLanguage,
      translatedContent: translation.translatedContent,
      ...(typeof translation.translationModel === 'string' ? { translationModel: translation.translationModel } : {}),
      ...(typeof translation.confidenceScore === 'number' ? { confidenceScore: translation.confidenceScore } : {}),
    }));
}

/** Une pièce masquée À SON NIVEAU part sans URL ni vignette. */
function projectAttachment(attachment: StarredMessageRow['attachments'][number]): StarredMessageAttachment {
  const isMasked = maskedAttachment(attachment);
  return {
    id: attachment.id,
    mimeType: attachment.mimeType,
    fileUrl: isMasked ? null : attachment.fileUrl,
    thumbnailUrl: isMasked ? null : attachment.thumbnailUrl ?? null,
    isMasked,
  };
}

/**
 * Le corps du message. Un PLACEHOLDER garde l'identité, la conversation, le
 * type et la date ; il perd le texte, la langue d'origine, les traductions,
 * les pièces jointes et la date d'édition.
 */
export function projectStarredMessage(
  row: StarredMessageRow,
  verdict: Extract<StarredMessageVerdict, 'placeholder' | 'served'>,
): StarredMessageBody {
  const identity = {
    id: row.id,
    conversationId: row.conversationId,
    messageType: row.messageType,
    createdAt: row.createdAt.toISOString(),
  };
  if (verdict === 'placeholder') {
    return {
      ...identity,
      editedAt: null,
      isProtected: true,
      content: null,
      originalLanguage: null,
      translations: [],
      attachments: [],
    };
  }
  return {
    ...identity,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    isProtected: false,
    content: row.content,
    originalLanguage: row.originalLanguage,
    translations: projectTranslations(row),
    attachments: row.attachments.map(projectAttachment),
  };
}

export function projectStarredSender(sender: StarredMessageRow['sender'] | null): StarredMessageSender | null {
  if (!sender) return null;
  return {
    id: sender.id,
    userId: sender.userId ?? null,
    displayName: resolveParticipantDisplayName(sender),
    avatar: resolveParticipantAvatar(sender),
    username: sender.user?.username ?? null,
  };
}

/**
 * Une conversation DIRECTE n'a pas de titre propre : elle porte le nom et
 * l'avatar de l'autre participant (même lecture que `toConversation` côté iOS,
 * qui ignore le titre stocké d'un direct).
 */
export function projectStarredConversation(
  conversation: StarredConversationRow,
  directPeer: StarredDirectPeerRow | null,
): StarredMessageConversation {
  const isDirect = conversation.type === 'direct';
  const peerName = directPeer ? resolveParticipantDisplayName(directPeer) ?? directPeer.user?.username ?? null : null;
  return {
    id: conversation.id,
    identifier: conversation.identifier,
    type: conversation.type,
    name: isDirect ? peerName : conversation.title ?? null,
    avatar: isDirect ? (directPeer ? resolveParticipantAvatar(directPeer) : null) : conversation.avatar ?? null,
  };
}

export function projectStarredItem(params: {
  readonly star: StarRow;
  readonly message: StarredMessageRow;
  readonly verdict: Extract<StarredMessageVerdict, 'placeholder' | 'served'>;
  readonly conversation: StarredConversationRow;
  readonly directPeer: StarredDirectPeerRow | null;
}): StarredMessageItem {
  return {
    id: params.star.id,
    starredAt: params.star.createdAt.toISOString(),
    message: projectStarredMessage(params.message, params.verdict),
    sender: projectStarredSender(params.message.sender),
    conversation: projectStarredConversation(params.conversation, params.directPeer),
  };
}
