package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalMediaProtectionTest {

    private val plain = FocalProtectedMedia(isBlurred = false, isViewOnce = false)
    private val blurred = FocalProtectedMedia(isBlurred = true, isViewOnce = false)
    private val viewOnce = FocalProtectedMedia(isBlurred = false, isViewOnce = true, viewOnceCount = 2)
    private val both = FocalProtectedMedia(isBlurred = true, isViewOnce = true)

    @Test
    fun `une pièce ordinaire n'est jamais protégée`() {
        assertThat(FocalMediaProtection.state(plain, isRevealed = false)).isEqualTo(FocalMediaProtectionState.None)
    }

    @Test
    fun `floutée non révélée est floutée sans vue unique`() {
        assertThat(FocalMediaProtection.state(blurred, false)).isEqualTo(FocalMediaProtectionState.Blurred(false))
    }

    @Test
    fun `vue unique non révélée est floutée vue unique`() {
        assertThat(FocalMediaProtection.state(viewOnce, false)).isEqualTo(FocalMediaProtectionState.Blurred(true))
        assertThat(FocalMediaProtection.state(both, false)).isEqualTo(FocalMediaProtectionState.Blurred(true))
    }

    @Test
    fun `révélée n'est plus protégée`() {
        assertThat(FocalMediaProtection.state(both, isRevealed = true)).isEqualTo(FocalMediaProtectionState.None)
    }

    @Test
    fun `le message révélé lève le flou mais jamais la vue unique`() {
        assertThat(FocalMediaProtection.state(blurred, false, messageRevealed = true))
            .isEqualTo(FocalMediaProtectionState.None)
        assertThat(FocalMediaProtection.state(viewOnce, false, messageRevealed = true))
            .isEqualTo(FocalMediaProtectionState.Blurred(true))
    }

    @Test
    fun `toucher une pièce floutée la révèle sur place`() {
        assertThat(FocalMediaProtection.tap(blurred, false, false)).isEqualTo(FocalCellTap.Reveal)
    }

    @Test
    fun `toucher une vue unique image ou vidéo ouvre le plein écran`() {
        assertThat(FocalMediaProtection.tap(viewOnce, false, false)).isEqualTo(FocalCellTap.OpenFullscreen(false))
    }

    @Test
    fun `une pièce révélée ouvre le plein écran et se refloute si elle n'est pas vue unique`() {
        assertThat(FocalMediaProtection.tap(blurred, isRevealed = true, messageRevealed = false))
            .isEqualTo(FocalCellTap.OpenFullscreen(reblurs = true))
        assertThat(FocalMediaProtection.tap(plain, false, false)).isEqualTo(FocalCellTap.OpenFullscreen(false))
    }

    @Test
    fun `le badge vue unique exige vue unique et compteur positif`() {
        assertThat(FocalMediaProtection.showsViewOnceBadge(blurred)).isFalse()
        assertThat(FocalMediaProtection.showsViewOnceBadge(both)).isFalse()
        assertThat(FocalMediaProtection.showsViewOnceBadge(viewOnce)).isTrue()
        assertThat(FocalMediaProtection.showsViewOnceBadge(viewOnce.copy(viewOnceCount = 0))).isFalse()
    }
}
