package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallStatusLabelLawTest {

    @Test
    fun `a ringing call at 5 seconds still says the call is being placed`() {
        assertThat(CallStatusLabelLaw.outgoing(secondsRinging = 5)).isEqualTo(OutgoingRingingLabel.Placing)
    }

    @Test
    fun `at 6 seconds the line becomes the calmer wait for the peer`() {
        assertThat(CallStatusLabelLaw.outgoing(secondsRinging = 6)).isEqualTo(OutgoingRingingLabel.WaitingForPeer)
        assertThat(CallStatusLabelLaw.outgoing(secondsRinging = 45)).isEqualTo(OutgoingRingingLabel.WaitingForPeer)
    }

    @Test
    fun `a negative clock never reads as slow`() {
        assertThat(CallStatusLabelLaw.outgoing(secondsRinging = -3)).isEqualTo(OutgoingRingingLabel.Placing)
    }

    @Test
    fun `the hint under the line appears only with the wait for the peer`() {
        assertThat(CallStatusLabelLaw.showsHint(OutgoingRingingLabel.Placing)).isFalse()
        assertThat(CallStatusLabelLaw.showsHint(OutgoingRingingLabel.WaitingForPeer)).isTrue()
    }

    @Test
    fun `every end reason maps to one of the six motives`() {
        assertThat(CallStatusLabelLaw.motive(CallEndReason.Local)).isEqualTo(CallEndMotive.Local)
        assertThat(CallStatusLabelLaw.motive(CallEndReason.Remote)).isEqualTo(CallEndMotive.Remote)
        assertThat(CallStatusLabelLaw.motive(CallEndReason.Rejected)).isEqualTo(CallEndMotive.Rejected)
        assertThat(CallStatusLabelLaw.motive(CallEndReason.Missed)).isEqualTo(CallEndMotive.Missed)
        assertThat(CallStatusLabelLaw.motive(CallEndReason.ConnectionLost)).isEqualTo(CallEndMotive.ConnectionLost)
        assertThat(CallStatusLabelLaw.motive(CallEndReason.Failed("x"))).isEqualTo(CallEndMotive.Failed)
        assertThat(CallStatusLabelLaw.motive(null)).isEqualTo(CallEndMotive.Local)
    }

    @Test
    fun `the ended panel closes by itself after a beat unless a retry is offered`() {
        assertThat(CallStatusLabelLaw.autoDismissMillis(CallEndReason.Remote)).isEqualTo(1_500L)
        assertThat(CallStatusLabelLaw.autoDismissMillis(CallEndReason.Failed("x"))).isNull()
        assertThat(CallStatusLabelLaw.autoDismissMillis(CallEndReason.ConnectionLost)).isNull()
    }
}
