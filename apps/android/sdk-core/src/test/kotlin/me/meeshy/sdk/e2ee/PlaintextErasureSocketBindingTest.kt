package me.meeshy.sdk.e2ee

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessageRemoved
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #14655 — un effacement annoncé pendant que le fil est FERMÉ (aucun `ChatRealtimeController` attaché) s'inscrit quand
 * même dans la file durable : suppression, vue unique ouverte par moi, conversation supprimée ou fermée. La ligne Room
 * reste intacte, le coffre se videra.
 */
@RunWith(RobolectricTestRunner::class)
class PlaintextErasureSocketBindingTest {

    /** La liaison écrit sur ses propres coroutines (Room a son exécuteur) : on attend l'écriture, en temps réel. */
    private suspend fun <T : Any> eventually(read: suspend () -> T?): T = withContext(Dispatchers.Default) {
        withTimeout(5_000) {
            var value = read()
            while (value == null) {
                delay(20)
                value = read()
            }
            value
        }
    }

    private fun sealed(id: String, author: String, cid: String? = null) = ApiMessage(
        id = id, conversationId = "c1", senderId = "p_$author", sender = ApiMessageSender(userId = author),
        content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", clientMessageId = cid,
        createdAt = "2026-11-01T09:00:00Z",
    )

    @Test
    fun `erasures announced with the thread closed are recorded for the session account`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "me", cid = "cid_1"))
        harness.seedSynced(sealed("m2", "alice"))
        harness.seedSynced(sealed("m3", "alice"))
        val events = MutableSharedFlow<ConversationSocketEvent>(extraBufferCapacity = 8)
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>(extraBufferCapacity = 8)
        val closed = MutableSharedFlow<ConversationClosedSocketEvent>(extraBufferCapacity = 8)
        val ledger = PlaintextErasureLedger(harness.database, harness.clock) { "me" }
        val binding = PlaintextErasureSocketBinding(events, deleted, closed, ledger, { "me" }, CoroutineScope(Dispatchers.Unconfined))

        binding.attach()
        events.emit(MessageRemoved("m1", "c1", "2026-11-01T10:00:00Z"))
        events.emit(MessageConsumedEvent("m2", "c1", userId = "carol", viewOnceCount = 1))
        events.emit(MessageConsumedEvent("m3", "c1", userId = "me", viewOnceCount = 2))
        events.emit(MessagePinChanged("m2", "c1", pinned = true))
        deleted.emit(ConversationDeletedSocketEvent("c7"))
        closed.emit(ConversationClosedSocketEvent("c8", closedBy = "alice"))

        val pending = eventually { ledger.pending("me", 100).takeIf { it.size == 4 } }
        binding.detach()
        assertThat(pending.flatMap { it.messageKeys("me") }).containsExactly("m1", "cid_1", "m3")
        assertThat(pending.mapNotNull { it.conversationId }).containsExactly("c7", "c8")
        assertThat(harness.database.messageDao().find("m1")).isNotNull()
    }
}
