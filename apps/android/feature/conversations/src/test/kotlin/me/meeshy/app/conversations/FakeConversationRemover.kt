package me.meeshy.app.conversations

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.conversation.ConversationRemoval
import me.meeshy.sdk.conversation.ConversationRemovalRefusal
import me.meeshy.sdk.conversation.ConversationRemovalWrite
import me.meeshy.sdk.conversation.ConversationRemoving

/** Un retrait optimiste de test : note chaque geste reçu, rend l'issue réglée, et laisse émettre un refus de la passerelle. */
internal class FakeConversationRemover(
    var write: ConversationRemovalWrite = ConversationRemovalWrite.Queued,
) : ConversationRemoving {

    val calls = mutableListOf<Pair<String, ConversationRemoval>>()
    private val refused = MutableSharedFlow<ConversationRemovalRefusal>(extraBufferCapacity = 8)

    override val refusals: Flow<ConversationRemovalRefusal> get() = refused

    override suspend fun remove(conversationId: String, removal: ConversationRemoval): ConversationRemovalWrite {
        calls += conversationId to removal
        return write
    }

    fun refuse(conversationId: String, removal: ConversationRemoval) {
        refused.tryEmit(ConversationRemovalRefusal(conversationId, removal))
    }
}
