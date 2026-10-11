/**
 * La room des sockets INVITÉES (sans compte Meeshy) d'une conversation
 * (#10205). Une socket invitée la rejoint à l'authentification et à chaque
 * `conversation:join` ; ce qui ne doit pas lui parvenir — l'effectif — s'en
 * EXCLUT (`emitConversationMemberCountEvent`). Site unique du nom.
 */
export const conversationGuestsRoom = (conversationId: string): string => `conversation-guests:${conversationId}`;
