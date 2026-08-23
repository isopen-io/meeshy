package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The channel NAME is the one thing a decode test can never prove.
 *
 * [MessageSocketManagerNotificationTest] injects its frame by looking the handler
 * up under the name the manager registered — so it is green whatever that name
 * is. Every unit test of an inbound event shares that blind spot, which is how
 * two channels stayed wrong for the lifetime of the Android client:
 *
 * | subscribed as         | the gateway emits          | consequence                    |
 * |-----------------------|----------------------------|--------------------------------|
 * | `message:updated`     | `message:edited`           | an edit never lands live       |
 * | `transcription:ready` | `audio:transcription-ready`| a transcript never lands live  |
 *
 * Neither name exists anywhere else in the repository — not in the shared
 * contract, not in the gateway, not in the iOS or web clients. Subscribing to a
 * name nobody speaks raises nothing: Socket.IO simply never calls back. The
 * flows, the `ChatViewModel` collectors and the repository merges downstream
 * were correct the whole time, which is exactly what made the defect invisible.
 *
 * These tests bind each flow to the name the GATEWAY emits, taken from
 * `SERVER_EVENTS` in `packages/shared/types/socketio-events.ts`. The general
 * rule — no native client may ever name a channel outside that contract — is
 * held repo-wide by `packages/shared/__tests__/ci/socket-event-name-gate.test.ts`,
 * which runs on every PR.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerChannelNamesTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun managerWithHandlers(): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = MessageSocketManager(socket, json, SyncSeqTracker())
        manager.attach()
        return manager to handlers
    }

    @Test
    fun `an edited message arrives on the channel the gateway emits`() = runTest {
        val (manager, handlers) = managerWithHandlers()

        assertThat(handlers.keys).contains("message:edited")
        assertThat(handlers.keys).doesNotContain("message:updated")

        manager.messageEdited.test {
            handlers.getValue("message:edited").invoke(
                arrayOf(
                    JSONObject(
                        """{"id":"m1","conversationId":"c1","senderId":"u1","content":"texte corrigé","isEdited":true}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.id).isEqualTo("m1")
            assertThat(event.conversationId).isEqualTo("c1")
            assertThat(event.content).isEqualTo("texte corrigé")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a ready transcript arrives on the channel the gateway emits, nested payload and all`() = runTest {
        val (manager, handlers) = managerWithHandlers()

        assertThat(handlers.keys).contains("audio:transcription-ready")
        assertThat(handlers.keys).doesNotContain("transcription:ready")

        manager.transcriptionReady.test {
            handlers.getValue("audio:transcription-ready").invoke(
                arrayOf(
                    JSONObject(
                        """{"messageId":"m1","attachmentId":"a1","conversationId":"c1","transcription":{"id":"t1","text":"bonjour","language":"fr","confidence":0.9,"durationMs":3100},"processingTimeMs":700}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.messageId).isEqualTo("m1")
            assertThat(event.attachmentId).isEqualTo("a1")
            assertThat(event.transcription.text).isEqualTo("bonjour")
            assertThat(event.transcription.language).isEqualTo("fr")
            assertThat(event.transcription.durationMs).isEqualTo(3100L)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
