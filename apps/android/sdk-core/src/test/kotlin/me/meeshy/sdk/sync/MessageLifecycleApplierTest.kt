package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiPostReplyTarget
import me.meeshy.sdk.model.AttachmentStatusUpdatedEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageCitedPostWithdrawnEvent
import me.meeshy.sdk.model.PendingMessagesDeliveredEvent
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class MessageLifecycleApplierTest {

    private class InlineRegistrar : RelayRegistrar {
        private val routes = mutableListOf<Pair<SharedFlow<*>, suspend (Any?) -> Unit>>()

        @Suppress("UNCHECKED_CAST")
        override fun <T> relay(flow: SharedFlow<T>, family: OrderedEventLane.Family, apply: suspend (T) -> Unit) {
            check(family == OrderedEventLane.Family.MESSAGES)
            routes += flow to (apply as suspend (Any?) -> Unit)
        }

        suspend fun <T> deliver(flow: SharedFlow<T>, value: T) {
            routes.filter { it.first === flow }.forEach { it.second(value) }
        }
    }

    private fun cited(id: String, postId: String) = ApiMessage(
        id = id, conversationId = "c1", senderId = "author", content = "salut", createdAt = "2026-10-24T09:00:00Z",
        postReplyTo = ApiPostReplyTarget(id = postId, previewText = "ma story"),
    )

    @Test
    fun `une story citee retiree marque chaque citation en Room, rejouee sans effet de plus, fil ferme`() = runHarnessTest { harness ->
        harness.seedSynced(cited("m1", "p1"))
        harness.seedSynced(cited("m2", "p1"))
        harness.seedSynced(cited("m3", "p2"))
        val events = MutableSharedFlow<ConversationSocketEvent>()
        val real = MessageDeltaApplier(harness.database, harness.updater, harness.clock)
        val registrar = InlineRegistrar()
        MessageLifecycleApplier(
            events, real::apply, { "me" }, isSealed = { false }, isOpen = { false },
            refresher = PendingDeliveredRefresher(kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)) { },
        ).subscribe(registrar)

        val withdrawn = MessageCitedPostWithdrawnEvent("c1", "p1", deletedAt = "2026-10-24T10:00:00Z")
        registrar.deliver(events, withdrawn)
        val once = harness.database.messageDao().find("m1")!!.payload
        registrar.deliver(events, withdrawn)

        assertThat(harness.cachedMessage("m1").postReplyTo).isEqualTo(ApiPostReplyTarget(id = "p1", unavailable = true))
        assertThat(harness.cachedMessage("m2").postReplyTo?.unavailable).isTrue()
        assertThat(harness.cachedMessage("m3").postReplyTo?.previewText).isEqualTo("ma story")
        assertThat(harness.database.messageDao().find("m1")!!.payload).isEqualTo(once)
    }

    @Test
    fun `l'etat d'une piece ne s'ecrit pas dans une conversation chiffree de bout en bout`() = kotlinx.coroutines.test.runTest {
        val applied = mutableListOf<ConversationSocketEvent>()
        val events = MutableSharedFlow<ConversationSocketEvent>()
        val registrar = InlineRegistrar()
        MessageLifecycleApplier(
            events, { event, _ -> applied += event; true }, { "me" }, isSealed = { it == "sealed" }, isOpen = { false },
            refresher = PendingDeliveredRefresher(backgroundScope) { },
        ).subscribe(registrar)

        registrar.deliver(events, AttachmentStatusUpdatedEvent("a1", "m1", "sealed", action = "listened"))
        registrar.deliver(events, AttachmentStatusUpdatedEvent("a1", "m1", "plain", action = "listened"))

        assertThat(applied.map { (it as AttachmentStatusUpdatedEvent).conversationId }).containsExactly("plain")
    }

    @Test
    fun `une file rejouee relit chaque fil touche une seule fois, hors conversation ouverte`() = runTest {
        val refreshed = mutableListOf<String>()
        val events = MutableSharedFlow<ConversationSocketEvent>()
        val registrar = InlineRegistrar()
        MessageLifecycleApplier(
            events, { _, _ -> false }, { "me" }, isSealed = { false }, isOpen = { it == "open" },
            refresher = PendingDeliveredRefresher(backgroundScope, windowMs = 300) { refreshed += it },
        ).subscribe(registrar)

        registrar.deliver(events, PendingMessagesDeliveredEvent(2, listOf("c1", "open", "c2")))
        registrar.deliver(events, PendingMessagesDeliveredEvent(1, listOf("c1")))
        advanceTimeBy(299)
        runCurrent()
        assertThat(refreshed).isEmpty()
        advanceTimeBy(10_000)
        runCurrent()

        assertThat(refreshed).containsExactly("c1", "c2").inOrder()
    }

    @Test
    fun `une relecture en echec n'arrete pas les autres fils`() = runTest {
        val refreshed = mutableListOf<String>()
        val refresher = PendingDeliveredRefresher(backgroundScope, windowMs = 10) {
            if (it == "bad") error("réseau")
            refreshed += it
        }

        refresher.request(listOf("bad", "good"))
        advanceTimeBy(10_000)
        runCurrent()

        assertThat(refreshed).containsExactly("good")
    }

    @Test
    fun `une demande tardive repart apres le vidage`() = runTest {
        val refreshed = mutableListOf<String>()
        val refresher = PendingDeliveredRefresher(backgroundScope, windowMs = 10) { refreshed += it }

        refresher.request(listOf("c1"))
        advanceTimeBy(10_000)
        runCurrent()
        refresher.request(listOf("c1"))
        advanceTimeBy(10_000)
        runCurrent()

        assertThat(refreshed).containsExactly("c1", "c1").inOrder()
    }
}
