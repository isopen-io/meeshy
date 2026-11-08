package me.meeshy.sdk.model

import me.meeshy.sdk.model.preview.PreviewFieldUpdate

/**
 * L'identité du dernier message dans un `conversation:updated`, TRI-ÉTAT comme `LastMessageIdentity`
 * (iOS) : une clé absente et une clé nulle ne sont pas le même ordre.
 *
 * - [Unchanged] : l'événement n'en parle pas (renommage, avatar…) - l'aperçu n'est PAS effacé ;
 * - [Replaced] : le message nommé devient le dernier de la ligne ;
 * - [ReplacedByNothing] : « plus aucun message visible pour ce lecteur » - l'aperçu est effacé.
 *
 * Seule l'identité porte ce fait : c'est le seul champ du groupe d'aperçu dont l'ABSENCE et la
 * NULLITÉ se distinguent sur le fil.
 */
sealed interface LastMessageIdentity {
    data object Unchanged : LastMessageIdentity
    data class Replaced(val messageId: String) : LastMessageIdentity
    data object ReplacedByNothing : LastMessageIdentity

    /** L'id nommé, `null` quand l'événement n'en nomme aucun. */
    val namedId: String? get() = (this as? Replaced)?.messageId

    companion object {
        fun of(update: PreviewFieldUpdate<String>): LastMessageIdentity = when (update) {
            PreviewFieldUpdate.Unchanged -> Unchanged
            is PreviewFieldUpdate.Replaced -> update.value?.let(::Replaced) ?: ReplacedByNothing
        }
    }
}

/** L'identité du dernier message portée par cet événement. */
val ConversationUpdatedSocketEvent.lastMessageIdentity: LastMessageIdentity
    get() = LastMessageIdentity.of(lastMessageId)
