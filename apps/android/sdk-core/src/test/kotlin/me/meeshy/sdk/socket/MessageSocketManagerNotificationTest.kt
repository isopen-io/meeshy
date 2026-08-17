package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Covers only the `notification:new` wiring added for real-time in-app notifications
 * (feature-parity §M). [MessageSocketManager]'s other 26 events have no existing test
 * coverage — this file intentionally does not attempt to backfill them.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerNotificationTest {

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
        val manager = MessageSocketManager(socket, json)
        manager.attach()
        return manager to handlers
    }

    @Test
    fun `notification new payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationReceived.test {
            handlers.getValue("notification:new").invoke(
                arrayOf(
                    JSONObject(
                        """{"id":"n1","type":"new_message","state":{"isRead":false,"createdAt":"2026-08-17T00:00:00.000Z"},"title":"Alice","subtitle":"Bonjour","_seq":42}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.id).isEqualTo("n1")
            assertThat(event.type).isEqualTo("new_message")
            assertThat(event.state.isRead).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
