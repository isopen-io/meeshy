package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAnchorPoint
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class SceneMediaFrameTest {
    private fun media(
        ratio: Double? = 1.0,
        anchor: StoryAnchorPoint = StoryAnchorPoint(),
        crop: StoryMediaCrop? = null,
    ) = StoryMediaObject(id = "m", aspectRatio = ratio, anchor = anchor, crop = crop)

    private fun pose(x: Double = 0.5, y: Double = 0.5, scale: Double = 1.0, rotation: Double = 0.0) =
        ScenePose(x = x, y = y, scale = scale, rotation = rotation, opacity = 1.0)

    @Test
    fun `un carre mesure la moitie de la largeur design`() {
        val frame = SceneMediaFrame.of(media(), pose())
        assertThat(frame.widthFraction).isWithin(1e-9).of(0.5)
        assertThat(frame.heightFraction).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `un portrait s inscrit dans l enveloppe de 65 pour cent`() {
        val frame = SceneMediaFrame.of(media(ratio = 0.5), pose())
        assertThat(frame.heightFraction).isWithin(1e-9).of(0.65)
        assertThat(frame.widthFraction).isWithin(1e-9).of(0.325)
    }

    @Test
    fun `l echelle multiplie la taille jusqu au plafond de mise en page puis passe au calque`() {
        val doubled = SceneMediaFrame.of(media(), pose(scale = 2.0))
        assertThat(doubled.widthFraction).isWithin(1e-9).of(1.0)
        assertThat(doubled.layerScale).isEqualTo(1f)
        val huge = SceneMediaFrame.of(media(), pose(scale = 8.0))
        assertThat(huge.widthFraction).isWithin(1e-9).of(2.0)
        assertThat(huge.layerScale).isWithin(1e-6f).of(2f)
    }

    @Test
    fun `une echelle degeneree se ramene a l identite`() {
        val frame = SceneMediaFrame.of(media(), pose(scale = -3.0))
        assertThat(frame.widthFraction).isWithin(1e-9).of(0.5)
        assertThat(SceneMediaFrame.of(media(), pose(scale = Double.NaN)).widthFraction).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `le cadre est pose sur son ancre et tourne autour d elle`() {
        val frame = SceneMediaFrame.of(media(anchor = StoryAnchorPoint(0.0, 1.0)), pose(x = 0.2, y = 0.8, rotation = 30.0), canvasAspect = 1.0)
        assertThat(frame.left).isWithin(1e-9).of(0.2)
        assertThat(frame.top).isWithin(1e-9).of(0.8 - 0.5 * 1.0)
        assertThat(frame.pivotX).isEqualTo(0f)
        assertThat(frame.pivotY).isEqualTo(1f)
        assertThat(frame.rotationDegrees).isEqualTo(30f)
    }

    @Test
    fun `un rognage change les proportions du cadre`() {
        val frame = SceneMediaFrame.of(media(ratio = 1.0, crop = StoryMediaCrop(0.0, 0.0, 0.5, 1.0)), pose())
        assertThat(frame.widthFraction / frame.heightFraction).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `un ratio inconnu se lit carre`() {
        val frame = SceneMediaFrame.of(media(ratio = null), pose())
        assertThat(frame.widthFraction).isWithin(1e-9).of(0.5)
    }
}
