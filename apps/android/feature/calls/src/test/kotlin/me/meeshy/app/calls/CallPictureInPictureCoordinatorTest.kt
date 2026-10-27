package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

class CallPictureInPictureCoordinatorTest {
    private val video = CallSessionInfo("call-1", CallConfig(peerId = "u", peerName = "Alice", isVideo = true, isOutgoing = true))
    private val audio = CallSessionInfo("call-1", CallConfig(peerId = "u", peerName = "Alice", isVideo = false, isOutgoing = true))
    private var entered = 0

    private fun coordinator(supports: Boolean = true) = CallPictureInPictureCoordinator().apply {
        attachActivity(supportsPip = supports) { entered++; true }
    }

    private fun CallPictureInPictureCoordinator.connected(info: CallSessionInfo = video) {
        onTransition(CallState.Idle, CallState.Connected, info)
    }

    private fun uiState(video: Boolean, connected: Boolean) = CallPresenter.present(
        if (connected) CallState.Connected else CallState.Ringing(true),
        CallConfig(peerId = "u", peerName = "Alice", isVideo = video, isOutgoing = true),
        CallMedia(),
    )

    @Test
    fun `quitter l'application pendant un appel video etabli entre en fenetre`() {
        val pip = coordinator().apply { connected(); setCallScreenShown(true) }

        assertThat(pip.onUserLeaveHint()).isTrue()
        assertThat(entered).isEqualTo(1)
    }

    @Test
    fun `un appel audio, un appel qui sonne ou un ecran reduit en pastille n'entrent pas`() {
        val audioCall = coordinator().apply { connected(audio); setCallScreenShown(true) }
        assertThat(audioCall.onUserLeaveHint()).isFalse()

        val ringing = coordinator().apply {
            onTransition(CallState.Idle, CallState.Ringing(true), video)
            setCallScreenShown(true)
        }
        assertThat(ringing.onUserLeaveHint()).isFalse()

        val minimised = coordinator().apply { connected(); setCallScreenShown(false) }
        assertThat(minimised.onUserLeaveHint()).isFalse()
        assertThat(entered).isEqualTo(0)
    }

    @Test
    fun `sans activite inscrite ou sur un appareil sans PiP rien ne se passe`() {
        val unsupported = coordinator(supports = false).apply { connected(); setCallScreenShown(true) }
        assertThat(unsupported.requestEnter()).isFalse()

        val detached = coordinator().apply { connected(); setCallScreenShown(true); detachActivity() }
        assertThat(detached.requestEnter()).isFalse()
    }

    @Test
    fun `l'action n'est proposee qu'a un appel video etabli sur un appareil compatible`() {
        val pip = coordinator()
        assertThat(pip.offersAction(uiState(video = true, connected = true))).isTrue()
        assertThat(pip.offersAction(uiState(video = false, connected = true))).isFalse()
        assertThat(pip.offersAction(uiState(video = true, connected = false))).isFalse()
        assertThat(coordinator(supports = false).offersAction(uiState(video = true, connected = true))).isFalse()
    }

    @Test
    fun `la fin de l'appel sort de la fenetre`() {
        val pip = coordinator().apply { connected(); setInPip(true) }
        assertThat(pip.inPip.value).isTrue()

        pip.onTransition(CallState.Connected, CallState.Idle, video)

        assertThat(pip.inPip.value).isFalse()
    }
}
