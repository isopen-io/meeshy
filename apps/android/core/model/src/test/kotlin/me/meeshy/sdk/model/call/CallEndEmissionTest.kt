package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallEndEmissionTest {

    @Test
    fun `a recognised reason travels with the end`() {
        val (decision, _) = CallEndEmission().request("c1", "rejected")

        assertThat(decision).isEqualTo(CallEndDecision.Emit("c1", "rejected"))
    }

    @Test
    fun `an unknown reason is dropped but the end still leaves`() {
        val (decision, _) = CallEndEmission().request("c1", "Bad Reason!")

        assertThat(decision).isEqualTo(CallEndDecision.Emit("c1", null))
    }

    @Test
    fun `a blank call id is ignored`() {
        assertThat(CallEndEmission().request(" ", null).first).isEqualTo(CallEndDecision.Ignore)
    }

    @Test
    fun `a second request for the same call has no effect`() {
        val (_, after) = CallEndEmission().request("c1", null)

        assertThat(after.request("c1", "rejected").first).isEqualTo(CallEndDecision.Ignore)
        assertThat(after.request("c2", null).first).isEqualTo(CallEndDecision.Emit("c2", null))
    }

    @Test
    fun `an unacknowledged end replays once after a cold socket and keeps its reason`() {
        val (_, requested) = CallEndEmission().request("c1", "rejected")
        val armed = requested.unacknowledged("c1", "rejected")

        val (entries, rest) = armed.replayOnReconnect()
        assertThat(entries).containsExactly(CallPendingEnd("c1", "rejected"))
        assertThat(rest.replayOnReconnect().first).isEmpty()
    }

    @Test
    fun `arming the same end twice replays it once`() {
        val armed = CallEndEmission().unacknowledged("c1", null).unacknowledged("c1", null)

        assertThat(armed.replayOnReconnect().first).hasSize(1)
    }

    @Test
    fun `a replayed end is not requested again`() {
        val (_, requested) = CallEndEmission().request("c1", null)
        val (_, rest) = requested.unacknowledged("c1", null).replayOnReconnect()

        assertThat(rest.request("c1", null).first).isEqualTo(CallEndDecision.Ignore)
    }
}
