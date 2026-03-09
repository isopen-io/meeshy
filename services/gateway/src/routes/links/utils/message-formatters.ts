import { transformTranslationsToArray } from '../../../utils/translation-transformer';

/**
 * Extracts sender info from unified Participant model
 */
function extractSenderInfo(sender: any) {
  if (!sender) return { id: 'unknown', username: 'unknown', isMeeshyer: false };

  if (sender.type === 'user' && sender.user) {
    return {
      id: sender.user.id,
      username: sender.user.username,
      firstName: sender.user.firstName,
      lastName: sender.user.lastName,
      displayName: sender.user.displayName,
      avatar: sender.user.avatar,
      isMeeshyer: true
    };
  }

  return {
    id: sender.id,
    username: sender.displayName,
    firstName: sender.displayName,
    lastName: '',
    displayName: sender.displayName,
    avatar: sender.avatar,
    isMeeshyer: false
  };
}

/**
 * Formate un message avec sender unifié pour l'affichage
 */
export function formatMessageWithUnifiedSender(message: any) {
  const senderInfo = extractSenderInfo(message.sender);

  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage || 'fr',
    createdAt: message.createdAt,
    status: message.status || [],
    sender: senderInfo,
    translations: transformTranslationsToArray(
      message.id,
      message.translations as Record<string, any>
    )
  };
}

/**
 * Formate un message avec sender et anonymousSender séparés (backward compat)
 */
export function formatMessageWithSeparateSenders(message: any) {
  const senderInfo = extractSenderInfo(message.sender);
  const isAnonymous = message.sender?.type === 'anonymous';

  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage || 'fr',
    messageType: message.messageType,
    isEdited: message.isEdited,
    editedAt: message.editedAt,
    isDeleted: message.deletedAt !== null,
    deletedAt: message.deletedAt,
    replyToId: message.replyToId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    statusEntries: message.statusEntries || [],
    sender: !isAnonymous ? {
      id: senderInfo.id,
      username: senderInfo.username,
      firstName: senderInfo.firstName,
      lastName: senderInfo.lastName,
      displayName: senderInfo.displayName,
      avatar: senderInfo.avatar,
      systemLanguage: message.sender?.user?.systemLanguage
    } : null,
    anonymousSender: isAnonymous ? {
      id: senderInfo.id,
      username: senderInfo.username,
      firstName: senderInfo.firstName,
      lastName: senderInfo.lastName,
      language: message.sender?.language
    } : null,
    attachments: message.attachments || [],
    replyTo: message.replyTo ? formatReplyToMessage(message.replyTo) : null,
    reactions: message.reactions || [],
    translations: transformTranslationsToArray(
      message.id,
      message.translations as Record<string, any>
    )
  };
}

/**
 * Formate le message répondu (replyTo)
 */
function formatReplyToMessage(replyTo: any) {
  const senderInfo = extractSenderInfo(replyTo.sender);
  const isAnonymous = replyTo.sender?.type === 'anonymous';

  return {
    id: replyTo.id,
    content: replyTo.content,
    originalLanguage: replyTo.originalLanguage || 'fr',
    messageType: replyTo.messageType,
    createdAt: replyTo.createdAt,
    sender: !isAnonymous ? {
      id: senderInfo.id,
      username: senderInfo.username,
      firstName: senderInfo.firstName,
      lastName: senderInfo.lastName,
      displayName: senderInfo.displayName,
      avatar: senderInfo.avatar
    } : null,
    anonymousSender: isAnonymous ? {
      id: senderInfo.id,
      username: senderInfo.username,
      firstName: senderInfo.firstName,
      lastName: senderInfo.lastName,
      language: replyTo.sender?.language
    } : null
  };
}
