package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #14662 — sous l'API 31, `Modifier.blur` ne fait rien : le voile seul cache un commentaire ou un message flouté. Rien
 * du contenu ne se dessine tant qu'il est masqué, et le voile au repos est plein (Android 9 à 11, recette S8).
 */
class BlurVeilBelowApi31Test {

    @Test
    fun `below API 31 the concealed content is not drawn at all`() {
        listOf(28, 29, 30).forEach { sdk ->
            assertThat(BlurVeil.contentAlpha(sdkInt = sdk, concealed = true)).isEqualTo(0f)
        }
    }

    @Test
    fun `below API 31 the resting veil is fully opaque`() {
        assertThat(BlurVeil.restingScrimAlpha(sdkInt = 28)).isEqualTo(1f)
        assertThat(BlurVeil.restingScrimAlpha(sdkInt = 30)).isEqualTo(1f)
    }

    @Test
    fun `from API 31 the real blur alone conceals, with no resting veil over it (#18021)`() {
        assertThat(BlurVeil.contentAlpha(sdkInt = 31, concealed = true)).isEqualTo(1f)
        assertThat(BlurVeil.restingScrimAlpha(sdkInt = 31)).isEqualTo(0f)
        assertThat(BlurVeil.restingScrimAlpha(sdkInt = 34)).isEqualTo(0f)
    }

    @Test
    fun `a plain blur carries no label, only a view-once offers its gesture (#18021, iOS ProtectedVeilAffordance)`() {
        assertThat(BlurVeil.showsRevealHint(isViewOnce = false)).isFalse()
        assertThat(BlurVeil.showsRevealHint(isViewOnce = true)).isTrue()
    }

    @Test
    fun `the feathered edge never exceeds half the side, so a short bubble keeps a solid core`() {
        assertThat(BlurVeil.featherFraction(featherPx = 30f, sidePx = 300f)).isEqualTo(0.1f)
        assertThat(BlurVeil.featherFraction(featherPx = 30f, sidePx = 40f)).isEqualTo(0.5f)
        assertThat(BlurVeil.featherFraction(featherPx = 30f, sidePx = 0f)).isEqualTo(0.5f)
    }

    @Test
    fun `revealed content is always drawn`() {
        assertThat(BlurVeil.contentAlpha(sdkInt = 28, concealed = false)).isEqualTo(1f)
        assertThat(BlurVeil.contentAlpha(sdkInt = 34, concealed = false)).isEqualTo(1f)
    }
}
