package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSignalGlyphTest {
    @Test
    fun `les barres pleines suivent 1, 0,75, 0,5, 0,25 et 0`() {
        val bars = CallSignalStrength.entries.associateWith { it.filledBars }
        assertThat(bars).containsExactly(
            CallSignalStrength.EXCELLENT, 4,
            CallSignalStrength.GOOD, 3,
            CallSignalStrength.FAIR, 2,
            CallSignalStrength.POOR, 1,
            CallSignalStrength.LOST, 0,
            CallSignalStrength.CONNECTING, 2,
        )
    }

    @Test
    fun `vert, ambre, rouge, et indigo pendant la negociation`() {
        assertThat(CallSignalStrength.EXCELLENT.tone).isEqualTo(CallSignalTone.SUCCESS)
        assertThat(CallSignalStrength.GOOD.tone).isEqualTo(CallSignalTone.SUCCESS)
        assertThat(CallSignalStrength.FAIR.tone).isEqualTo(CallSignalTone.WARNING)
        assertThat(CallSignalStrength.POOR.tone).isEqualTo(CallSignalTone.ERROR)
        assertThat(CallSignalStrength.LOST.tone).isEqualTo(CallSignalTone.ERROR)
        assertThat(CallSignalStrength.CONNECTING.tone).isEqualTo(CallSignalTone.NEGOTIATING)
    }

    @Test
    fun `le libelle parle de force de signal, jamais d'un evenement de reconnexion`() {
        assertThat(CallSignalStrength.entries.map { it.label }.map { it.name })
            .containsNoneIn(listOf("RECONNECTING", "LOST_CONNECTION"))
        assertThat(CallSignalStrength.EXCELLENT.label).isEqualTo(CallSignalLabel.GOOD)
        assertThat(CallSignalStrength.FAIR.label).isEqualTo(CallSignalLabel.FAIR)
        assertThat(CallSignalStrength.LOST.label).isEqualTo(CallSignalLabel.LOST)
        assertThat(CallSignalStrength.CONNECTING.label).isEqualTo(CallSignalLabel.CONNECTING)
    }
}
