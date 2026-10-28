package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryKeyframe
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/** Les nombres d'un objet publié par un tiers sont non fiables : chacun est borné avant d'atteindre mise en page ou dessin (#13581). */
@RunWith(JUnit4::class)
class SceneObjectNumbersTest {

    private val hostile = listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 1e30, -1e30, -5.0, 0.0)

    @Test
    fun `une taille de police non finie ou non positive retombe sur 64`() {
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, -5.0, 0.0).forEach {
            assertThat(SceneObjectNumbers.fontSize(it)).isEqualTo(64.0)
        }
    }

    @Test
    fun `une taille de police demesuree est plafonnee et une valide traverse`() {
        assertThat(SceneObjectNumbers.fontSize(1e30)).isEqualTo(SceneObjectNumbers.MAX_FONT_SIZE)
        assertThat(SceneObjectNumbers.fontSize(0.001)).isEqualTo(SceneObjectNumbers.MIN_FONT_SIZE)
        assertThat(SceneObjectNumbers.fontSize(96.0)).isEqualTo(96.0)
        assertThat(SceneObjectNumbers.MAX_FONT_SIZE).isAtLeast(200.0)
    }

    @Test
    fun `une position hostile reste dans une fenetre finie autour de la scene`() {
        hostile.forEach {
            val p = SceneObjectNumbers.position(it)
            assertThat(p.isFinite()).isTrue()
            assertThat(p).isAtLeast(SceneObjectNumbers.MIN_POSITION)
            assertThat(p).isAtMost(SceneObjectNumbers.MAX_POSITION)
        }
        assertThat(SceneObjectNumbers.position(Double.NaN)).isEqualTo(0.5)
        assertThat(SceneObjectNumbers.position(0.25)).isEqualTo(0.25)
    }

    @Test
    fun `une opacite hostile est une fraction et NaN reste opaque`() {
        assertThat(SceneObjectNumbers.opacity(Double.NaN)).isEqualTo(1.0)
        assertThat(SceneObjectNumbers.opacity(7.0)).isEqualTo(1.0)
        assertThat(SceneObjectNumbers.opacity(-2.0)).isEqualTo(0.0)
        assertThat(SceneObjectNumbers.opacity(0.4)).isEqualTo(0.4)
    }

    @Test
    fun `une rotation est finie et ramenee a un tour`() {
        assertThat(SceneObjectNumbers.rotation(Double.NaN)).isEqualTo(0.0)
        assertThat(SceneObjectNumbers.rotation(Double.POSITIVE_INFINITY)).isEqualTo(0.0)
        assertThat(SceneObjectNumbers.rotation(370.0)).isWithin(1e-9).of(10.0)
        assertThat(SceneObjectNumbers.rotation(1e30).isFinite()).isTrue()
        assertThat(SceneObjectNumbers.rotation(-30.0)).isEqualTo(-30.0)
    }

    @Test
    fun `un temps ou une duree hostile est fini et positif ou nul`() {
        hostile.forEach {
            assertThat(SceneObjectNumbers.seconds(it)).isAtLeast(0.0)
            assertThat(SceneObjectNumbers.seconds(it).isFinite()).isTrue()
        }
        assertThat(SceneObjectNumbers.seconds(2.5)).isEqualTo(2.5)
    }

    @Test
    fun `un cote de sticker hostile est une fraction finie de la scene`() {
        hostile.forEach {
            val side = SceneObjectNumbers.stickerSideFraction(baseSize = it, scale = it)
            assertThat(side.isFinite()).isTrue()
            assertThat(side).isAtLeast(0.0)
            assertThat(side).isAtMost(SceneObjectNumbers.MAX_STICKER_SIDE_FRACTION)
        }
        assertThat(SceneObjectNumbers.stickerSideFraction(baseSize = 108.0, scale = 1.0)).isWithin(1e-9).of(0.1)
    }

    @Test
    fun `une keyframe hostile perd ses canaux non finis et garde un temps fini`() {
        val k = SceneObjectNumbers.keyframe(StoryKeyframe(time = Float.NaN, x = Double.NaN, y = 1e30, scale = Double.POSITIVE_INFINITY, opacity = -4.0))
        assertThat(k.time).isEqualTo(0f)
        assertThat(k.x).isNull()
        assertThat(k.y).isEqualTo(SceneObjectNumbers.MAX_POSITION)
        assertThat(k.scale).isNull()
        assertThat(k.opacity).isEqualTo(0.0)
        val ok = StoryKeyframe(time = 1.5f, x = 0.2)
        assertThat(SceneObjectNumbers.keyframe(ok)).isEqualTo(ok)
    }
}
