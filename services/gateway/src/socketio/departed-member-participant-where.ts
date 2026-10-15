/**
 * Le filtre `Participant` qui retrouve la ligne d'un membre SORTANT, quelle que
 * soit la colonne que porte sa clé (#10469).
 *
 * `endConversationMembership` reçoit une seule clé : le `User.id` d'un membre
 * inscrit, ou le `Participant.id` d'un invité de lien (`userId ?? id`), la même
 * qui nomme sa room personnelle. Filtrer sur `userId` seul ne rend RIEN pour un
 * invité, dont `userId` est nul : l'invité révoqué restait dans l'appel, sans
 * `call:force-leave`, et le symptôme était une liste vide, donc un silence.
 *
 * La colonne `id` n'est lue que sur une ligne d'invité (`type: 'anonymous'`) :
 * un membre inscrit ne se désigne jamais par son `Participant.id`.
 */
export function departedMemberParticipantWhere(conversationId: string, memberKey: string) {
  return { conversationId, ...participantKeyWhere(memberKey) };
}

/**
 * Le filtre `Participant` de la CLÉ d'une personne, sans autre condition
 * (#10473) : `userId` pour un membre inscrit, `id` d'une ligne d'invité
 * (`type: 'anonymous'`) pour un invité de lien. Toute requête `Participant`
 * qui reçoit la clé d'une socket (`SocketUser.id`) passe par lui.
 */
export function participantKeyWhere(memberKey: string) {
  return { OR: [{ userId: memberKey }, { id: memberKey, type: 'anonymous' }] };
}
