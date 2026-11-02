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
class MessageSocketManagerDecorTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun managerWithHandlers(): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        return MessageSocketManager(socket, json, SyncSeqTracker()).also { it.attach() } to handlers
    }

    @Test
    fun `profile decor event is decoded per side and tolerates an unreadable one`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.profileDecorUpdated.test {
            handlers.getValue("profile:decor-updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"userId":"u1","decor":{"avatarRing":{"pack":"p","item":"i","origin":"builtin"},"banner":"garbage"}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.userId).isEqualTo("u1")
            assertThat(event.decor.avatarRing?.item).isEqualTo("i")
            assertThat(event.decor.banner).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
