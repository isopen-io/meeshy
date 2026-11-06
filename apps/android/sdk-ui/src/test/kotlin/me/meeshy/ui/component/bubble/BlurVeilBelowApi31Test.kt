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
    fun `from API 31 the real blur conceals, the content draws under a translucent veil`() {
        assertThat(BlurVeil.contentAlpha(sdkInt = 31, concealed = true)).isEqualTo(1f)
        assertThat(BlurVeil.restingScrimAlpha(sdkInt = 31)).isLessThan(1f)
    }

    @Test
    fun `revealed content is always drawn`() {
        assertThat(BlurVeil.contentAlpha(sdkInt = 28, concealed = false)).isEqualTo(1f)
        assertThat(BlurVeil.contentAlpha(sdkInt = 34, concealed = false)).isEqualTo(1f)
    }
}
