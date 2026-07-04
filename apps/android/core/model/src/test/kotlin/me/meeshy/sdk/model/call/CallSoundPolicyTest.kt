package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure call-audio policy: every [CallState] maps to
 * the right loop, and every lifecycle edge fires (or withholds) the right cue.
 */
class CallSoundPolicyTest {

    // --- loopFor: the continuous loop per phase --------------------------------

    @Test
    fun `an outgoing ring plays the caller ringback`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Ringing(isOutgoing = true)))
            .isEqualTo(CallSound.Ringback)
    }

    @Test
    fun `offering still plays ringback while awaiting the answer`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Offering)).isEqualTo(CallSound.Ringback)
    }

    @Test
    fun `an incoming ring plays the callee ringtone`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Ringing(isOutgoing = false)))
            .isEqualTo(CallSound.Ringtone)
    }

    @Test
    fun `idle is silent`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Idle)).isEqualTo(CallSound.None)
    }

    @Test
    fun `connecting is silent - ringback stops the instant the answer lands`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Connecting)).isEqualTo(CallSound.None)
    }

    @Test
    fun `a connected call is silent`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Connected)).isEqualTo(CallSound.None)
    }

    @Test
    fun `reconnecting is silent`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Reconnecting(attempt = 2)))
            .isEqualTo(CallSound.None)
    }

    @Test
    fun `an ended call is silent`() {
        assertThat(CallSoundPolicy.loopFor(CallState.Ended(CallEndReason.Local)))
            .isEqualTo(CallSound.None)
    }

    // --- cueFor: the connected cue --------------------------------------------

    @Test
    fun `reaching connected from connecting fires the connected cue`() {
        assertThat(CallSoundPolicy.cueFor(CallState.Connecting, CallState.Connected))
            .isEqualTo(CallCue.Connected)
    }

    @Test
    fun `a successful reconnect fires the connected cue again`() {
        assertThat(CallSoundPolicy.cueFor(CallState.Reconnecting(attempt = 1), CallState.Connected))
            .isEqualTo(CallCue.Connected)
    }

    @Test
    fun `staying connected fires no cue`() {
        assertThat(CallSoundPolicy.cueFor(CallState.Connected, CallState.Connected)).isNull()
    }

    // --- cueFor: the ended cue ------------------------------------------------

    @Test
    fun `a live call ending fires the ended cue`() {
        assertThat(CallSoundPolicy.cueFor(CallState.Connected, CallState.Ended(CallEndReason.Remote)))
            .isEqualTo(CallCue.Ended)
    }

    @Test
    fun `a ringing call ending fires the ended cue`() {
        assertThat(
            CallSoundPolicy.cueFor(
                CallState.Ringing(isOutgoing = false),
                CallState.Ended(CallEndReason.Rejected),
            ),
        ).isEqualTo(CallCue.Ended)
    }

    @Test
    fun `a phantom end from idle fires no ended cue`() {
        assertThat(CallSoundPolicy.cueFor(CallState.Idle, CallState.Ended(CallEndReason.Missed)))
            .isNull()
    }

    @Test
    fun `an idempotent re-end fires no cue`() {
        assertThat(
            CallSoundPolicy.cueFor(
                CallState.Ended(CallEndReason.Local),
                CallState.Ended(CallEndReason.Local),
            ),
        ).isNull()
    }

    @Test
    fun `an ordinary non-terminal advance fires no cue`() {
        assertThat(CallSoundPolicy.cueFor(CallState.Ringing(isOutgoing = true), CallState.Offering))
            .isNull()
    }

    // --- plan: loop + cue bundled per transition ------------------------------

    @Test
    fun `starting an outgoing call plans ringback with no cue`() {
        val plan = CallSoundPolicy.plan(CallState.Idle, CallState.Ringing(isOutgoing = true))
        assertThat(plan).isEqualTo(CallSoundPlan(loop = CallSound.Ringback, cue = null))
    }

    @Test
    fun `connecting plans silence and the connected cue on the same edge`() {
        val plan = CallSoundPolicy.plan(CallState.Connecting, CallState.Connected)
        assertThat(plan).isEqualTo(CallSoundPlan(loop = CallSound.None, cue = CallCue.Connected))
    }

    @Test
    fun `ending a live call plans silence and the ended cue on the same edge`() {
        val plan = CallSoundPolicy.plan(CallState.Connected, CallState.Ended(CallEndReason.Local))
        assertThat(plan).isEqualTo(CallSoundPlan(loop = CallSound.None, cue = CallCue.Ended))
    }
}
