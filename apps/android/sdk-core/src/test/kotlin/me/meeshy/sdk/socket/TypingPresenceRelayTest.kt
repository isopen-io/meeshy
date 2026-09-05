package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * [TypingPresenceRelay] is the socket-layer half of « typing:start reçu = preuve d'activité » —
 * the forcing rule itself is [me.meeshy.sdk.model.TypingPresenceFold], unit-tested on its own.
 * These tests only lock the adaptation: a `typing:start` frame in becomes one forced-online
 * [me.meeshy.sdk.model.UserStatusEvent] out, stamped at the injected [CacheClock].
 */
@RunWith(RobolectricTestRunner::class)
class TypingPresenceRelayTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private class FixedClock(private val nowMillis: Long) : CacheClock {
        override fun nowMillis(): Long = nowMillis
    }

    private fun relayWithHandlers(nowMillis: Long): Pair<TypingPresenceRelay, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = MessageSocketManager(socket, json, SyncSeqTracker())
        manager.attach()
        return TypingPresenceRelay(manager, FixedClock(nowMillis)) to handlers
    }

    @Test
    fun `a typing-start frame becomes a forced-online presence event`() = runTest {
        val now = 1_700_000_000_000L
        val (relay, handlers) = relayWithHandlers(now)

        relay.forcedOnline.test {
            handlers.getValue("typing:start").invoke(
                arrayOf(JSONObject("""{"conversationId":"c1","userId":"u1","username":"alice"}""")),
            )
            val event = awaitItem()
            assertThat(event.userId).isEqualTo("u1")
            assertThat(event.isOnline).isTrue()
            assertThat(event.lastActiveAt).isEqualTo(java.time.Instant.ofEpochMilli(now).toString())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `each typer produces its own forced-online event`() = runTest {
        val (relay, handlers) = relayWithHandlers(1_700_000_000_000L)

        relay.forcedOnline.test {
            handlers.getValue("typing:start").invoke(
                arrayOf(JSONObject("""{"conversationId":"c1","userId":"u1"}""")),
            )
            handlers.getValue("typing:start").invoke(
                arrayOf(JSONObject("""{"conversationId":"c1","userId":"u2"}""")),
            )
            assertThat(awaitItem().userId).isEqualTo("u1")
            assertThat(awaitItem().userId).isEqualTo("u2")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
