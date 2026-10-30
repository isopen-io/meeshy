package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.AttachmentReadyEvent
import me.meeshy.sdk.model.AttachmentStatusUpdatedEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageAttachmentUpdatedEvent
import me.meeshy.sdk.model.SharedTranslationArrived
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les quatre événements d'une pièce atteignent le flux du fil sous leur forme typée, dans l'ordre d'arrivée. */
@RunWith(RobolectricTestRunner::class)
class ConversationSocketEventsManagerMediaTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()

    private fun wired(): Pair<ConversationSocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return ConversationSocketEventsManager(socket, json, router).also { it.attach() } to handlers
    }

    private suspend fun app.cash.turbine.ReceiveTurbine<ConversationSocketEvent>.next(
        handlers: Map<String, (Array<Any>) -> Unit>,
        event: String,
        payload: String,
    ): ConversationSocketEvent {
        handlers.getValue(event).invoke(arrayOf(JSONObject(payload)))
        scheduler.advanceUntilIdle()
        return awaitItem()
    }

    @Test
    fun `attachment status updated is routed with the reporter and the position`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            val event = next(
                handlers, "attachment-status:updated",
                """{"attachmentId":"a1","messageId":"m1","conversationId":"c1","userId":"u2","action":"listened",
                   "updatedAt":"2026-10-29T10:00:00.000Z","playPositionMs":4000,"durationMs":10000,"complete":false}""",
            ) as AttachmentStatusUpdatedEvent
            assertThat(event.userId).isEqualTo("u2")
            assertThat(event.playPositionMs).isEqualTo(4_000)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `attachment ready is routed and concerns only the conversation of its message`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            val event = next(
                handlers, "attachment:ready",
                """{"attachmentId":"a1","target":"messageAttachment","messageId":"m1","conversationId":"c1",
                   "processingState":"ready","attachment":{"id":"a1","fileUrl":"https://cdn/a1"}}""",
            ) as AttachmentReadyEvent
            assertThat(event.concerns("c1")).isTrue()
            assertThat(event.concerns("c2")).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `message attachment updated is routed on the family stream`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            val event = next(
                handlers, "message:attachment-updated",
                """{"conversationId":"c1","messageId":"m1","attachmentId":"a1",
                   "attachment":{"id":"a1","transcription":{"text":"bonjour","language":"fr"}}}""",
            ) as MessageAttachmentUpdatedEvent
            assertThat(event.conversationId).isEqualTo("c1")
            assertThat(event.attachment?.transcription?.text).isEqualTo("bonjour")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `message translation shared is routed on the family stream, sealed as received`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            val event = next(
                handlers, "message:translation-shared",
                """{"id":"t1","conversationId":"c1","messageId":"m1","targetLanguage":"fr",
                   "envelope":{"v":1,"alg":"A256GCM","kdf":"message-content","payload":"AAAA"},
                   "sharedBy":"u2","sharedAt":"2026-10-29T10:00:00.000Z"}""",
            ) as SharedTranslationArrived
            assertThat(event.concerns("c1")).isTrue()
            assertThat(event.translation.messageId).isEqualTo("m1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `an unreadable shared translation or a future envelope kind raises nothing`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.getValue("message:translation-shared").invoke(arrayOf("pas un objet"))
            handlers.getValue("message:translation-shared").invoke(
                arrayOf(
                    JSONObject(
                        """{"id":"t1","conversationId":"c1","messageId":"m1","targetLanguage":"fr",
                           "envelope":{"v":1,"alg":"A256GCM","kdf":"futur","payload":"AAAA"},"sharedBy":"u","sharedAt":"x"}""",
                    ),
                ),
            )
            scheduler.advanceUntilIdle()
            expectNoEvents()
        }
    }
}
