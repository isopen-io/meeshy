package me.meeshy.sdk.model.sync

/**
 * Où mène une entrée de la file (miroir d'iOS `OutboxUIItem.Source`). L'ancre d'un message voyage DANS la destination :
 * « où cette entrée mène-t-elle » est une seule question.
 *
 * Ce que l'ancre contient dépend de ce que l'entrée EST : un envoi vise l'id LOCAL de la bulle optimiste ([forSend]),
 * une édition / suppression / réaction l'id SERVEUR de sa cible ([forMutation]). Une charge illisible ouvre la
 * conversation SANS viser (ancre nulle) : un défilement vers un id inexistant laisserait le fil à un endroit arbitraire.
 */
sealed interface OutboxNavigationSource {
    data class Conversation(val id: String, val messageId: String?) : OutboxNavigationSource
    data class Post(val id: String) : OutboxNavigationSource
    data class Story(val id: String) : OutboxNavigationSource
    data object Unknown : OutboxNavigationSource

    companion object {
        fun forSend(conversationId: String, localMessageId: String?): OutboxNavigationSource =
            Conversation(conversationId, localMessageId?.takeIf { it.isNotBlank() })

        fun forMutation(conversationId: String, serverMessageId: String?): OutboxNavigationSource =
            Conversation(conversationId, serverMessageId?.takeIf { it.isNotBlank() })

        fun forPost(postId: String?): OutboxNavigationSource =
            postId?.takeIf { it.isNotBlank() }?.let(::Post) ?: Unknown

        fun forStory(storyId: String?): OutboxNavigationSource =
            storyId?.takeIf { it.isNotBlank() }?.let(::Story) ?: Unknown
    }
}
