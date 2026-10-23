package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSignalStrengthTest {
    @Test
    fun `chaque niveau de qualité mesuré donne son état de signal`() {
        val expected = mapOf(
            VideoQualityLevel.EXCELLENT to CallSignalStrength.EXCELLENT,
            VideoQualityLevel.GOOD to CallSignalStrength.GOOD,
            VideoQualityLevel.FAIR to CallSignalStrength.FAIR,
            VideoQualityLevel.POOR to CallSignalStrength.POOR,
            VideoQualityLevel.CRITICAL to CallSignalStrength.LOST,
        )
        expected.forEach { (level, strength) ->
            assertThat(CallSignalStrength.from(level, CallLinkState.FAILED)).isEqualTo(strength)
        }
    }

    @Test
    fun `sans mesure la liaison sert de repli`() {
        assertThat(CallSignalStrength.from(null, CallLinkState.CONNECTED)).isEqualTo(CallSignalStrength.GOOD)
        assertThat(CallSignalStrength.from(null, CallLinkState.NEW)).isEqualTo(CallSignalStrength.FAIR)
        assertThat(CallSignalStrength.from(null, CallLinkState.CONNECTING)).isEqualTo(CallSignalStrength.CONNECTING)
        listOf(CallLinkState.DISCONNECTED, CallLinkState.FAILED, CallLinkState.CLOSED).forEach {
            assertThat(CallSignalStrength.from(null, it)).isEqualTo(CallSignalStrength.LOST)
        }
    }

    @Test
    fun `barres et gravité suivent la table iOS`() {
        assertThat(CallSignalStrength.entries.map { it.barsFraction })
            .containsExactly(1.0, 0.75, 0.5, 0.25, 0.0, 0.5).inOrder()
        assertThat(CallSignalStrength.entries.filter { it.isDegraded })
            .containsExactly(CallSignalStrength.FAIR, CallSignalStrength.POOR, CallSignalStrength.LOST)
        assertThat(CallSignalStrength.entries.filter { it.isCritical })
            .containsExactly(CallSignalStrength.POOR, CallSignalStrength.LOST)
    }
}
