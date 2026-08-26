package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure per-channel keyframe resolver — the Android port of iOS's
 * `ReaderKeyframeResolver`. A wire keyframe keys any subset of x/y/scale/opacity independently;
 * the resolver interpolates each present channel and falls back to the clip's static base for the
 * rest, returning null only when there is genuinely nothing to animate.
 */
@RunWith(JUnit4::class)
class StoryKeyframeResolverTest {

    private fun kf(
        time: Float,
        x: Double? = null,
        y: Double? = null,
        scale: Double? = null,
        opacity: Double? = null,
        easing: StoryEasing? = null,
    ) = StoryKeyframe(time = time, x = x, y = y, scale = scale, opacity = opacity, easing = easing)

    @Test
    fun `null keyframes resolve to null - nothing to animate`() {
        assertThat(StoryKeyframeResolver.resolve(keyframes = null, currentTime = 1f)).isNull()
    }

    @Test
    fun `an empty keyframe list resolves to null`() {
        assertThat(StoryKeyframeResolver.resolve(keyframes = emptyList(), currentTime = 1f)).isNull()
    }

    @Test
    fun `keyframes that key no channel at all resolve to null`() {
        val frames = listOf(kf(time = 0f), kf(time = 5f))
        assertThat(StoryKeyframeResolver.resolve(keyframes = frames, currentTime = 2f)).isNull()
    }

    @Test
    fun `a keyed channel animates while unkeyed channels hold their base`() {
        val frames = listOf(kf(time = 0f, x = 0.0), kf(time = 10f, x = 1.0))
        val resolved = StoryKeyframeResolver.resolve(
            keyframes = frames,
            currentTime = 5f,
            baseX = 0.9,
            baseY = 0.2,
            baseScale = 0.3,
            baseOpacity = 0.4,
        )!!
        assertThat(resolved.x).isWithin(1e-4).of(0.5)
        assertThat(resolved.y).isEqualTo(0.2)
        assertThat(resolved.scale).isEqualTo(0.3)
        assertThat(resolved.opacity).isEqualTo(0.4)
    }

    @Test
    fun `each of the four channels interpolates on its own points`() {
        val frames = listOf(
            kf(time = 0f, x = 0.0, y = 0.0, scale = 1.0, opacity = 0.0),
            kf(time = 10f, x = 1.0, y = 0.5, scale = 2.0, opacity = 1.0),
        )
        val resolved = StoryKeyframeResolver.resolve(keyframes = frames, currentTime = 5f)!!
        assertThat(resolved.x).isWithin(1e-4).of(0.5)
        assertThat(resolved.y).isWithin(1e-4).of(0.25)
        assertThat(resolved.scale).isWithin(1e-4).of(1.5)
        assertThat(resolved.opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `keyframe times are offsets from startTime for every channel`() {
        // Two clips, one keying opacity and one keying position, both shifted by startTime = 2.
        // At the shifted origin (currentTime == startTime) every channel sits on its first point.
        val frames = listOf(
            kf(time = 0f, x = 0.2, opacity = 0.0),
            kf(time = 4f, x = 0.8, opacity = 1.0),
        )
        val atOrigin = StoryKeyframeResolver.resolve(
            keyframes = frames,
            currentTime = 2f,
            startTime = 2f,
        )!!
        assertThat(atOrigin.x).isWithin(1e-4).of(0.2)
        assertThat(atOrigin.opacity).isWithin(1e-4).of(0.0)

        // Halfway through the shifted window: currentTime 4 -> local 2 -> u = 0.5 on both channels.
        val atMidpoint = StoryKeyframeResolver.resolve(
            keyframes = frames,
            currentTime = 4f,
            startTime = 2f,
        )!!
        assertThat(atMidpoint.x).isWithin(1e-4).of(0.5)
        assertThat(atMidpoint.opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a keyframe with no easing interpolates linearly`() {
        val frames = listOf(kf(time = 0f, scale = 0.0), kf(time = 8f, scale = 4.0))
        val resolved = StoryKeyframeResolver.resolve(keyframes = frames, currentTime = 2f)!!
        assertThat(resolved.scale).isWithin(1e-4).of(1.0)
    }

    @Test
    fun `a keyframe's easing shapes its own channel's ramp`() {
        val frames = listOf(
            kf(time = 0f, opacity = 0.0, easing = StoryEasing.EASE_IN),
            kf(time = 10f, opacity = 1.0),
        )
        // u = 0.5, EASE_IN(0.5) = 0.25.
        val resolved = StoryKeyframeResolver.resolve(keyframes = frames, currentTime = 5f)!!
        assertThat(resolved.opacity).isWithin(1e-4).of(0.25)
    }
}
