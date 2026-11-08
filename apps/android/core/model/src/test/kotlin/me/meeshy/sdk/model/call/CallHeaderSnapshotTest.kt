package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallHeaderSnapshotTest {

    private fun session(id: String = "call-1") =
        ActiveCallSession(id = id, conversationId = "conv-1", mode = "p2p", status = "active")

    private fun active(conversationId: String? = "conv-1") = CallHeaderSnapshot(isActive = true, conversationId = conversationId)

    private fun resolve(
        snapshot: CallHeaderSnapshot = CallHeaderSnapshot.IDLE,
        reconciled: ActiveCallSession? = null,
        canStart: Boolean = true,
        conversationId: String = "conv-1",
    ) = CallHeaderPresentation.resolve(snapshot, reconciled, canStart, conversationId)

    @Test
    fun `a local call hosted by this conversation shows the return pill`() {
        assertThat(resolve(snapshot = active("conv-1"))).isEqualTo(CallHeaderPresentation.ReturnToCall)
    }

    @Test
    fun `a local call hosted elsewhere shows nothing, never a second call`() {
        assertThat(resolve(snapshot = active("conv-2"))).isEqualTo(CallHeaderPresentation.None)
    }

    @Test
    fun `a local call without a known conversation degrades to the pill`() {
        assertThat(resolve(snapshot = active(null))).isEqualTo(CallHeaderPresentation.ReturnToCall)
    }

    @Test
    fun `a local call wins over a reconciled server call`() {
        assertThat(resolve(snapshot = active(), reconciled = session())).isEqualTo(CallHeaderPresentation.ReturnToCall)
    }

    @Test
    fun `a call live server-side shows rejoin`() {
        assertThat(resolve(reconciled = session())).isEqualTo(CallHeaderPresentation.Rejoin(session()))
    }

    @Test
    fun `canStart false and a live call shows rejoin alone`() {
        assertThat(resolve(reconciled = session(), canStart = false)).isEqualTo(CallHeaderPresentation.Rejoin(session()))
    }

    @Test
    fun `canStart false without a live call shows nothing`() {
        assertThat(resolve(canStart = false)).isEqualTo(CallHeaderPresentation.None)
    }

    @Test
    fun `idle with the right to start shows the start menu`() {
        assertThat(resolve()).isEqualTo(CallHeaderPresentation.Start)
    }

    @Test
    fun `the server is only probed when no local call is live`() {
        assertThat(CallHeaderPresentation.shouldReconcile(CallHeaderSnapshot.IDLE)).isTrue()
        assertThat(CallHeaderPresentation.shouldReconcile(active())).isFalse()
    }
}
