package me.meeshy.sdk.model

/**
 * Portée d'un marquage « lu » — miroir de `NotificationReadScope` (iOS, `NotificationCachePatch.swift`) : l'unité, tout
 * le contexte d'une conversation, tout le contexte d'un post ou d'une story, une catégorie, ou toute la boîte.
 *
 * Le type de notification n'est jamais un discriminant d'entité (`story_new_comment` est émis pour n'importe quel
 * contenu commenté) : c'est le contexte qui décide.
 */
sealed interface NotificationReadScope {

    data class Single(val id: String) : NotificationReadScope

    data class Conversation(val id: String) : NotificationReadScope

    data class Post(val id: String) : NotificationReadScope

    data class Types(val types: List<String>) : NotificationReadScope

    data object All : NotificationReadScope

    /** `true` quand la portée ne désigne rien (identifiant vide, aucun type) : aucun geste, aucune requête. */
    val isEmpty: Boolean
        get() = when (this) {
            is Single -> id.isBlank()
            is Conversation -> id.isBlank()
            is Post -> id.isBlank()
            is Types -> types.none { it.isNotBlank() }
            All -> false
        }

    /** La ligne [notification] est-elle couverte par cette portée ? (la MÊME loi que `NotificationCachePatch.matches` iOS) */
    fun matches(notification: ApiNotification): Boolean = when (this) {
        All -> true
        is Single -> notification.id == id
        is Conversation -> notification.context?.conversationId == id
        is Post -> notification.context?.postId == id
        is Types -> types.contains(notification.type)
    }

    /**
     * La clé sous laquelle le registre d'auto-lecture reconnaît l'écho socket de CE geste. Une notification isolée garde
     * son identifiant ; les autres portées se distinguent par leur genre pour ne jamais se confondre avec un id.
     */
    val ledgerKey: String
        get() = when (this) {
            is Single -> id
            is Conversation -> "conversation:$id"
            is Post -> "post:$id"
            is Types -> "types:${types.sorted().joinToString(",")}"
            All -> "all"
        }

    companion object {
        /** Les lignes NON LUES que [scope] couvre dans [items] — ce qu'un marquage optimiste fait basculer. */
        fun unreadMatching(scope: NotificationReadScope, items: List<ApiNotification>): List<ApiNotification> =
            items.filter { !it.state.isRead && scope.matches(it) }
    }
}
