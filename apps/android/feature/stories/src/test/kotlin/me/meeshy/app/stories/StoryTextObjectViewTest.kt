package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryKeyframe
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the text-object layer's animation wiring — the decision the
 * Compose canvas delegates to via [StoryTextObjectView.animated]. A timed text
 * object animates its transform through its keyframes and ramps its opacity through
 * its own fadeIn/fadeOut envelope, the envelope OVERRIDING a keyframe opacity
 * (iOS `fade ?? keyframeOpacity ?? base`). Unlike a media clip, a text object never
 * participates in a clip transition, so no transition ramp is folded here.
 */
@RunWith(JUnit4::class)
class StoryTextObjectViewTest {

    private fun textObject(
        id: String = "T",
        opacity: Double = 1.0,
        startTime: Double = 0.0,
        duration: Double = 0.0,
        fadeIn: Double = 0.0,
        fadeOut: Double = 0.0,
        keyframes: List<StoryKeyframe> = emptyList(),
    ) = StoryTextObjectView(
        id = id,
        text = "hello",
        x = 0.5,
        y = 0.5,
        scale = 1.0,
        rotation = 0.0,
        opacity = opacity,
        fontSize = 64.0,
        colorHex = "#FFFFFF",
        align = "center",
        startTime = startTime,
        duration = duration,
        fadeIn = fadeIn,
        fadeOut = fadeOut,
        keyframes = keyframes,
    )

    @Test
    fun `a text object with no fade and no keyframes is unchanged`() {
        val obj = textObject(startTime = 0.0, duration = 10.0)
        assertThat(obj.animated(atSeconds = 5f)).isEqualTo(obj)
    }

    @Test
    fun `a fade-in-only text object folds the envelope into its opacity`() {
        val obj = textObject(startTime = 0.0, duration = 10.0, fadeIn = 2.0)
        // Mid fade-in (t=1, window [0,10], fadeIn 2) -> 0.5.
        assertThat(obj.animated(atSeconds = 1f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a fade-out text object folds the tail ramp into its opacity`() {
        val obj = textObject(startTime = 0.0, duration = 4.0, fadeOut = 2.0)
        // Tail (t=3, window [0,4], fadeOut 2) -> 0.5.
        assertThat(obj.animated(atSeconds = 3f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a fade envelope overrides an authored keyframe opacity while position keeps animating`() {
        val obj = textObject(
            startTime = 0.0,
            duration = 10.0,
            fadeIn = 2.0,
            keyframes = listOf(
                StoryKeyframe(time = 0f, x = 0.0, opacity = 0.0),
                StoryKeyframe(time = 10f, x = 1.0, opacity = 1.0),
            ),
        )
        val mid = obj.animated(atSeconds = 1f)
        // Keyframe opacity at t=1 would be 0.1; the fade envelope (0.5) wins outright, NOT the product.
        assertThat(mid.opacity).isWithin(1e-4).of(0.5)
        // Position keyframes still animate — only opacity is taken from the envelope.
        assertThat(mid.x).isWithin(1e-4).of(0.1)
    }

    @Test
    fun `outside its window a fade text object renders unchanged`() {
        val obj = textObject(startTime = 3.0, duration = 4.0, fadeIn = 2.0)
        // Before the window there is no envelope, no keyframe -> identity.
        assertThat(obj.animated(atSeconds = 1f)).isEqualTo(obj)
    }

    @Test
    fun `keyframes animate position while opacity holds its base when no fade is authored`() {
        val obj = textObject(
            startTime = 0.0,
            duration = 10.0,
            opacity = 0.8,
            keyframes = listOf(
                StoryKeyframe(time = 0f, x = 0.0),
                StoryKeyframe(time = 10f, x = 1.0),
            ),
        )
        val mid = obj.animated(atSeconds = 5f)
        // Position keyframe at t=5 -> 0.5; opacity has no keyframe and no fade, so it holds the base.
        assertThat(mid.x).isWithin(1e-4).of(0.5)
        assertThat(mid.opacity).isWithin(1e-4).of(0.8)
        // An un-keyed channel holds its base too.
        assertThat(mid.scale).isWithin(1e-4).of(1.0)
    }
}
