package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import kotlin.time.Duration.Companion.seconds
import org.junit.Test

/**
 * Les cotes du chrome plein écran sont UNE table pour tous les visualiseurs
 * (miroir de `FullscreenChromeMetrics.swift`, #8878) : ce test fige chaque valeur,
 * pour qu'un visualiseur ne puisse plus dériver d'un dp sans que la CI le dise.
 */
class FullscreenChromeMetricsTest {

    @Test
    fun `le disque de verre mesure 40 dp et sa cible tactile 48 dp`() {
        assertThat(FullscreenChromeMetrics.DISC_DIAMETER_DP).isEqualTo(40)
        assertThat(FullscreenChromeMetrics.TAP_TARGET_DP).isEqualTo(48)
    }

    @Test
    fun `la cible tactile deborde le disque tout autour`() {
        val overflow = FullscreenChromeMetrics.TAP_TARGET_DP - FullscreenChromeMetrics.DISC_DIAMETER_DP

        assertThat(overflow).isGreaterThan(0)
        assertThat(overflow % 2).isEqualTo(0)
    }

    @Test
    fun `le glyphe du disque et celui du rail flottant sont figes en dp`() {
        assertThat(FullscreenChromeMetrics.DISC_GLYPH_SIZE_DP).isEqualTo(18)
        assertThat(FullscreenChromeMetrics.FLOATING_GLYPH_SIZE_DP).isEqualTo(22)
        assertThat(FullscreenChromeMetrics.FLOATING_CELL_WIDTH_DP).isEqualTo(56)
    }

    @Test
    fun `la gouttiere vaut lg et l'intervalle de rail vaut sm`() {
        assertThat(FullscreenChromeMetrics.EDGE_INSET_DP).isEqualTo(16)
        assertThat(FullscreenChromeMetrics.RAIL_SPACING_DP).isEqualTo(8)
        assertThat(FullscreenChromeMetrics.TOP_INSET_DP).isEqualTo(8)
        assertThat(FullscreenChromeMetrics.BAR_SPACING_DP).isEqualTo(8)
    }

    @Test
    fun `le seuil de fermeture par glissement vertical est 150`() {
        assertThat(FullscreenChromeMetrics.DISMISS_DRAG_THRESHOLD_DP).isEqualTo(150)
    }

    @Test
    fun `le chrome d'une video en lecture s'efface apres 3 secondes`() {
        assertThat(FullscreenChromeMetrics.AUTO_HIDE_DELAY).isEqualTo(3.seconds)
    }

    @Test
    fun `le bouton pause central s'efface apres 1 seconde, plus vite que le reste du chrome`() {
        assertThat(FullscreenChromeMetrics.PLAY_PAUSE_FADE_DELAY).isEqualTo(1.seconds)
        assertThat(FullscreenChromeMetrics.PLAY_PAUSE_FADE_DELAY)
            .isLessThan(FullscreenChromeMetrics.AUTO_HIDE_DELAY)
    }

    @Test
    fun `la rangee d'emojis jaillit a gauche de la cellule qui l'ouvre`() {
        assertThat(FullscreenChromeMetrics.REACTION_STRIP_LEADING_OFFSET_DP)
            .isEqualTo(-FullscreenChromeMetrics.FLOATING_CELL_WIDTH_DP)
    }

    @Test
    fun `le contour d'une action flottante agrandit le glyphe et porte un halo`() {
        assertThat(FullscreenChromeMetrics.OUTLINE_SCALE).isEqualTo(1.22f)
        assertThat(FullscreenChromeMetrics.OUTLINE_GLOW_RADIUS_DP).isEqualTo(7)
        assertThat(FullscreenChromeMetrics.OUTLINE_GLOW_OPACITY).isEqualTo(0.55f)
    }

    @Test
    fun `le voile haut deborde la zone sure de 110 dp, le voile bas mesure 240 dp`() {
        assertThat(FullscreenScrimMetrics.TOP_EXTENT_DP).isEqualTo(110)
        assertThat(FullscreenScrimMetrics.BOTTOM_HEIGHT_DP).isEqualTo(240)
    }

    @Test
    fun `le voile haut va du noir 70 pour cent a transparent, le voile bas l'inverse jusqu'a 92 pour cent`() {
        assertThat(FullscreenScrimMetrics.TOP_STOPS).containsExactly(
            FullscreenScrimStop(opacity = 0.7f, location = 0f),
            FullscreenScrimStop(opacity = 0.4f, location = 0.5f),
            FullscreenScrimStop(opacity = 0f, location = 1f),
        ).inOrder()
        assertThat(FullscreenScrimMetrics.BOTTOM_STOPS).containsExactly(
            FullscreenScrimStop(opacity = 0f, location = 0f),
            FullscreenScrimStop(opacity = 0.55f, location = 0.45f),
            FullscreenScrimStop(opacity = 0.92f, location = 1f),
        ).inOrder()
    }

    @Test
    fun `chaque verbe du chrome a un identifiant unique`() {
        val ids = FullscreenChromeSymbol.entries.map { it.name }

        assertThat(ids).containsNoDuplicates()
        assertThat(ids).containsAtLeast("Close", "Back", "More", "React", "ReactBadge", "Reply")
    }
}
