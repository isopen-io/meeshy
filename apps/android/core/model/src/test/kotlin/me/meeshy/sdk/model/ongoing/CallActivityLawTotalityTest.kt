package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

class CallActivityLawTotalityTest {

    private val table: Map<CallState, OngoingCallPhase> = mapOf(
        CallState.Idle to OngoingCallPhase.Idle,
        CallState.Ringing(isOutgoing = true) to OngoingCallPhase.RingingOutgoing,
        CallState.Ringing(isOutgoing = false) to OngoingCallPhase.RingingIncoming,
        CallState.Offering to OngoingCallPhase.Connecting,
        CallState.Connecting to OngoingCallPhase.Connecting,
        CallState.Connected to OngoingCallPhase.Connected,
        CallState.Reconnecting(1) to OngoingCallPhase.Reconnecting,
        CallState.Ended(CallEndReason.Local) to OngoingCallPhase.Ended,
        CallState.Ended(CallEndReason.Failed("x")) to OngoingCallPhase.Ended,
    )

    @Test
    fun `every call state maps to a phase`() {
        table.forEach { (state, phase) -> assertThat(CallActivityLaw.phaseOf(state)).isEqualTo(phase) }
    }

    @Test
    fun `every phase has an explicit verdict on whether it opens a surface`() {
        val opens = OngoingCallPhase.entries.associateWith { phase ->
            CallActivityLaw.snapshot(
                CallActivityLaw.Input(phase, "A", isVideo = false, isMuted = false),
                CallActivityLaw.Wording("r", "c", "a", "v", "h", "re", "e"),
            ) != null
        }

        assertThat(opens).containsExactly(
            OngoingCallPhase.Idle, false,
            OngoingCallPhase.RingingOutgoing, true,
            OngoingCallPhase.RingingIncoming, false,
            OngoingCallPhase.Connecting, true,
            OngoingCallPhase.Connected, true,
            OngoingCallPhase.Reconnecting, true,
            OngoingCallPhase.Ended, false,
        )
    }
}
