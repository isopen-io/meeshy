package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallHeaderLawTest {
    @Test
    fun `la puce ne s'affiche que sur un appel etabli en video ou en groupe`() {
        assertThat(CallHeaderLaw.showsDurationChip(showsConnectedLayout = true, isVideoUiActive = true)).isTrue()
        assertThat(CallHeaderLaw.showsDurationChip(showsConnectedLayout = true, isVideoUiActive = false, isGroupStage = true)).isTrue()
        assertThat(CallHeaderLaw.showsDurationChip(showsConnectedLayout = true, isVideoUiActive = false)).isFalse()
        assertThat(CallHeaderLaw.showsDurationChip(showsConnectedLayout = false, isVideoUiActive = true)).isFalse()
    }

    @Test
    fun `la porte vers la conversation exige un salon connu`() {
        assertThat(CallHeaderLaw.showsConversationButton("65f0")).isTrue()
        assertThat(CallHeaderLaw.showsConversationButton("")).isFalse()
        assertThat(CallHeaderLaw.showsConversationButton("  ")).isFalse()
        assertThat(CallHeaderLaw.showsConversationButton(null)).isFalse()
    }

    @Test
    fun `le bloc pair quitte le centre d'une scene video`() {
        assertThat(CallHeaderLaw.centersPeerBlock(isVideoStage = true)).isFalse()
        assertThat(CallHeaderLaw.centersPeerBlock(isVideoStage = false)).isTrue()
    }

    @Test
    fun `la qualite mesuree se projette sur la force du signal d'iOS`() {
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.EXCELLENT)).isEqualTo(CallSignalStrength.EXCELLENT)
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.FAIR)).isEqualTo(CallSignalStrength.FAIR)
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.POOR)).isEqualTo(CallSignalStrength.POOR)
        assertThat(CallHeaderLaw.signalStrength(null)).isEqualTo(CallSignalStrength.CONNECTING)
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.FAIR).isDegraded).isTrue()
    }
}
