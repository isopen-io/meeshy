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
