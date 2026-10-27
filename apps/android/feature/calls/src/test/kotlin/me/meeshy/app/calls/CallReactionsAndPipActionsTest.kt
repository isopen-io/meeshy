package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

class CallReactionsAndPipActionsTest {
    private fun ui(connected: Boolean) = CallPresenter.present(
        if (connected) CallState.Connected else CallState.Ringing(true),
        CallConfig(peerId = "u", peerName = "Alice", isVideo = true, isOutgoing = true),
        CallMedia(),
    )

    @Test
    fun `Reagir est propose des que l'appel est etabli, jamais avant`() {
        val handler = CallReactionsActionHandler()
        assertThat(handler.present(ui(connected = true))?.labelRes).isEqualTo(R.string.call_control_react)
        assertThat(handler.present(ui(connected = false))).isNull()
    }

    @Test
    fun `l'action PiP suit le coordinateur et lui demande d'entrer`() {
        var entered = false
        val pip = CallPictureInPictureCoordinator().apply {
            attachActivity(supportsPip = true) { entered = true; true }
            onTransition(
                CallState.Idle, CallState.Connected,
                CallSessionInfo("c", CallConfig(peerId = "u", peerName = "A", isVideo = true, isOutgoing = true)),
            )
            setCallScreenShown(true)
        }
        val handler = CallPictureInPictureActionHandler(pip)

        assertThat(handler.present(ui(connected = true))?.labelRes).isEqualTo(R.string.call_control_pip)
        assertThat(handler.present(ui(connected = false))).isNull()
        handler.perform()
        assertThat(entered).isTrue()
    }
}
