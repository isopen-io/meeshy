package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalCellVeilTest {

    private val blurred = FocalMediaProtectionState.Blurred(isViewOnce = false)
    private val viewOnce = FocalMediaProtectionState.Blurred(isViewOnce = true)

    @Test
    fun `une case ordinaire montre son média net`() {
        assertThat(FocalCellVeil.mediaLayer(FocalMediaProtectionState.None, sdkInt = 34))
            .isEqualTo(FocalCellMediaLayer.Clear)
    }

    @Test
    fun `une case floutée est floutée a 18 dp des l'API 31`() {
        assertThat(FocalCellVeil.mediaLayer(blurred, sdkInt = 31))
            .isEqualTo(FocalCellMediaLayer.Blurred(radiusDp = 18))
    }

    @Test
    fun `sous l'API 31 le flou n'existe pas donc le média n'est jamais monte`() {
        assertThat(FocalCellVeil.mediaLayer(blurred, sdkInt = 30)).isEqualTo(FocalCellMediaLayer.Absent)
    }

    @Test
    fun `une vue unique ne monte jamais son média avant révélation, quelle que soit l'API`() {
        assertThat(FocalCellVeil.mediaLayer(viewOnce, sdkInt = 35)).isEqualTo(FocalCellMediaLayer.Absent)
    }

    @Test
    fun `le libellé suit la vue unique et le toucher pour voir accompagne toute case voilée`() {
        assertThat(FocalCellVeil.label(viewOnce)).isEqualTo(FocalCellLabel.ViewOnce)
        assertThat(FocalCellVeil.label(blurred)).isEqualTo(FocalCellLabel.Masked)
    }
}
