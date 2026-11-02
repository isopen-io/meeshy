/**
 * Qui peut-on mentionner dans une conversation ? UNE seule réponse, lue par
 * la recherche (`getUserSuggestionsForConversation`) ET par la validation à
 * l'envoi (`validateMentionPermissions`) — #7852. La table vit dans
 * `@meeshy/shared/utils/mention-lookup` (#14071) : les trois clients la lisent
 * aussi, pour ne jamais afficher une suggestion que l'envoi ignorerait.
 *
 * Quelle que soit la portée, seul un MEMBRE actif cite quelqu'un (#14066) :
 * l'appartenance se vérifie au site (recherche, envoi), jamais par la portée.
 */
import { mentionableScope, type MentionableScope } from '@meeshy/shared/utils/mention-lookup';

export { mentionableScope, type MentionableScope };

/**
 * Une portée FERMÉE (directe, groupe) ne propose que les membres ; une portée
 * ouverte propose aussi connaissances, contacts et annuaire.
 */
export function scopeIsClosed(scope: MentionableScope): boolean {
  return scope !== 'directory';
}
