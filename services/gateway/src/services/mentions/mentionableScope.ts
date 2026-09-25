/**
 * Qui peut-on mentionner dans une conversation ? UNE seule réponse, lue par
 * la recherche (`getUserSuggestionsForConversation`) ET par la validation à
 * l'envoi (`validateMentionPermissions`) — #7852.
 *
 * Les deux fonctions tenaient chacune leur règle : la recherche proposait amis
 * et annuaire dans un groupe, que la validation refusait ensuite ; la
 * validation rejetait un broadcast que la recherche servait. Une suggestion
 * qu'on refuse à l'envoi est un contrôle qui ment.
 *
 *   interlocutor  conversation directe : l'autre participant, seul
 *   members       groupe : tout membre actif, et personne d'autre
 *   directory     public, global, broadcast : membres et amis d'abord, puis
 *                 tout l'annuaire
 */
export type MentionableScope = 'interlocutor' | 'members' | 'directory';

export function mentionableScope(conversationType: string): MentionableScope | null {
  switch (conversationType) {
    case 'direct':
      return 'interlocutor';
    case 'group':
      return 'members';
    case 'public':
    case 'global':
    case 'broadcast':
      return 'directory';
    default:
      return null;
  }
}

/**
 * Une portée fermée (directe, groupe) ne se liste qu'à ses membres : sans
 * cette garde, tout compte authentifié énumérait les membres de n'importe quel
 * groupe en passant son identifiant.
 */
export function scopeRequiresMembership(scope: MentionableScope): boolean {
  return scope !== 'directory';
}
