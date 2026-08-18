/**
 * Extract the User ID from a message sender object.
 *
 * Handles two wire formats:
 * - REST: sender = { id: ParticipantId, userId?: UserId, user?: { id: UserId } }
 * - Socket.IO: sender = { id: ParticipantId, userId: UserId }
 *
 * Returns the User ID (not the Participant ID).
 * Returns null if no User ID can be determined.
 */
export function getSenderUserId(sender: Record<string, unknown> | null | undefined): string | null {
  if (!sender) return null;

  // Flat userId (present in Socket.IO payloads and REST with userId selected)
  if (typeof sender.userId === 'string' && sender.userId) {
    return sender.userId;
  }

  // Nested user.id (present in REST API responses with included user relation)
  const user = sender.user as Record<string, unknown> | undefined;
  if (user && typeof user.id === 'string' && user.id) {
    return user.id;
  }

  return null;
}

/**
 * L'auteur d'un message a-t-il un compte ?
 *
 * `Participant.type` fait foi : c'est la colonne qui porte la réponse en base,
 * et elle voyage désormais sur les deux chemins principaux — payload socket
 * `message:new` et réponses REST (`userMinimalSchema.type`).
 *
 * `isMeeshyer` et `isAnonymous` ne sont que des REPLIS pour les charges utiles
 * qui ne portent pas encore `type` (routes `/links/*`). Ils cèdent devant lui
 * quand les deux sont présents : un drapeau hérité ne contredit pas la base.
 *
 * Défaut `false` quand rien n'est dit. Le seul repli acceptable : marquer à tort
 * un inscrit comme « sans compte » est une affirmation fausse sur son identité,
 * là où ne rien marquer n'en fait aucune.
 */
export function isAnonymousSender(sender: Record<string, unknown> | null | undefined): boolean {
  if (!sender) return false;

  if (typeof sender.type === 'string') {
    return sender.type === 'anonymous';
  }

  if (typeof sender.isMeeshyer === 'boolean') {
    return !sender.isMeeshyer;
  }

  if (typeof sender.isAnonymous === 'boolean') {
    return sender.isAnonymous;
  }

  return false;
}
