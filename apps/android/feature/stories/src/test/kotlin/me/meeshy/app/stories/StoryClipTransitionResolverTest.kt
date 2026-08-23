package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryTransitionKind
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for [StoryClipTransitionResolver] — the Android port of iOS's
 * `ReaderTransitionResolver.opacity` + its canonical primitive
 * `StoryRenderer.clipTransitionOpacity`. The resolver decides how visible a canvas
 * clip is at a playback instant given the slide's inter-clip crossfade/dissolve
 * transitions: the OUTGOING clip fades out, the INCOMING clip fades in, over the
 * transition's own duration window; a clip outside its own `[start, end]` timing
 * window is invisible.
 */
@RunWith(JUnit4::class)
class StoryClipTransitionResolverTest {

    private fun crossfade(
        from: String,
        to: String,
        duration: Float,
    ) = StoryClipTransition(
        id = "$from->$to",
        fromClipId = from,
        toClipId = to,
        kind = StoryTransitionKind.CROSSFADE,
        duration = duration,
    )

    // ---- crossfadeFactor (the canonical primitive) ----

    @Test
    fun `crossfade outgoing clip fades from full to zero across the window`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 2f))
        // transitionStart = 0, window [0, 2]. Outgoing A: 1 - progress.
        assertThat(StoryClipTransitionResolver.crossfadeFactor("A", transitions, transitionStart = 0.0, at = 0.0))
            .isWithin(1e-6).of(1.0)
        assertThat(StoryClipTransitionResolver.crossfadeFactor("A", transitions, transitionStart = 0.0, at = 1.0))
            .isWithin(1e-6).of(0.5)
        assertThat(StoryClipTransitionResolver.crossfadeFactor("A", transitions, transitionStart = 0.0, at = 2.0))
            .isWithin(1e-6).of(0.0)
    }

    @Test
    fun `crossfade incoming clip fades from zero to full across the window`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 2f))
        assertThat(StoryClipTransitionResolver.crossfadeFactor("B", transitions, transitionStart = 0.0, at = 0.0))
            .isWithin(1e-6).of(0.0)
        assertThat(StoryClipTransitionResolver.crossfadeFactor("B", transitions, transitionStart = 0.0, at = 1.0))
            .isWithin(1e-6).of(0.5)
        assertThat(StoryClipTransitionResolver.crossfadeFactor("B", transitions, transitionStart = 0.0, at = 2.0))
            .isWithin(1e-6).of(1.0)
    }

    @Test
    fun `a clip in neither role is opaque during a crossfade`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 2f))
        assertThat(StoryClipTransitionResolver.crossfadeFactor("C", transitions, transitionStart = 0.0, at = 1.0))
            .isWithin(1e-6).of(1.0)
    }

    @Test
    fun `before the transition window a clip is opaque`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 2f))
        assertThat(StoryClipTransitionResolver.crossfadeFactor("A", transitions, transitionStart = 5.0, at = 4.0))
            .isWithin(1e-6).of(1.0)
    }

    @Test
    fun `after the transition window a clip is opaque`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 2f))
        assertThat(StoryClipTransitionResolver.crossfadeFactor("A", transitions, transitionStart = 0.0, at = 3.0))
            .isWithin(1e-6).of(1.0)
    }

    @Test
    fun `a dissolve transition is opaque in the raw primitive`() {
        // The primitive handles crossfade only; dissolve is normalised upstream, so
        // fed to the primitive as-is it must be treated as opaque (no NaN, no ramp).
        val dissolve = StoryClipTransition(
            id = "d", fromClipId = "A", toClipId = "B",
            kind = StoryTransitionKind.DISSOLVE, duration = 2f,
        )
        assertThat(StoryClipTransitionResolver.crossfadeFactor("A", listOf(dissolve), transitionStart = 0.0, at = 1.0))
            .isWithin(1e-6).of(1.0)
    }

    @Test
    fun `a zero-duration transition is opaque and never divides by zero`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 0f))
        val factor = StoryClipTransitionResolver.crossfadeFactor("A", transitions, transitionStart = 0.0, at = 0.0)
        assertThat(factor).isWithin(1e-6).of(1.0)
    }

    @Test
    fun `an empty transition list is opaque`() {
        assertThat(StoryClipTransitionResolver.crossfadeFactor("A", emptyList(), transitionStart = 0.0, at = 1.0))
            .isWithin(1e-6).of(1.0)
    }

    // ---- opacity (the reader resolver: window clip + dissolve degrade + multiply) ----

    @Test
    fun `outside the clip's own timing window before start the clip is invisible`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 1f))
        val o = StoryClipTransitionResolver.opacity("A", startTime = 2.0, duration = 4.0, transitions, currentTime = 1.0)
        assertThat(o).isWithin(1e-6).of(0.0)
    }

    @Test
    fun `outside the clip's own timing window after end the clip is invisible`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 1f))
        val o = StoryClipTransitionResolver.opacity("A", startTime = 0.0, duration = 4.0, transitions, currentTime = 5.0)
        assertThat(o).isWithin(1e-6).of(0.0)
    }

    @Test
    fun `within the window a clip in no transition is fully opaque`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 1f))
        val o = StoryClipTransitionResolver.opacity("C", startTime = 0.0, duration = 4.0, transitions, currentTime = 2.0)
        assertThat(o).isWithin(1e-6).of(1.0)
    }

    @Test
    fun `an incoming clip fades in from the start of its window`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 2f))
        // B is incoming: transitionStart = its startTime = 3. Window [3, 5].
        assertThat(StoryClipTransitionResolver.opacity("B", startTime = 3.0, duration = 4.0, transitions, currentTime = 3.0))
            .isWithin(1e-6).of(0.0)
        assertThat(StoryClipTransitionResolver.opacity("B", startTime = 3.0, duration = 4.0, transitions, currentTime = 4.0))
            .isWithin(1e-6).of(0.5)
        // Past the transition window, still inside the clip's own window → fully in.
        assertThat(StoryClipTransitionResolver.opacity("B", startTime = 3.0, duration = 4.0, transitions, currentTime = 6.0))
            .isWithin(1e-6).of(1.0)
    }

    @Test
    fun `an outgoing clip fades out at the tail of its own window`() {
        val transitions = listOf(crossfade(from = "A", to = "B", duration = 2f))
        // A outgoing: startTime 0, duration 4 → end 4. transitionStart = end - 2 = 2. Window [2, 4].
        assertThat(StoryClipTransitionResolver.opacity("A", startTime = 0.0, duration = 4.0, transitions, currentTime = 1.0))
            .isWithin(1e-6).of(1.0)
        assertThat(StoryClipTransitionResolver.opacity("A", startTime = 0.0, duration = 4.0, transitions, currentTime = 3.0))
            .isWithin(1e-6).of(0.5)
        assertThat(StoryClipTransitionResolver.opacity("A", startTime = 0.0, duration = 4.0, transitions, currentTime = 4.0))
            .isWithin(1e-6).of(0.0)
    }

    @Test
    fun `a dissolve is degraded to a crossfade ramp for live playback`() {
        val dissolve = StoryClipTransition(
            id = "d", fromClipId = "A", toClipId = "B",
            kind = StoryTransitionKind.DISSOLVE, duration = 2f,
        )
        // Same ramp as a crossfade would produce: A outgoing at midpoint → 0.5.
        val o = StoryClipTransitionResolver.opacity("A", startTime = 0.0, duration = 4.0, listOf(dissolve), currentTime = 3.0)
        assertThat(o).isWithin(1e-6).of(0.5)
    }

    @Test
    fun `stacked transitions for one clip multiply their factors`() {
        // Clip M is incoming on one crossfade and outgoing on another, both active at the
        // same instant → the two ramps multiply. M window [0, 4].
        val incoming = crossfade(from = "L", to = "M", duration = 4f)   // transitionStart = 0, at 2 → 0.5
        val outgoing = crossfade(from = "M", to = "N", duration = 4f)   // transitionStart = 4-4 = 0, at 2 → 0.5
        val o = StoryClipTransitionResolver.opacity("M", startTime = 0.0, duration = 4.0, listOf(incoming, outgoing), currentTime = 2.0)
        assertThat(o).isWithin(1e-6).of(0.25)
    }

    @Test
    fun `with no transitions a clip inside its window is opaque`() {
        val o = StoryClipTransitionResolver.opacity("A", startTime = 0.0, duration = 4.0, emptyList(), currentTime = 2.0)
        assertThat(o).isWithin(1e-6).of(1.0)
    }
}
