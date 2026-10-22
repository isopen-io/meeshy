package me.meeshy.sdk.model.brand

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La géométrie du logo Meeshy — les trois traits de `MeeshyDashesShape` /
 * `MeeshyBrandMark.referenceDashes` (iOS), dans un espace de référence 1024 × 1024 : traits
 * à bouts ronds, longueurs décroissantes alignées à gauche, opacités de repos 0,7 · 1 · 0,75.
 */
class BrandMarkGeometryTest {

    @Test
    fun `the mark is three left-aligned dashes of decreasing length`() {
        val dashes = BrandMarkGeometry.dashes

        assertThat(dashes).hasSize(3)
        assertThat(dashes.map { it.startX }.toSet()).containsExactly(262f)
        assertThat(dashes.map { it.endX }).containsExactly(762f, 662f, 562f).inOrder()
        assertThat(dashes.map { it.y }).containsExactly(384f, 512f, 640f).inOrder()
    }

    @Test
    fun `the resting opacities are the logo ones`() {
        assertThat(BrandMarkGeometry.dashes.map { it.restingAlpha }).containsExactly(0.7f, 1f, 0.75f).inOrder()
    }

    @Test
    fun `the breathing opacities swap the quiet dash for the bright one`() {
        assertThat(BrandMarkGeometry.dashes.map { it.breathingAlpha }).containsExactly(1f, 0.85f, 1f).inOrder()
    }

    @Test
    fun `the stroke is one ninth of the square like the app icon`() {
        assertThat(BrandMarkGeometry.REFERENCE_SIDE).isEqualTo(1024f)
        assertThat(BrandMarkGeometry.LINE_WIDTH_RATIO).isWithin(1e-6f).of(112f / 1024f)
    }

    @Test
    fun `the dashes reveal one after the other, a tenth of a second apart`() {
        assertThat(BrandMarkGeometry.dashes.map { it.revealDelayMillis }).containsExactly(0, 100, 200).inOrder()
        assertThat(BrandMarkGeometry.REVEAL_DURATION_MILLIS).isEqualTo(250)
    }

    @Test
    fun `the breathing cycle follows the logo, one and a half seconds each way, five percent larger`() {
        assertThat(BrandMarkGeometry.BREATH_DURATION_MILLIS).isEqualTo(1500)
        assertThat(BrandMarkGeometry.BREATH_SCALE).isEqualTo(1.05f)
    }

    @Test
    fun `the alpha slides between rest and breath with the phase`() {
        val top = BrandMarkGeometry.dashes[0]

        assertThat(top.alphaAt(phase = 0f)).isEqualTo(0.7f)
        assertThat(top.alphaAt(phase = 1f)).isEqualTo(1f)
        assertThat(top.alphaAt(phase = 0.5f)).isWithin(1e-6f).of(0.85f)
    }

    @Test
    fun `a dash revealed halfway reaches halfway along its length`() {
        val top = BrandMarkGeometry.dashes[0]

        assertThat(top.endXAt(progress = 0f)).isEqualTo(262f)
        assertThat(top.endXAt(progress = 0.5f)).isEqualTo(512f)
        assertThat(top.endXAt(progress = 1f)).isEqualTo(762f)
        assertThat(top.endXAt(progress = 4f)).isEqualTo(762f)
    }
}
