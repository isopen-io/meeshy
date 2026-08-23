package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryTransitionKind
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the foreground layer's clip-transition wiring — the pure
 * decision the Compose canvas delegates to via [StoryForegroundMediaView.animated].
 * A layer that participates in a crossfade/dissolve must fold the transition's
 * opacity ramp into its rendered opacity; a layer with neither keyframes nor a
 * transition must render as its static projection.
 */
@RunWith(JUnit4::class)
class StoryForegroundTransitionTest {

    private fun layer(
        id: String = "A",
        startTime: Double = 0.0,
        duration: Double = 0.0,
        opacity: Double = 1.0,
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
        keyframes = keyframes,
        clipTransitions = clipTransitions,
    )

    private fun crossfade(from: String, to: String, duration: Float) = StoryClipTransition(
        id = "$from->$to", fromClipId = from, toClipId = to,
        kind = StoryTransitionKind.CROSSFADE, duration = duration,
    )

    @Test
    fun `a layer with no keyframes and no transitions animates to itself unchanged`() {
        val still = layer()
        assertThat(still.animated(atSeconds = 3f)).isEqualTo(still)
    }

    @Test
    fun `an incoming layer folds the crossfade ramp into its opacity`() {
        val incoming = layer(
            id = "B",
            startTime = 3.0,
            duration = 4.0,
            clipTransitions = listOf(crossfade(from = "A", to = "B", duration = 2f)),
        )
        // At the midpoint of the incoming ramp (playhead 4, window [3,5]) → 0.5.
        assertThat(incoming.animated(atSeconds = 4f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `an outgoing layer folds the fade-out into its opacity`() {
        val outgoing = layer(
            id = "A",
            startTime = 0.0,
            duration = 4.0,
            clipTransitions = listOf(crossfade(from = "A", to = "B", duration = 2f)),
        )
        // A outgoing, window tail [2,4], midpoint 3 → 0.5.
        assertThat(outgoing.animated(atSeconds = 3f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a transitioning layer with zero duration is left untouched (degenerate window guard)`() {
        // A clip that participates in a transition but carries no duration must not be
        // hidden by the window-clip (end == start would make it invisible almost always).
        val degenerate = layer(
            id = "A",
            duration = 0.0,
            clipTransitions = listOf(crossfade(from = "A", to = "B", duration = 2f)),
        )
        assertThat(degenerate.animated(atSeconds = 1f)).isEqualTo(degenerate)
    }

    @Test
    fun `a layer not named in any transition keeps its base opacity`() {
        val bystander = layer(
            id = "C",
            duration = 4.0,
            opacity = 1.0,
            clipTransitions = listOf(crossfade(from = "A", to = "B", duration = 2f)),
        )
        // C never appears in the transition; inside its window it is fully opaque and unchanged.
        assertThat(bystander.animated(atSeconds = 2f)).isEqualTo(bystander)
    }

    @Test
    fun `keyframe opacity and transition opacity multiply`() {
        val both = layer(
            id = "B",
            startTime = 0.0,
            duration = 10.0,
            keyframes = listOf(
                StoryKeyframe(time = 0f, opacity = 0.0),
                StoryKeyframe(time = 10f, opacity = 1.0),
            ),
            clipTransitions = listOf(crossfade(from = "A", to = "B", duration = 10f)),
        )
        // Keyframe opacity at t=5 → 0.5; incoming crossfade at t=5 (window [0,10]) → 0.5; product → 0.25.
        val mid = both.animated(atSeconds = 5f)
        assertThat(mid.opacity).isWithin(1e-4).of(0.25)
    }
}
