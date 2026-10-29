package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind
import org.junit.Test

/**
 * #13652 : comme iOS (`ComposerAdjustCopy.displayValue`), l'auteur lit un ÉCART à l'original de −100 à +100, zéro au neutre,
 * quelle que soit l'unité du réglage (un contraste vit entre 0,5 et 1,5, une exposition entre −2 et +2).
 */
class ComposerAdjustReadingTest {

    @Test
    fun `le neutre se lit zero pour chaque reglage`() {
        AdjustmentKind.entries.forEach { assertThat(ComposerAdjustReading.displayValue(it, it.neutral)).isEqualTo(0) }
    }

    @Test
    fun `chaque borne se lit plus ou moins cent, quelle que soit l unite`() {
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.CONTRAST, 1.5f)).isEqualTo(100)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.CONTRAST, 0.5f)).isEqualTo(-100)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.EXPOSURE, 2f)).isEqualTo(100)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.EXPOSURE, -2f)).isEqualTo(-100)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.SATURATION, 0f)).isEqualTo(-100)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.SATURATION, 2f)).isEqualTo(100)
    }

    @Test
    fun `la valeur lue est proportionnelle a la course de son cote`() {
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.CONTRAST, 1.25f)).isEqualTo(50)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.EXPOSURE, -0.5f)).isEqualTo(-25)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.BRIGHTNESS, 0.1f)).isEqualTo(25)
    }

    @Test
    fun `un reglage qui ne descend pas sous son neutre ne se lit jamais en dessous de zero`() {
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.BLUR, 0.5f)).isEqualTo(50)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.BLUR, -3f)).isEqualTo(0)
        assertThat(ComposerAdjustReading.displayValue(AdjustmentKind.GRAIN, 1f)).isEqualTo(100)
    }

    @Test
    fun `la valeur est ecrite comme on la lit, signee et zero sans signe`() {
        assertThat(ComposerAdjustReading.signed(40)).isEqualTo("+40")
        assertThat(ComposerAdjustReading.signed(-7)).isEqualTo("-7")
        assertThat(ComposerAdjustReading.signed(0)).isEqualTo("0")
    }

    @Test
    fun `un sous-outil n offre que ses curseurs, et une video ceux qu elle peint`() {
        assertThat(ComposerAdjustReading.kinds(AdjustmentFamily.EFFECT, isVideo = false))
            .containsExactly(AdjustmentKind.BLOOM, AdjustmentKind.GRAIN).inOrder()
        assertThat(ComposerAdjustReading.kinds(AdjustmentFamily.EFFECT, isVideo = true)).isEmpty()
        val tone = ComposerAdjustReading.kinds(AdjustmentFamily.TONE, isVideo = false)
        assertThat(tone.first()).isEqualTo(AdjustmentKind.EXPOSURE)
        assertThat(tone).contains(AdjustmentKind.BLUR)
        val video = ComposerAdjustReading.kinds(AdjustmentFamily.TONE, isVideo = true)
        assertThat(video).doesNotContain(AdjustmentKind.BLUR)
        assertThat(video).doesNotContain(AdjustmentKind.SHARPNESS)
        assertThat(video).contains(AdjustmentKind.VIGNETTE)
    }

    @Test
    fun `le curseur unique pilote le reglage touche tant que le media le peint, sinon le premier`() {
        val kinds = listOf(AdjustmentKind.EXPOSURE, AdjustmentKind.CONTRAST, AdjustmentKind.VIGNETTE)
        assertThat(ComposerAdjustReading.shown(AdjustmentKind.CONTRAST, kinds)).isEqualTo(AdjustmentKind.CONTRAST)
        assertThat(ComposerAdjustReading.shown(null, kinds)).isEqualTo(AdjustmentKind.EXPOSURE)
        assertThat(ComposerAdjustReading.shown(AdjustmentKind.BLUR, kinds)).isEqualTo(AdjustmentKind.EXPOSURE)
        assertThat(ComposerAdjustReading.shown(AdjustmentKind.BLUR, emptyList())).isNull()
    }
}
