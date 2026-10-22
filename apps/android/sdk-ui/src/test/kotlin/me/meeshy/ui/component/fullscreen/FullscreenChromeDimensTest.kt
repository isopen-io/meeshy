package me.meeshy.ui.component.fullscreen

import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshySpacing
import org.junit.Test

/**
 * Les cotes du chrome sont UNE table (`FullscreenChromeMetrics`, `:core:model`) lue en dp ici :
 * ce test garde qu'elle reste alignée sur les jetons d'espacement du design system, et que la
 * cible tactile ne descend jamais sous le plancher d'accessibilité d'Android.
 */
class FullscreenChromeDimensTest {

    @Test
    fun `la gouttiere du chrome est le jeton lg et l'intervalle de rail le jeton sm`() {
        assertThat(FullscreenChromeDimens.edgeInset).isEqualTo(MeeshySpacing.lg)
        assertThat(FullscreenChromeDimens.railSpacing).isEqualTo(MeeshySpacing.sm)
        assertThat(FullscreenChromeDimens.topInset).isEqualTo(MeeshySpacing.sm)
        assertThat(FullscreenChromeDimens.barSpacing).isEqualTo(MeeshySpacing.sm)
    }

    @Test
    fun `la cible tactile fait 48 dp et deborde le disque de 40 dp`() {
        assertThat(FullscreenChromeDimens.tapTarget).isEqualTo(48.dp)
        assertThat(FullscreenChromeDimens.discDiameter).isEqualTo(40.dp)
        assertThat(FullscreenChromeDimens.tapTarget).isAtLeast(48.dp)
    }

    @Test
    fun `le disque visible tombe sur la gouttiere, sa cible deborde vers le bord`() {
        val overflow = (FullscreenChromeDimens.tapTarget - FullscreenChromeDimens.discDiameter) / 2

        assertThat(FullscreenChromeDimens.topBarHorizontalPadding + overflow)
            .isEqualTo(FullscreenChromeDimens.edgeInset)
    }

    @Test
    fun `le seuil de fermeture est 150 dp et le glyphe est fige en dp`() {
        assertThat(FullscreenChromeDimens.dismissDragThreshold).isEqualTo(150.dp)
        assertThat(FullscreenChromeDimens.discGlyph).isEqualTo(18.dp)
        assertThat(FullscreenChromeDimens.floatingGlyph).isEqualTo(22.dp)
    }

    @Test
    fun `la rangee d'emojis jaillit d'une cellule de large a gauche du rail`() {
        assertThat(FullscreenChromeDimens.reactionStripLeadingOffset)
            .isEqualTo(-FullscreenChromeDimens.floatingCellWidth)
    }

    @Test
    fun `les voiles suivent le chrome - visibles avec lui, absents sans lui`() {
        assertThat(fullscreenScrimOpacity(chromeVisible = true)).isEqualTo(1f)
        assertThat(fullscreenScrimOpacity(chromeVisible = false)).isEqualTo(0f)
    }

    @Test
    fun `un disque n'ecrit jamais de legende, un rail flottant l'ecrit quand il y en a une`() {
        assertThat(FullscreenActionStyle.Disc().showsCaption("12")).isFalse()
        assertThat(FullscreenActionStyle.Floating().showsCaption("12")).isTrue()
        assertThat(FullscreenActionStyle.Floating().showsCaption("")).isFalse()
        assertThat(FullscreenActionStyle.Floating().showsCaption(null)).isFalse()
    }
}
