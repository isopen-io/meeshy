package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Un objet de scène grandit sans plafond et rapetisse jusqu'à 5 pixels de la scène de référence sur son plus petit
 * côté (#14298) ; les lecteurs rendent l'échelle écrite telle quelle.
 */
@RunWith(JUnit4::class)
class SceneObjectScalePolicyTest {

    @Test
    fun `le plancher est de 5 pixels de la scene de reference sur le plus petit cote`() {
        assertThat(SceneObjectScalePolicy.MIN_SIDE_DESIGN_PX).isEqualTo(5.0)
        assertThat(SceneObjectScalePolicy.floorFor(smallestSideDesignPx = 140.0)).isWithin(1e-12).of(5.0 / 140.0)
        assertThat(SceneObjectScalePolicy.floorFor(smallestSideDesignPx = 64.0)).isWithin(1e-12).of(5.0 / 64.0)
    }

    @Test
    fun `un cote inconnu ou faux n impose aucun plancher`() {
        listOf(0.0, -3.0, Double.NaN, Double.POSITIVE_INFINITY).forEach {
            assertThat(SceneObjectScalePolicy.floorFor(smallestSideDesignPx = it)).isEqualTo(0.0)
        }
    }

    @Test
    fun `le pincement agrandit sans plafond`() {
        assertThat(SceneObjectScalePolicy.settled(base = 4.0, gestureScale = 10.0, smallestSideDesignPx = 140.0)).isEqualTo(40.0)
        assertThat(SceneObjectScalePolicy.settled(base = 1000.0, gestureScale = 1000.0, smallestSideDesignPx = 140.0)).isEqualTo(1e6)
    }

    @Test
    fun `le pincement reduit jusqu au plancher de 5 pixels et pas en dessous`() {
        val floor = 5.0 / 140.0
        assertThat(SceneObjectScalePolicy.settled(base = 1.0, gestureScale = 0.05, smallestSideDesignPx = 140.0)).isEqualTo(0.05)
        assertThat(SceneObjectScalePolicy.settled(base = 1.0, gestureScale = 0.001, smallestSideDesignPx = 140.0)).isWithin(1e-12).of(floor)
        assertThat(SceneObjectScalePolicy.settled(base = 0.3, gestureScale = 0.1, smallestSideDesignPx = 140.0)).isWithin(1e-12).of(floor)
    }

    @Test
    fun `un facteur de geste degenere laisse l echelle ou elle est`() {
        listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY).forEach {
            assertThat(SceneObjectScalePolicy.settled(base = 2.5, gestureScale = it, smallestSideDesignPx = 140.0)).isEqualTo(2.5)
        }
        assertThat(SceneObjectScalePolicy.settled(base = Double.MAX_VALUE, gestureScale = 10.0, smallestSideDesignPx = 140.0)).isEqualTo(Double.MAX_VALUE)
    }

    @Test
    fun `une echelle ecrite finie et positive est servie telle quelle, petite ou immense`() {
        listOf(0.001, 0.0357, 0.3, 1.0, 4.0, 20.0, 1e6).forEach {
            assertThat(SceneObjectScalePolicy.served(it)).isEqualTo(it)
        }
    }

    @Test
    fun `une echelle nulle, negative ou non finie est servie a l identite`() {
        listOf(0.0, -2.0, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY).forEach {
            assertThat(SceneObjectScalePolicy.served(it)).isEqualTo(1.0)
        }
    }

    @Test
    fun `les surcharges Float suivent la meme loi`() {
        assertThat(SceneObjectScalePolicy.settled(base = 4f, gestureScale = 10f, smallestSideDesignPx = 140.0)).isEqualTo(40f)
        assertThat(SceneObjectScalePolicy.settled(base = 1f, gestureScale = 0.001f, smallestSideDesignPx = 140.0)).isWithin(1e-6f).of(5f / 140f)
        assertThat(SceneObjectScalePolicy.settled(base = 2f, gestureScale = Float.NaN, smallestSideDesignPx = 140.0)).isEqualTo(2f)
        assertThat(SceneObjectScalePolicy.settled(base = Float.MAX_VALUE, gestureScale = 10f, smallestSideDesignPx = 140.0)).isEqualTo(Float.MAX_VALUE)
        assertThat(SceneObjectScalePolicy.served(9f)).isEqualTo(9f)
        assertThat(SceneObjectScalePolicy.served(Float.NaN)).isEqualTo(1f)
    }

    @Test
    fun `une grandeur rendue se coupe entre la mise en page bornee et le calque qui agrandit au dela`() {
        val big = LayeredScale.of(total = 10.0, layoutCeiling = 4.0)
        assertThat(big.layout).isEqualTo(4.0)
        assertThat(big.layer).isEqualTo(2.5)
        assertThat(big.layout * big.layer).isEqualTo(10.0)
        assertThat(LayeredScale.of(total = 0.04, layoutCeiling = 4.0)).isEqualTo(LayeredScale(layout = 0.04, layer = 1.0))
        assertThat(LayeredScale.of(total = 4.0, layoutCeiling = 4.0)).isEqualTo(LayeredScale(layout = 4.0, layer = 1.0))
    }

    @Test
    fun `une grandeur demesuree garde une mise en page bornee et un calque fini`() {
        val huge = LayeredScale.of(total = Double.POSITIVE_INFINITY, layoutCeiling = 4.0)
        assertThat(huge.layout).isEqualTo(4.0)
        assertThat(huge.layerFloat.isFinite()).isTrue()
        assertThat(LayeredScale.of(total = 1e300, layoutCeiling = 4.0).layerFloat).isEqualTo(Float.MAX_VALUE)
        assertThat(LayeredScale.of(total = Double.NaN, layoutCeiling = 4.0)).isEqualTo(LayeredScale(layout = 0.0, layer = 1.0))
        assertThat(LayeredScale.of(total = -1.0, layoutCeiling = 4.0)).isEqualTo(LayeredScale(layout = 0.0, layer = 1.0))
    }

    @Test
    fun `l echelle d un objet se coupe au plafond de mise en page de 4`() {
        assertThat(SceneObjectScalePolicy.LAYOUT_SCALE_CEILING).isEqualTo(4.0)
        assertThat(SceneObjectScalePolicy.layered(12.0)).isEqualTo(LayeredScale(layout = 4.0, layer = 3.0))
        assertThat(SceneObjectScalePolicy.layered(0.05)).isEqualTo(LayeredScale(layout = 0.05, layer = 1.0))
        assertThat(SceneObjectScalePolicy.layered(Double.NaN)).isEqualTo(LayeredScale(layout = 1.0, layer = 1.0))
    }
}
