/**
 * Formate un message avec sender unifié pour l'affichage
 */
export function formatMessageWithUnifiedSender(message: any) {
  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage || 'fr',
    createdAt: message.createdAt,
    status: message.status || [],
    sender: message.sender ? {
      id: message.sender.id,
      username: message.sender.username,
      firstName: message.sender.firstName,
      lastName: message.sender.lastName,
      displayName: message.sender.displayName,
      avatar: message.sender.avatar,
      isMeeshyer: true
    } : {
      id: message.anonymousSender!.id,
      username: message.anonymousSender!.username,
      firstName: message.anonymousSender!.firstName,
      lastName: message.anonymousSender!.lastName,
      displayName: undefined,
      avatar: undefined,
      isMeeshyer: false
    },
    translations: message.translations || []
  };
}

/**
 * Formate un message avec sender et anonymousSender séparés
 */
export function formatMessageWithSeparateSenders(message: any) {
  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage || 'fr',
    messageType: message.messageType,
    isEdited: message.isEdited,
    editedAt: message.editedAt,
    isDeleted: message.isDeleted,
    deletedAt: message.deletedAt,
    replyToId: message.replyToId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    statusEntries: message.statusEntries || [],
    sender: message.sender ? {
      id: message.sender.id,
      username: message.sender.username,
      firstName: message.sender.firstName,
      lastName: message.sender.lastName,
      displayName: message.sender.displayName,
      avatar: message.sender.avatar,
      systemLanguage: message.sender.systemLanguage
    } : null,
    anonymousSender: message.anonymousSender ? {
      id: message.anonymousSender.id,
      username: message.anonymousSender.username,
      firstName: message.anonymousSender.firstName,
      lastName: message.anonymousSender.lastName,
      language: message.anonymousSender.language
    } : null,
    attachments: message.attachments || [],
    replyTo: message.replyTo ? formatReplyToMessage(message.replyTo) : null,
    reactions: message.reactions || [],
    translations: message.translations || []
  };
}

/**
 * Formate le message répondu (replyTo)
 */
function formatReplyToMessage(replyTo: any) {
  return {
    id: replyTo.id,
    content: replyTo.content,
    originalLanguage: replyTo.originalLanguage || 'fr',
    messageType: replyTo.messageType,
    createdAt: replyTo.createdAt,
    sender: replyTo.sender ? {
      id: replyTo.sender.id,
      username: replyTo.sender.username,
      firstName: replyTo.sender.firstName,
      lastName: replyTo.sender.lastName,
      displayName: replyTo.sender.displayName,
      avatar: replyTo.sender.avatar
    } : null,
    anonymousSender: replyTo.anonymousSender ? {
      id: replyTo.anonymousSender.id,
      username: replyTo.anonymousSender.username,
      firstName: replyTo.anonymousSender.firstName,
      lastName: replyTo.anonymousSender.lastName,
      language: replyTo.anonymousSender.language
    } : null
  };
}
