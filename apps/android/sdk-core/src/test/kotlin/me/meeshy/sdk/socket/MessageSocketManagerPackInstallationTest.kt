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
class MessageSocketManagerPackInstallationTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `pack installation event is routed with the shape the gateway emits`() = runTest {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val manager = MessageSocketManager(socket, json, SyncSeqTracker()).also { it.attach() }

        manager.packInstallationUpdated.test {
            handlers.getValue("pack:installation-updated").invoke(
                arrayOf(JSONObject("""{"domain":"avatar-ring","slug":"prestige","installed":true,"owned":true,"at":"2026-10-29T10:00:00.000Z"}""")),
            )
            val event = awaitItem()
            assertThat(event.slug).isEqualTo("prestige")
            assertThat(event.installed).isTrue()
            assertThat(event.owned).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }
}

@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerGameUpdatedTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `game updated is routed with the shape the gateway emits and a bad block does not drop it`() = runTest {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val manager = MessageSocketManager(socket, json, SyncSeqTracker()).also { it.attach() }

        manager.gameUpdated.test {
            handlers.getValue("game:updated").invoke(
                arrayOf(JSONObject("""{"gameRevision":1761700000000,"reason":"spend","game":{"treasury":"oops"}}""")),
            )
            val event = awaitItem()
            assertThat(event.gameRevision).isEqualTo(1_761_700_000_000)
            assertThat(event.reason).isEqualTo("spend")
            assertThat(event.balance).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
