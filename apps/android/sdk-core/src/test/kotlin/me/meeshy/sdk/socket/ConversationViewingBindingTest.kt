package me.meeshy.sdk.socket

import app.cash.turbine.test
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.presence.ConversationHere
import me.meeshy.sdk.model.presence.ConversationViewers
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ConversationViewingBindingTest {

    private class Harness(scheduler: kotlinx.coroutines.test.TestCoroutineScheduler) {
        val callbacks = mutableMapOf<String, (Array<Any>) -> Unit>()
        val connected = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val foreground = MutableStateFlow<Boolean?>(null)
        val reporter: ConversationViewingReporter = mockk(relaxed = true)
        val announced = MutableStateFlow<String?>(null)
        val socket: SocketManager = mockk(relaxed = true)
        val appState: AppStatePresenceReporter = mockk(relaxed = true)
        val binding: ConversationViewingBinding

        init {
            every { socket.connected } returns connected
            every { socket.isConnected } returns false
            every { reporter.announced } returns announced
            every { appState.foreground } returns foreground
            every { socket.on(any(), any()) } answers { callbacks[firstArg()] = secondArg() }
            binding = ConversationViewingBinding(
                socket, reporter, appState, Json { ignoreUnknownKeys = true }, StandardTestDispatcher(scheduler),
            )
        }

        fun receive(event: String, json: String) = callbacks.getValue(event)(arrayOf(JSONObject(json)))
    }

    @Test
    fun `peers announced by start and snapshot feed the here roster`() = runTest {
        val h = Harness(testScheduler)
        h.binding.attach()
        h.receive("viewing:start", """{"userId":"u1","conversationId":"c1"}""")
        h.receive("viewing:snapshot", """{"conversationId":"c2","userIds":["u2","u3"]}""")
        val viewers = h.binding.viewers.value
        assertEquals(ConversationHere.HERE, viewers.here("u1", "c1"))
        assertEquals(setOf("u2", "u3"), viewers.usersIn("c2"))
        h.receive("viewing:stop", """{"userId":"u1","conversationId":"c1"}""")
        assertEquals(ConversationHere.ABSENT, h.binding.viewers.value.here("u1", "c1"))
    }

    @Test
    fun `an activity pulses the peer then rests after the hold`() = runTest {
        val h = Harness(testScheduler)
        h.binding.attach()
        h.receive("viewing:start", """{"userId":"u1","conversationId":"c1"}""")
        h.binding.viewers.test {
            skipItems(1)
            h.receive("viewing:activity", """{"userId":"u1","conversationId":"c1","focus":true}""")
            assertEquals(ConversationHere.FOCUSED, awaitItem().here("u1", "c1"))
            testScheduler.advanceTimeBy(ConversationViewingBinding.ACTIVITY_HOLD_MS + 1)
            testScheduler.runCurrent()
            assertEquals(ConversationHere.HERE, awaitItem().here("u1", "c1"))
        }
    }

    @Test
    fun `a malformed payload is ignored`() = runTest {
        val h = Harness(testScheduler)
        h.binding.attach()
        h.receive("viewing:start", """{"nope":1}""")
        assertEquals(ConversationViewers(), h.binding.viewers.value)
    }

    @Test
    fun `a new socket session forgets the peers and re-announces the conversation`() = runTest {
        val h = Harness(testScheduler)
        h.binding.attach()
        runCurrent()
        h.receive("viewing:start", """{"userId":"u1","conversationId":"c1"}""")
        h.connected.tryEmit(Unit)
        runCurrent()
        assertEquals(ConversationViewers(), h.binding.viewers.value)
        verify { h.reporter.onSocketConnected() }
    }

    @Test
    fun `the process foreground is relayed to the reporter`() = runTest {
        val h = Harness(testScheduler)
        h.binding.attach()
        runCurrent()
        h.foreground.value = false
        runCurrent()
        verify { h.reporter.setForeground(false) }
    }

    @Test
    fun `the heartbeat ticks every two seconds while a conversation is announced`() = runTest {
        val h = Harness(testScheduler)
        h.binding.attach()
        h.announced.value = "c1"
        runCurrent()
        testScheduler.advanceTimeBy(4_100)
        testScheduler.runCurrent()
        verify(exactly = 2) { h.reporter.heartbeat() }
        h.announced.value = null
        runCurrent()
        testScheduler.advanceTimeBy(10_000)
        testScheduler.runCurrent()
        verify(exactly = 2) { h.reporter.heartbeat() }
    }

    @Test
    fun `detaching clears the peers and silences later events`() = runTest {
        val h = Harness(testScheduler)
        h.binding.attach()
        h.receive("viewing:start", """{"userId":"u1","conversationId":"c1"}""")
        h.binding.detach()
        assertEquals(ConversationViewers(), h.binding.viewers.value)
        h.receive("viewing:start", """{"userId":"u1","conversationId":"c1"}""")
        assertEquals(ConversationViewers(), h.binding.viewers.value)
    }
}
