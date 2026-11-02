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

@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerMembershipTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun managerWithHandlers(): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val manager = MessageSocketManager(socket, json, SyncSeqTracker())
        manager.attach()
        return manager to handlers
    }

    @Test
    fun `une adhesion arrive sur le canal que la passerelle emet`() = runTest {
        val (manager, handlers) = managerWithHandlers()

        assertThat(handlers.keys).contains("conversation:participant-joined")
        manager.participantJoined.test {
            handlers.getValue("conversation:participant-joined").invoke(
                arrayOf(JSONObject("""{"conversationId":"c1","userId":"u1","displayName":"Ana","memberCount":4}""")),
            )
            val event = awaitItem()
            assertThat(event.conversationId).isEqualTo("c1")
            assertThat(event.memberCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une levee de bannissement arrive sur son canal sans bloquer l'emetteur`() = runTest {
        val (manager, handlers) = managerWithHandlers()

        assertThat(handlers.keys).contains("conversation:participant-unbanned")
        manager.participantUnbanned.test {
            repeat(40) {
                handlers.getValue("conversation:participant-unbanned").invoke(
                    arrayOf(JSONObject("""{"conversationId":"c1","participantId":"p$it"}""")),
                )
            }
            assertThat(awaitItem().conversationId).isEqualTo("c1")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
