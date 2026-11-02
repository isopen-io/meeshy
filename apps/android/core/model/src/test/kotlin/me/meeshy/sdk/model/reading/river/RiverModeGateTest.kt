package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ReadingModeConversationType
import me.meeshy.sdk.model.reading.mode.ReadingModeOrchestrator
import me.meeshy.sdk.model.reading.mode.RiverEligibilityReasonKind
import org.junit.Test

/** La porte suit EXACTEMENT `resolveCapabilities`, sans règle seconde. Miroir de `RiverModeGateTests.swift`. */
class RiverModeGateTest {

    private fun capabilities(flag: Boolean, type: ReadingModeConversationType, active: Int) =
        ReadingModeOrchestrator.resolveCapabilities(
            isAnonymous = false,
            isFlagEnabled = true,
            isRiverFlagEnabled = flag,
            conversationType = type,
            activeParticipantCount = active,
        )

    @Test
    fun `drapeau ouvert et six actifs en groupe, la riviere est selectionnable`() {
        assertThat(RiverModeGate.isSelectable(capabilities(true, ReadingModeConversationType.GROUP, 6))).isTrue()
    }

    @Test
    fun `drapeau coupe, jamais selectionnable meme au seuil`() {
        assertThat(RiverModeGate.isSelectable(capabilities(false, ReadingModeConversationType.GROUP, 6))).isFalse()
    }

    @Test
    fun `jamais en direct, quel que soit le compte`() {
        val direct = capabilities(true, ReadingModeConversationType.DIRECT, 20)
        assertThat(RiverModeGate.isSelectable(direct)).isFalse()
        assertThat(direct.riverEligibilityReason.riverReason).isEqualTo(RiverEligibilityReasonKind.NEVER_ELIGIBLE)
    }

    @Test
    fun `sous le seuil, grisee avec le compte reel conserve`() {
        val below = capabilities(true, ReadingModeConversationType.GROUP, 3)
        assertThat(RiverModeGate.isSelectable(below)).isFalse()
        assertThat(below.riverEligibilityReason.current).isEqualTo(3)
        assertThat(below.riverEligibilityReason.riverReason).isEqualTo(RiverEligibilityReasonKind.BELOW_THRESHOLD)
    }
}
