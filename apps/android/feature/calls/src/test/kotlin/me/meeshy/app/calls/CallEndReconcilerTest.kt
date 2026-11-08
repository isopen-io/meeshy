package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

class CallEndReconcilerTest {

    private fun signals(connected: Boolean): CallSignalManager =
        mockk(relaxed = true) { every { isSocketConnected } returns connected }

    @Test
    fun `a hang-up without network is deferred then emitted once on reconnect`() {
        var connected = false
        val s = mockk<CallSignalManager>(relaxed = true) { every { isSocketConnected } answers { connected } }
        val reconciler = CallEndReconciler(s)

        reconciler.end("c1")
        verify(exactly = 0) { s.emitEndAcked(any(), any(), any()) }
        verify(exactly = 1) { s.emitEnd("c1", null) }
        assertThat(reconciler.pending.map { it.callId }).containsExactly("c1")

        connected = true
        reconciler.onSocketConnected()
        reconciler.onSocketConnected()

        verify(exactly = 1) { s.emitEndAcked("c1", null, any()) }
        assertThat(reconciler.pending).isEmpty()
    }

    @Test
    fun `a deferred decline keeps its reason on replay`() {
        var connected = false
        val s = mockk<CallSignalManager>(relaxed = true) { every { isSocketConnected } answers { connected } }
        val reconciler = CallEndReconciler(s)
        reconciler.end("c1", "rejected")

        connected = true
        reconciler.onSocketConnected()

        verify(exactly = 1) { s.emitEndAcked("c1", "rejected", any()) }
    }

    @Test
    fun `an unacked end is re-emitted and armed for the next reconnect`() {
        val s = signals(connected = true)
        val ack = slot<(Boolean) -> Unit>()
        every { s.emitEndAcked(any(), any(), capture(ack)) } returns Unit
        val reconciler = CallEndReconciler(s)

        reconciler.end("c1")
        ack.captured(false)

        verify { s.emitEnd("c1", null) }
        assertThat(reconciler.pending.map { it.callId }).containsExactly("c1")
    }

    @Test
    fun `an acked end leaves nothing pending`() {
        val s = signals(connected = true)
        val ack = slot<(Boolean) -> Unit>()
        every { s.emitEndAcked(any(), any(), capture(ack)) } returns Unit
        val reconciler = CallEndReconciler(s)

        reconciler.end("c1")
        ack.captured(true)

        assertThat(reconciler.pending).isEmpty()
        verify(exactly = 0) { s.emitEnd(any(), any()) }
    }

    @Test
    fun `a blank call id emits nothing`() {
        val s = signals(connected = true)

        CallEndReconciler(s).end(" ")

        verify(exactly = 0) { s.emitEndAcked(any(), any(), any()) }
    }
}
