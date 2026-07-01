package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
import org.junit.Test

class CallViewModelTest {

    private val outgoingVideo = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true)
    private val incomingAudio = CallConfig(peerId = "u2", peerName = "Bob", isVideo = false, isOutgoing = false)

    private fun vm() = CallViewModel()

    @Test
    fun `starts idle`() {
        assertThat(vm().state.value.status).isEqualTo(CallStatus.IDLE)
    }

    @Test
    fun `starting an outgoing call rings and carries the peer`() {
        val vm = vm()
        vm.start(outgoingVideo)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.OUTGOING_RINGING)
        assertThat(s.peerName).isEqualTo("Alice")
        assertThat(s.isVideoCall).isTrue()
    }

    @Test
    fun `starting an incoming call alerts`() {
        val vm = vm()
        vm.start(incomingAudio)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
        assertThat(vm.state.value.showAnswerControls).isTrue()
    }

    @Test
    fun `start is inert once a call is in flight`() {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.start(incomingAudio)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.OUTGOING_RINGING)
        assertThat(vm.state.value.peerName).isEqualTo("Alice")
    }

    @Test
    fun `accepting an incoming call moves to connecting`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.accept()

        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)
    }

    @Test
    fun `declining an incoming call ends it as rejected`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.decline()

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Rejected)
    }

    @Test
    fun `hanging up ends the call locally`() {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.hangUp()

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Local)
    }

    @Test
    fun `outgoing call negotiates through to connected via signals`() {
        val vm = vm()
        vm.start(outgoingVideo)

        vm.onSignal(CallEvent.ParticipantJoined)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)

        vm.onSignal(CallEvent.RemoteAnswer)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)

        vm.onSignal(CallEvent.MediaConnected)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
    }

    @Test
    fun `a remote hang-up ends the call`() {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.onSignal(CallEvent.ParticipantJoined)
        vm.onSignal(CallEvent.RemoteAnswer)
        vm.onSignal(CallEvent.MediaConnected)
        vm.onSignal(CallEvent.RemoteHangUp)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Remote)
    }

    @Test
    fun `toggling mute flips the media intent`() {
        val vm = vm()
        vm.start(outgoingVideo)
        assertThat(vm.state.value.isMuted).isFalse()

        vm.toggleMute()
        assertThat(vm.state.value.isMuted).isTrue()

        vm.toggleMute()
        assertThat(vm.state.value.isMuted).isFalse()
    }

    @Test
    fun `a video call starts with the camera on and can be toggled off`() {
        val vm = vm()
        vm.start(outgoingVideo)
        assertThat(vm.state.value.isCameraOn).isTrue()

        vm.toggleCamera()
        assertThat(vm.state.value.isCameraOn).isFalse()
    }

    @Test
    fun `an audio call never reports the camera on even after a toggle`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.toggleCamera()

        assertThat(vm.state.value.isCameraOn).isFalse()
    }

    @Test
    fun `dismissing a terminated call settles back to idle`() {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.hangUp()
        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)

        vm.dismiss()
        assertThat(vm.state.value.status).isEqualTo(CallStatus.IDLE)
    }

    @Test
    fun `starting again after a settled call is allowed`() {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.hangUp()
        vm.dismiss()

        vm.start(incomingAudio)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
        assertThat(vm.state.value.peerName).isEqualTo("Bob")
    }
}
