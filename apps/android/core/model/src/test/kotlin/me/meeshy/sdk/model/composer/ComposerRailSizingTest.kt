package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #14499 — UNE règle de taille pour les boutons ronds des rails du compositeur (jumelle iOS #14500) : sur un petit écran
 * (360 dp de large au plus, ou une hauteur utile de 640 dp au plus), le disque et l'espacement se réduisent ; la cible
 * tactile reste toujours de 48 dp.
 */
class ComposerRailSizingTest {

    @Test
    fun `a phone of 360 dp wide is compact, whatever its height`() {
        assertThat(ComposerRailSizing.of(widthDp = 360f, heightDp = 900f)).isEqualTo(ComposerRailSizing.COMPACT)
    }

    @Test
    fun `a short usable height is compact, whatever the width`() {
        assertThat(ComposerRailSizing.of(widthDp = 411f, heightDp = 640f)).isEqualTo(ComposerRailSizing.COMPACT)
        assertThat(ComposerRailSizing.of(widthDp = 411f, heightDp = 545f)).isEqualTo(ComposerRailSizing.COMPACT)
    }

    @Test
    fun `a roomy phone keeps the regular size`() {
        assertThat(ComposerRailSizing.of(widthDp = 361f, heightDp = 641f)).isEqualTo(ComposerRailSizing.REGULAR)
        assertThat(ComposerRailSizing.of(widthDp = 411f, heightDp = 846f)).isEqualTo(ComposerRailSizing.REGULAR)
    }

    @Test
    fun `the regular rail paints 40 dp discs every 52 dp, the compact one 36 dp discs every 48 dp`() {
        assertThat(ComposerRailSizing.REGULAR.discDp).isEqualTo(40)
        assertThat(ComposerRailSizing.REGULAR.pitchDp).isEqualTo(52)
        assertThat(ComposerRailSizing.COMPACT.discDp).isEqualTo(36)
        assertThat(ComposerRailSizing.COMPACT.pitchDp).isEqualTo(48)
    }

    @Test
    fun `no size ever draws a disc wider than its target, nor a target under 48 dp`() {
        listOf(ComposerRailSizing.REGULAR, ComposerRailSizing.COMPACT).forEach { size ->
            assertThat(size.targetDp).isAtLeast(ComposerRailSizing.MIN_TARGET_DP)
            assertThat(size.discDp).isAtMost(size.targetDp)
            assertThat(size.optionDiscDp).isAtMost(size.targetDp)
            assertThat(size.gapDp).isAtLeast(0)
        }
    }

    @Test
    fun `an option of the editing rail shrinks its disc on a small screen, never its target`() {
        assertThat(ComposerRailSizing.REGULAR.optionDiscDp).isEqualTo(40)
        assertThat(ComposerRailSizing.COMPACT.optionDiscDp).isEqualTo(32)
    }
}
