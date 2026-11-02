package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallActivityLawTest {

    private val wording = CallActivityLaw.Wording(
        ringing = "Ringing", connecting = "Connecting", audioCall = "Audio call", videoCall = "Video call",
        onHold = "On hold", reconnecting = "Reconnecting", ended = "Call ended",
    )

    private fun input(
        phase: OngoingCallPhase,
        isVideo: Boolean = false,
        isMuted: Boolean = false,
        isOnHold: Boolean = false,
        systemShowsCall: Boolean = false,
    ) = CallActivityLaw.Input(
        phase = phase, title = "Alice Martin", isVideo = isVideo, isMuted = isMuted, isOnHold = isOnHold,
        connectedSinceEpochMs = 1_000L, systemShowsCall = systemShowsCall,
    )

    @Test
    fun `an incoming call that rings opens nothing`() {
        val step = CallActivityLaw.step(null, input(OngoingCallPhase.RingingIncoming), wording)

        assertThat(step.action).isEqualTo(CallActivityLaw.Action.None)
        assertThat(step.running).isNull()
    }

    @Test
    fun `an outgoing call opens at emission with the ringing status`() {
        val step = CallActivityLaw.step(null, input(OngoingCallPhase.RingingOutgoing), wording)

        val start = step.action as CallActivityLaw.Action.Start
        assertThat(start.snapshot.phase).isEqualTo(CallActivityPhase.Ringing)
        assertThat(start.snapshot.statusLabel).isEqualTo("Ringing")
        assertThat(start.snapshot.initials).isEqualTo("AM")
    }

    @Test
    fun `connected status names the media kind and on hold wins`() {
        assertThat(CallActivityLaw.snapshot(input(OngoingCallPhase.Connected, isVideo = true), wording)!!.statusLabel)
            .isEqualTo("Video call")
        assertThat(CallActivityLaw.snapshot(input(OngoingCallPhase.Connected), wording)!!.statusLabel)
            .isEqualTo("Audio call")
        assertThat(CallActivityLaw.snapshot(input(OngoingCallPhase.Connected, isOnHold = true), wording)!!.statusLabel)
            .isEqualTo("On hold")
    }

    @Test
    fun `an unchanged snapshot does nothing and a changed one updates`() {
        val first = CallActivityLaw.step(null, input(OngoingCallPhase.Connected), wording)

        val same = CallActivityLaw.step(first.running, input(OngoingCallPhase.Connected), wording)
        val muted = CallActivityLaw.step(first.running, input(OngoingCallPhase.Connected, isMuted = true), wording)

        assertThat(same.action).isEqualTo(CallActivityLaw.Action.None)
        assertThat((muted.action as CallActivityLaw.Action.Update).snapshot.isMuted).isTrue()
    }

    @Test
    fun `the end is a final state carrying the ended wording and no caption`() {
        val running = CallActivityLaw.step(null, input(OngoingCallPhase.Connected), wording).running

        val step = CallActivityLaw.step(running, input(OngoingCallPhase.Ended), wording)

        val end = step.action as CallActivityLaw.Action.End
        assertThat(end.snapshot.phase).isEqualTo(CallActivityPhase.Ended)
        assertThat(end.snapshot.statusLabel).isEqualTo("Call ended")
        assertThat(end.snapshot.caption).isNull()
        assertThat(step.running).isNull()
    }

    @Test
    fun `the duration is left out of the compact when the system already shows the call`() {
        assertThat(CallActivityLaw.snapshot(input(OngoingCallPhase.Connected, systemShowsCall = true), wording)!!.showsDurationInCompact)
            .isFalse()
        assertThat(CallActivityLaw.snapshot(input(OngoingCallPhase.Connected), wording)!!.showsDurationInCompact)
            .isTrue()
    }

    @Test
    fun `initials follow the name`() {
        assertThat(CallActivityLaw.initials("alice")).isEqualTo("A")
        assertThat(CallActivityLaw.initials("  jean   pierre dupont ")).isEqualTo("JP")
        assertThat(CallActivityLaw.initials("")).isEmpty()
    }
}
