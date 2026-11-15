package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FriendRequestSocketEventsManagerTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()

    private fun wired(): Pair<FriendRequestSocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return FriendRequestSocketEventsManager(router, json).also { it.attach() } to handlers
    }

    @Test
    fun `annulation et refus atteignent leurs flux typés`() = runTest {
        val (manager, handlers) = wired()
        manager.cancelled.test {
            handlers.getValue(SocketEventNames.FRIEND_REQUEST_CANCELLED).invoke(arrayOf(JSONObject("""{"friendRequestId":"r","cancelledBy":"u2"}""")))
            scheduler.advanceUntilIdle()
            assertThat(awaitItem().cancelledBy).isEqualTo("u2")
            cancelAndIgnoreRemainingEvents()
        }
        manager.rejected.test {
            handlers.getValue(SocketEventNames.FRIEND_REQUEST_REJECTED).invoke(arrayOf(JSONObject("""{"rejecterId":"u3"}""")))
            scheduler.advanceUntilIdle()
            assertThat(awaitItem().rejecterId).isEqualTo("u3")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
