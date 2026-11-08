package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

/**
 * Un fond recadré se peint comme iOS (`CALayer.contentsRect` puis aspect-fill) : la fenêtre gardée de la source remplit la
 * scène 9:16 par un agrandissement UNIFORME, jamais étirée, et son centre vient au centre de la scène. La mesure de la
 * source le permet ; sans elle, la projection d'avant reste.
 */
class StoryBackgroundCropFillTest {

    private val scene = 9.0 / 16.0

    private fun background(crop: StoryMediaCrop?, scale: Double = 1.0, x: Double = 0.5, y: Double = 0.5) =
        StoryMediaObject(id = "bg", isBackground = true, crop = crop, scale = scale, x = x, y = y)

    @Test
    fun `a square kept from a portrait photo fills the scene without being stretched`() {
        val square = StoryMediaCrop(x = 0.0, y = 0.21875, width = 1.0, height = 0.5625)

        val layer = StoryBackgroundObjectTransform.from(background(square), sourceAspect = scene)

        assertThat(layer.scaleX).isEqualTo(layer.scaleY)
        assertThat(layer.scaleX.toDouble()).isWithin(1e-4).of(16.0 / 9.0)
        assertThat(layer.offsetXFraction.toDouble()).isWithin(1e-4).of(0.0)
        assertThat(layer.offsetYFraction.toDouble()).isWithin(1e-4).of(0.0)
    }

    @Test
    fun `an off-centre window is brought to the centre of the scene, at the scale that fills it`() {
        val top = StoryMediaCrop(x = 0.0, y = 0.0, width = 1.0, height = 0.5)

        val layer = StoryBackgroundObjectTransform.from(background(top), sourceAspect = scene)

        assertThat(layer.scaleX.toDouble()).isWithin(1e-4).of(2.0)
        assertThat(layer.scaleY.toDouble()).isWithin(1e-4).of(2.0)
        assertThat(layer.offsetYFraction.toDouble()).isWithin(1e-4).of(0.5)
        assertThat(layer.offsetXFraction.toDouble()).isWithin(1e-4).of(0.0)
    }

    @Test
    fun `a landscape source cropped to the scene's own ratio keeps it, the author's pan and zoom on top`() {
        val story = StoryMediaCrop(x = 0.0, y = 0.0, width = 9.0 / 16.0 / (16.0 / 9.0), height = 1.0)

        val layer = StoryBackgroundObjectTransform.from(background(story, scale = 1.5, x = 0.6), sourceAspect = 16.0 / 9.0)

        assertThat(layer.scaleX.toDouble()).isWithin(1e-4).of(1.5)
        assertThat(layer.scaleY.toDouble()).isWithin(1e-4).of(1.5)
        val shownWidth = (16.0 / 9.0) / scene
        val centre = (story.width / 2 - 0.5) * shownWidth
        assertThat(layer.offsetXFraction.toDouble()).isWithin(1e-4).of(0.1 - centre)
    }

    @Test
    fun `without the measure of the source, or without a crop, the former projection holds`() {
        val top = StoryMediaCrop(x = 0.0, y = 0.0, width = 1.0, height = 0.5)

        assertThat(StoryBackgroundObjectTransform.from(background(top), sourceAspect = null)).isEqualTo(StoryBackgroundObjectTransform.from(background(top)))
        assertThat(StoryBackgroundObjectTransform.from(background(null, scale = 2.0), sourceAspect = scene))
            .isEqualTo(StoryBackgroundObjectTransform.from(background(null, scale = 2.0)))
    }
}
