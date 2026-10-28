package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.SceneObjectNumbers
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Le média de premier plan, le nombre d'objets et la longueur d'un texte d'une story publiée par un tiers sont des
 * données non fiables, au même titre que la police ou la position d'un texte (#13581) : le lecteur ne doit ni lever,
 * ni geler, ni allouer sans borne.
 */
@RunWith(JUnit4::class)
class StoryHostileSceneNumbersTest {

    private fun foreground(
        x: Double = 0.5,
        y: Double = 0.5,
        scale: Double = 1.0,
        aspectRatio: Double = 1.0,
        opacity: Double = 1.0,
        startTime: Double = 0.0,
        duration: Double = 0.0,
        fadeIn: Double = 0.0,
        fadeOut: Double = 0.0,
        keyframes: List<StoryKeyframe> = emptyList(),
    ) = StoryForegroundMediaView(
        id = "fg", url = "http://cdn/fg.jpg", isVideo = false,
        x = x, y = y, scale = scale, aspectRatio = aspectRatio, opacity = opacity,
        startTime = startTime, duration = duration, fadeIn = fadeIn, fadeOut = fadeOut, keyframes = keyframes,
    )

    private val hostile = listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 1e308, -1e308, -5.0, 0.0)

    @Test
    fun `a hostile foreground media is bounded at projection`() {
        hostile.forEach { v ->
            val view = foreground(x = v, y = v, scale = v, aspectRatio = v, opacity = v, startTime = v, duration = v, fadeIn = v, fadeOut = v).bounded()
            listOf(view.x, view.y, view.scale, view.aspectRatio, view.opacity, view.startTime, view.duration, view.fadeIn, view.fadeOut)
                .forEach { assertThat(it.isFinite()).isTrue() }
            assertThat(view.x).isIn(com.google.common.collect.Range.closed(SceneObjectNumbers.MIN_POSITION, SceneObjectNumbers.MAX_POSITION))
            assertThat(view.aspectRatio).isIn(com.google.common.collect.Range.closed(SceneObjectNumbers.MIN_ASPECT_RATIO, SceneObjectNumbers.MAX_ASPECT_RATIO))
            assertThat(view.opacity).isIn(com.google.common.collect.Range.closed(0.0, 1.0))
        }
    }

    @Test
    fun `a legitimate foreground media crosses the bounds unchanged`() {
        val legit = foreground(x = 0.3, y = 0.7, scale = 1.5, aspectRatio = 0.5625, opacity = 0.8, startTime = 1.0, duration = 4.0)
        assertThat(legit.bounded()).isEqualTo(legit)
    }

    @Test
    fun `overflowing media keyframes animate to finite numbers`() {
        val layer = foreground(
            keyframes = listOf(
                StoryKeyframe(time = 0f, x = 0.5, y = 0.5, scale = 1.0, opacity = 1.0),
                StoryKeyframe(time = 1f, x = 1e308, y = 1e308, scale = 1e308, opacity = 1e308),
                StoryKeyframe(time = 2f, x = -1e308, y = -1e308, scale = -1e308, opacity = -1e308),
            ),
        )
        listOf(0.5f, 1f, 1.5f, 2f, 3f).forEach { t ->
            listOf(layer, layer.bounded()).forEach { candidate ->
                val at = candidate.animated(t)
                listOf(at.x, at.y, at.scale, at.opacity).forEach { assertThat(it.isFinite()).isTrue() }
                assertThat(at.opacity).isIn(com.google.common.collect.Range.closed(0.0, 1.0))
            }
        }
    }

    @Test
    fun `stickers and audio chips beyond the family cap are not projected`() {
        val many = SceneObjectNumbers.MAX_OBJECTS_PER_FAMILY + 500
        val effects = StoryEffects(
            stickerObjects = List(many) { StorySticker(id = "s$it", emoji = "🔥") },
            audioPlayerObjects = List(many) { StoryAudioPlayerObject(id = "a$it") },
        )
        assertThat(StorySceneObjectsProjection.stickers(effects) { null }).hasSize(SceneObjectNumbers.MAX_OBJECTS_PER_FAMILY)
        assertThat(StorySceneObjectsProjection.audioChips(effects)).hasSize(SceneObjectNumbers.MAX_OBJECTS_PER_FAMILY)
    }

    @Test
    fun `a huge published text is cut to a bounded length without splitting a surrogate pair`() {
        val huge = "a" + "😀".repeat(SceneObjectNumbers.MAX_TEXT_CHARS)
        val view = StoryTextObjectProjection.project(StoryTextObject(id = "t", text = huge), preferredLanguages = emptyList())
        assertThat(view.text.length).isAtMost(SceneObjectNumbers.MAX_TEXT_CHARS)
        assertThat(view.text.last().isHighSurrogate()).isFalse()
        val legit = "Bonjour à tous"
        assertThat(StoryTextObjectProjection.project(StoryTextObject(id = "t", text = legit), preferredLanguages = emptyList()).text).isEqualTo(legit)
    }
}
