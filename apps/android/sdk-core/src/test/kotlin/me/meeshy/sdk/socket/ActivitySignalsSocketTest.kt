package me.meeshy.sdk.socket

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ActivitySignalsSocketTest {

    private fun socket(connected: Boolean): SocketManager =
        mockk<SocketManager>(relaxed = true).also { every { it.isConnected } returns connected }

    @Test
    fun `nothing is emitted while the socket is not connected`() {
        val socket = socket(connected = false)
        val signals = ActivitySignalsSocket(socket)
        signals.emitTypingStart("c1")
        signals.emitTypingStop("c1")
        signals.emitViewingStart("c1")
        signals.emitViewingStop("c1")
        signals.emitViewingActivity("c1", focus = true)
        verify(exactly = 0) { socket.emit(any(), any<JSONObject>()) }
    }

    @Test
    fun `typing and viewing start and stop carry exactly the conversation id`() {
        val socket = socket(connected = true)
        val signals = ActivitySignalsSocket(socket)
        signals.emitTypingStart("c1")
        signals.emitTypingStop("c1")
        signals.emitViewingStart("c1")
        signals.emitViewingStop("c1")
        listOf("typing:start", "typing:stop", "viewing:start", "viewing:stop").forEach { event ->
            verify(exactly = 1) {
                socket.emit(event, match<JSONObject> { it.length() == 1 && it.getString("conversationId") == "c1" })
            }
        }
    }

    @Test
    fun `viewing activity writes focus only when true`() {
        val socket = socket(connected = true)
        val sent = mutableListOf<JSONObject>()
        every { socket.emit("viewing:activity", capture(sent)) } returns Unit
        val signals = ActivitySignalsSocket(socket)
        signals.emitViewingActivity("c1", focus = false)
        signals.emitViewingActivity("c1", focus = true)
        assertFalse(sent[0].has("focus"))
        assertEquals(true, sent[1].getBoolean("focus"))
        assertEquals("c1", sent[1].getString("conversationId"))
    }
}
