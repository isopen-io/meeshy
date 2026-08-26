package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryTransitionKind
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the foreground layer's fadeIn/fadeOut envelope wiring — the
 * decision the Compose canvas delegates to via [StoryForegroundMediaView.animated].
 * A timed clip that authored a fade must ramp its own opacity; the envelope
 * OVERRIDES a keyframe opacity (iOS `fade ?? keyframeOpacity ?? base`) and still
 * multiplies with a clip-transition ramp.
 */
@RunWith(JUnit4::class)
class StoryForegroundFadeTest {

    private fun layer(
        id: String = "A",
        startTime: Double = 0.0,
        duration: Double = 0.0,
        opacity: Double = 1.0,
        fadeIn: Double = 0.0,
        fadeOut: Double = 0.0,
        keyframes: List<StoryKeyframe> = emptyList(),
        clipTransitions: List<StoryClipTransition> = emptyList(),
    ) = StoryForegroundMediaView(
        id = id,
        url = "http://cdn/fg.mp4",
        isVideo = true,
        x = 0.5,
        y = 0.5,
        scale = 1.0,
        aspectRatio = 1.0,
        opacity = opacity,
        startTime = startTime,
        duration = duration,
        fadeIn = fadeIn,
        fadeOut = fadeOut,
        keyframes = keyframes,
        clipTransitions = clipTransitions,
    )

    private fun crossfade(from: String, to: String, duration: Float) = StoryClipTransition(
        id = "$from->$to", fromClipId = from, toClipId = to,
        kind = StoryTransitionKind.CROSSFADE, duration = duration,
    )

    @Test
    fun `a fade-in-only clip folds the envelope into its opacity`() {
        val clip = layer(startTime = 0.0, duration = 10.0, fadeIn = 2.0)
        // Mid fade-in (t=1, window [0,10]) → 0.5.
        assertThat(clip.animated(atSeconds = 1f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a fade-out clip folds the tail ramp into its opacity`() {
        val clip = layer(startTime = 0.0, duration = 4.0, fadeOut = 2.0)
        // Tail (t=3, window [0,4], fadeOut 2) → 0.5.
        assertThat(clip.animated(atSeconds = 3f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a fade envelope overrides an authored keyframe opacity`() {
        val clip = layer(
            startTime = 0.0,
            duration = 10.0,
            fadeIn = 2.0,
            keyframes = listOf(
                StoryKeyframe(time = 0f, x = 0.0, opacity = 0.0),
                StoryKeyframe(time = 10f, x = 1.0, opacity = 1.0),
            ),
        )
        val mid = clip.animated(atSeconds = 1f)
        // Keyframe opacity at t=1 would be 0.1; the fade envelope (0.5) wins outright,
        // NOT the product 0.05.
        assertThat(mid.opacity).isWithin(1e-4).of(0.5)
        // Position keyframes still animate — only opacity is taken from the envelope.
        assertThat(mid.x).isWithin(1e-4).of(0.1)
    }

    @Test
    fun `a fade envelope multiplies with a clip-transition ramp`() {
        val incoming = layer(
            id = "B",
            startTime = 0.0,
            duration = 10.0,
            fadeIn = 2.0,
            clipTransitions = listOf(crossfade(from = "A", to = "B", duration = 10f)),
        )
        // Fade-in at t=1 → 0.5; incoming crossfade at t=1 (window [0,10]) → 0.1; product → 0.05.
        assertThat(incoming.animated(atSeconds = 1f).opacity).isWithin(1e-4).of(0.05)
    }

    @Test
    fun `outside its window a fade clip renders unchanged`() {
        val clip = layer(startTime = 3.0, duration = 4.0, fadeIn = 2.0)
        // Before the window there is no envelope, no keyframe, no transition → identity.
        assertThat(clip.animated(atSeconds = 1f)).isEqualTo(clip)
    }

    @Test
    fun `a clip with no fade and no keyframes and no transition is unchanged`() {
        val clip = layer(startTime = 0.0, duration = 10.0)
        assertThat(clip.animated(atSeconds = 5f)).isEqualTo(clip)
    }

    @Test
    fun `an untimed foreground clip is visible at every playhead`() {
        val clip = layer(startTime = 0.0, duration = 0.0)
        assertThat(clip.isVisible(atSeconds = 0f)).isTrue()
        assertThat(clip.isVisible(atSeconds = 999f)).isTrue()
    }

    @Test
    fun `a timed foreground clip is gated to its own window`() {
        val clip = layer(startTime = 3.0, duration = 4.0)
        assertThat(clip.isVisible(atSeconds = 2f)).isFalse()
        assertThat(clip.isVisible(atSeconds = 3f)).isTrue()
        assertThat(clip.isVisible(atSeconds = 6.9f)).isTrue()
        assertThat(clip.isVisible(atSeconds = 7f)).isFalse()
    }
}
