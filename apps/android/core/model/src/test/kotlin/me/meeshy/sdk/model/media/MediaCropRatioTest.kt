package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaCrop
import org.junit.Test

class MediaCropRatioTest {

    private fun realRatio(crop: StoryMediaCrop, source: Double) = source * crop.width / crop.height

    @Test
    fun `la liste est servie dans l ordre libre puis portraits puis paysages`() {
        assertThat(MediaCropRatio.entries.map { it.notation }).containsExactly(
            null, "1:1", "4:5", "3:4", "9:16", "4:3", "16:9",
        ).inOrder()
    }

    @Test
    fun `libre rend le cadre entier`() {
        assertThat(MediaCropRule.centered(MediaCropRatio.FREE, 1.5)).isEqualTo(StoryMediaCrop.FULL)
    }

    @Test
    fun `un 9 16 sur une source 16 9 est un rectangle centre de rapport reel 9 16`() {
        val crop = MediaCropRule.centered(MediaCropRatio.PORTRAIT_9_16, 16.0 / 9.0)
        assertThat(crop.height).isEqualTo(1.0)
        assertThat(crop.width).isWithin(1e-9).of(0.31640625)
        assertThat(crop.x).isWithin(1e-9).of((1 - crop.width) / 2)
        assertThat(realRatio(crop, 16.0 / 9.0)).isWithin(1e-9).of(9.0 / 16.0)
    }

    @Test
    fun `un 16 9 sur un portrait garde la pleine largeur et se centre en hauteur`() {
        val crop = MediaCropRule.centered(MediaCropRatio.LANDSCAPE_16_9, 0.5)
        assertThat(crop.width).isEqualTo(1.0)
        assertThat(crop.y).isWithin(1e-9).of((1 - crop.height) / 2)
        assertThat(realRatio(crop, 0.5)).isWithin(1e-9).of(16.0 / 9.0)
    }

    @Test
    fun `chaque ratio donne un rectangle normalise du bon rapport`() {
        MediaCropRatio.entries.filter { it.value != null }.forEach { ratio ->
            listOf(0.5, 1.0, 1.78, 3.0).forEach { source ->
                val crop = MediaCropRule.centered(ratio, source)
                assertThat(crop.x).isAtLeast(0.0)
                assertThat(crop.x + crop.width).isAtMost(1.0 + 1e-9)
                assertThat(crop.y + crop.height).isAtMost(1.0 + 1e-9)
                assertThat(realRatio(crop, source)).isWithin(1e-6).of(ratio.value!!)
            }
        }
    }

    @Test
    fun `une source illisible rend le cadre entier`() {
        assertThat(MediaCropRule.centered(MediaCropRatio.SQUARE, 0.0)).isEqualTo(StoryMediaCrop.FULL)
        assertThat(MediaCropRule.centered(MediaCropRatio.SQUARE, Double.NaN)).isEqualTo(StoryMediaCrop.FULL)
    }
}
