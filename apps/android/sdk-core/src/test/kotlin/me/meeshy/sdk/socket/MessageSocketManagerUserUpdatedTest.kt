package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerUserUpdatedTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun handlers(): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val map = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { map[firstArg()] = secondArg() }
        val manager = MessageSocketManager(socket, json, SyncSeqTracker())
        manager.attach()
        return manager to map
    }

    @Test
    fun `user updated frame is delivered on the flow`() = runTest {
        val (manager, map) = handlers()
        manager.userUpdated.test {
            map.getValue("user:updated").invoke(arrayOf(JSONObject("""{"userId":"u1","changes":{"avatar":null}}""")))
            val event = awaitItem()
            assertThat(event.userId).isEqualTo("u1")
            assertThat(event.avatar).isEqualTo(OptionalMediaChange.Replaced(null))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `frame without userId is ignored`() = runTest {
        val (manager, map) = handlers()
        manager.userUpdated.test {
            map.getValue("user:updated").invoke(arrayOf(JSONObject("""{"changes":{"username":"x"}}""")))
            map.getValue("user:updated").invoke(arrayOf(JSONObject("""{"userId":"u2","changes":{}}""")))
            assertThat(awaitItem().userId).isEqualTo("u2")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
