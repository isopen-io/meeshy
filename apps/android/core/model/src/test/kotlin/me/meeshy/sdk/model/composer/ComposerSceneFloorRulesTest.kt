package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundTransform
import org.junit.Test

/** Le sol de la scène se recalcule par CLÉ : ce qui change le hachage, et rien de ce qu'un geste déplace (#8370). */
class ComposerSceneFloorRulesTest {

    private fun key(
        slideId: String = "s1",
        background: String? = "ff0000",
        media: List<String> = listOf("m1"),
        texts: List<String> = listOf("t1"),
        transform: StoryBackgroundTransform? = null,
        imagesVersion: Long = 0,
    ) = ComposerSceneFloorRules.key(slideId, background, media, texts, transform, imagesVersion)

    @Test
    fun `the same scene yields an equal key`() {
        assertThat(key()).isEqualTo(key())
        assertThat(key().hashCode()).isEqualTo(key().hashCode())
    }

    @Test
    fun `adding an object or changing the background or the images changes the key`() {
        assertThat(key(media = listOf("m1", "m2"))).isNotEqualTo(key())
        assertThat(key(texts = emptyList())).isNotEqualTo(key())
        assertThat(key(background = "00ff00")).isNotEqualTo(key())
        assertThat(key(imagesVersion = 1)).isNotEqualTo(key())
        assertThat(key(slideId = "s2")).isNotEqualTo(key())
    }

    @Test
    fun `moving or scaling the background does not change the key`() {
        val moved = StoryBackgroundTransform(scale = 2.0, offsetX = 40.0, offsetY = -3.0, rotation = 12.0)
        assertThat(key(transform = moved)).isEqualTo(key())
    }

    @Test
    fun `the framing and the backdrop change the key`() {
        assertThat(key(transform = StoryBackgroundTransform(videoFitMode = "fit"))).isNotEqualTo(key())
        assertThat(key(transform = StoryBackgroundTransform(backdrop = "black"))).isNotEqualTo(key())
    }

    @Test
    fun `a fitted background media lets the chosen solid backdrop reach the floor`() {
        val fitted = StoryBackgroundTransform(videoFitMode = "fit", backdrop = "indigo")
        assertThat(ComposerSceneFloorRules.backdropHex(hasBackgroundMedia = true, transform = fitted)).isEqualTo("312E81")
    }

    @Test
    fun `the blur backdrop keeps the hash and a filled media has no solid backdrop`() {
        assertThat(ComposerSceneFloorRules.backdropHex(true, StoryBackgroundTransform(videoFitMode = "fit"))).isNull()
        assertThat(ComposerSceneFloorRules.backdropHex(true, StoryBackgroundTransform(backdrop = "black"))).isNull()
        assertThat(ComposerSceneFloorRules.backdropHex(false, StoryBackgroundTransform(videoFitMode = "fit", backdrop = "black"))).isNull()
    }
}
