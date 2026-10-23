package me.meeshy.sdk.chat

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageStarredEvent
import me.meeshy.sdk.model.StarredSnapshotFactory
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** Ce que la synchronisation lit en base : le message, sa conversation, le prisme du lecteur. */
interface StarredSource {
    suspend fun message(messageId: String): ApiMessage?
    suspend fun conversation(conversationId: String): ApiConversation?
    suspend fun readerPrism(): List<String>
}

/**
 * Applique au magasin des favoris ce que le temps réel dit des messages étoilés (miroir
 * d'iOS `StarredMessagesStore.follow`) : une étoile posée ailleurs compose son instantané
 * depuis la base, dans la langue du lecteur ; un retrait d'étoile, une suppression ou une
 * expiration la retirent ; une modification met l'aperçu à jour.
 */
class StarredMessagesSync(
    private val store: StarredMessagesStore,
    private val source: StarredSource,
    private val conversationName: (ApiConversation) -> String?,
    private val conversationAccent: (ApiConversation) -> String?,
    private val nowMillis: () -> Long,
) {
    suspend fun onStarred(event: MessageStarredEvent) {
        if (!event.starred) {
            store.unstar(event.messageId)
            return
        }
        if (store.starred.value.isStarred(event.messageId)) return
        val message = source.message(event.messageId) ?: return
        val conversation = source.conversation(event.conversationId)
        store.placeRemote(
            StarredSnapshotFactory.snapshot(
                message = message,
                conversationName = conversation?.let(conversationName),
                conversationAccentColor = conversation?.let(conversationAccent),
                preferredLanguages = source.readerPrism(),
                mediaStrings = null,
                nowMillis = isoToEpochMillisOrNull(event.starredAt) ?: nowMillis(),
            ),
        )
    }

    fun onGone(messageId: String) = store.unstar(messageId)

    suspend fun onEdited(message: ApiMessage) {
        if (!store.starred.value.isStarred(message.id)) return
        store.updatePreview(
            message.id,
            StarredSnapshotFactory.preview(message, source.readerPrism(), mediaStrings = null),
        )
    }

    fun reset() = store.clearAll()
}
