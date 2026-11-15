package me.meeshy.sdk.socket

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import me.meeshy.sdk.cache.CacheClock
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Optional

@RunWith(RobolectricTestRunner::class)
class ConversationViewingReporterTest {

    private class MutableClock(var now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun socket(connected: Boolean = true): SocketManager =
        mockk<SocketManager>(relaxed = true).also { every { it.isConnected } returns connected }

    private fun reporter(
        socket: SocketManager,
        clock: MutableClock = MutableClock(),
        busy: Boolean? = null,
    ) = ConversationViewingReporter(
        socket,
        clock,
        busy?.let { value -> Optional.of(ViewingBusyProbe { value }) } ?: Optional.empty(),
    )

    private fun payload(id: String, focus: Boolean = false): (JSONObject) -> Boolean = {
        it.optString("conversationId") == id && it.optBoolean("focus", false) == focus
    }

    @Test
    fun `opening emits viewing start for that conversation`() {
        val socket = socket()
        reporter(socket).conversationOpened("c1")
        verify(exactly = 1) { socket.emit("viewing:start", match(payload("c1"))) }
    }

    @Test
    fun `backgrounding emits viewing stop and returning emits start again`() {
        val socket = socket()
        val reporter = reporter(socket)
        reporter.conversationOpened("c1")
        reporter.setForeground(false)
        reporter.setForeground(true)
        verifyOrder {
            socket.emit("viewing:start", match(payload("c1")))
            socket.emit("viewing:stop", match(payload("c1")))
            socket.emit("viewing:start", match(payload("c1")))
        }
    }

    @Test
    fun `a socket reconnection re-announces the displayed conversation`() {
        val socket = socket()
        val reporter = reporter(socket)
        reporter.conversationOpened("c1")
        reporter.onSocketConnected()
        verify(exactly = 2) { socket.emit("viewing:start", match(payload("c1"))) }
    }

    @Test
    fun `nothing is emitted while the socket is closed`() {
        val socket = socket(connected = false)
        val reporter = reporter(socket)
        reporter.conversationOpened("c1")
        verify(exactly = 0) { socket.emit(any(), any()) }
    }

    @Test
    fun `activity is throttled to one event every two seconds and carries focus under a cover`() {
        val socket = socket()
        val clock = MutableClock(10_000L)
        val reporter = reporter(socket, clock)
        reporter.conversationOpened("c1")
        reporter.activityOccurred("c1")
        clock.now = 11_000L
        reporter.activityOccurred("c1")
        verify(exactly = 1) { socket.emit("viewing:activity", match(payload("c1"))) }
        clock.now = 12_000L
        reporter.coverBegan()
        verify(exactly = 1) { socket.emit("viewing:activity", match(payload("c1", focus = true))) }
    }

    @Test
    fun `the heartbeat speaks only while something lasts`() {
        val socket = socket()
        val clock = MutableClock(0L)
        val reporter = reporter(socket, clock, busy = true)
        reporter.conversationOpened("c1")
        reporter.heartbeat()
        verify(exactly = 1) { socket.emit("viewing:activity", match(payload("c1"))) }

        val idleSocket = socket()
        val idle = reporter(idleSocket, MutableClock(0L), busy = false)
        idle.conversationOpened("c1")
        idle.heartbeat()
        verify(exactly = 0) { idleSocket.emit("viewing:activity", any()) }
    }

    @Test
    fun `announced follows the law and closing reports the last screen`() {
        val reporter = reporter(socket())
        assertNull(reporter.announced.value)
        reporter.conversationOpened("c1")
        assertEquals("c1", reporter.announced.value)
        reporter.screenDisappeared("c1")
        assertNull(reporter.announced.value)
        reporter.screenAppeared("c1")
        assertTrue(reporter.conversationClosed("c1"))
        assertNull(reporter.announced.value)
        assertFalse(reporter.isCovered)
    }
}
