package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryKeyframe
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the foreground layer's playback wiring — the pure decision the Compose
 * canvas delegates to. A layer with no keyframes must render exactly as its static projection; a
 * keyed layer must follow its animation for the ticked instant. The Composable only ticks the clock
 * and reads the result, so the "what transform now" decision is unit-tested here.
 */
@RunWith(JUnit4::class)
class StoryForegroundKeyframeTest {

    private fun layer(
        keyframes: List<StoryKeyframe> = emptyList(),
        startTime: Double = 0.0,
    ) = StoryForegroundMediaView(
        id = "fg",
        url = "http://cdn/fg.mp4",
        isVideo = true,
        x = 0.5,
        y = 0.5,
        scale = 1.0,
        aspectRatio = 1.0,
        opacity = 1.0,
        startTime = startTime,
        keyframes = keyframes,
    )

    @Test
    fun `a layer with no keyframes animates to itself unchanged`() {
        val still = layer()
        assertThat(still.animated(atSeconds = 3f)).isEqualTo(still)
    }

    @Test
    fun `keyframes that key no channel leave the layer unchanged`() {
        val untouched = layer(keyframes = listOf(StoryKeyframe(time = 0f), StoryKeyframe(time = 5f)))
        assertThat(untouched.animated(atSeconds = 2f)).isEqualTo(untouched)
    }

    @Test
    fun `a keyed layer follows its animation at the ticked instant`() {
        val animatedLayer = layer(
            keyframes = listOf(
                StoryKeyframe(time = 0f, x = 0.0, opacity = 0.0),
                StoryKeyframe(time = 10f, x = 1.0, opacity = 1.0),
            ),
        )
        val midway = animatedLayer.animated(atSeconds = 5f)
        assertThat(midway.x).isWithin(1e-4).of(0.5)
        assertThat(midway.opacity).isWithin(1e-4).of(0.5)
        // Unkeyed channels keep the layer's static base.
        assertThat(midway.y).isEqualTo(0.5)
        assertThat(midway.scale).isEqualTo(1.0)
        // Identity fields are preserved through the animated copy.
        assertThat(midway.url).isEqualTo("http://cdn/fg.mp4")
        assertThat(midway.isVideo).isTrue()
    }

    @Test
    fun `the layer's startTime offsets its keyframe clock`() {
        val shifted = layer(
            startTime = 2.0,
            keyframes = listOf(
                StoryKeyframe(time = 0f, scale = 1.0),
                StoryKeyframe(time = 4f, scale = 3.0),
            ),
        )
        // At the clip's own origin (playhead == startTime) it sits on the first point.
        assertThat(shifted.animated(atSeconds = 2f).scale).isWithin(1e-4).of(1.0)
        // Halfway through the shifted window.
        assertThat(shifted.animated(atSeconds = 4f).scale).isWithin(1e-4).of(2.0)
    }
}
