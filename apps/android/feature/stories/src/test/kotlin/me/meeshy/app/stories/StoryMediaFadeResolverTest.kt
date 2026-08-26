package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for [StoryMediaFadeResolver] — the pure fadeIn/fadeOut opacity
 * envelope of a timed canvas clip, ported 1:1 from iOS
 * `StoryRenderer.fadeOpacity(item:at:)`. A clip with no fade returns `null`
 * (caller keeps its base opacity); a clip outside its own `[start, end)` window
 * returns `null`; inside, it ramps `0 → 1` over the fade-in, holds `1`, then ramps
 * `1 → 0` over the fade-out.
 */
@RunWith(JUnit4::class)
class StoryMediaFadeResolverTest {

    private fun opacity(
        fadeIn: Double? = null,
        fadeOut: Double? = null,
        startTime: Double? = 0.0,
        duration: Double? = null,
        currentTime: Double,
    ): Double? = StoryMediaFadeResolver.fadeOpacity(
        fadeIn = fadeIn,
        fadeOut = fadeOut,
        startTime = startTime,
        duration = duration,
        currentTime = currentTime,
    )

    @Test
    fun `no fade at all returns null so the caller keeps its base opacity`() {
        assertThat(opacity(fadeIn = null, fadeOut = null, duration = 10.0, currentTime = 5.0)).isNull()
    }

    @Test
    fun `zero-valued fades count as no fade and return null`() {
        assertThat(opacity(fadeIn = 0.0, fadeOut = 0.0, duration = 10.0, currentTime = 5.0)).isNull()
    }

    @Test
    fun `before the clip window returns null`() {
        assertThat(opacity(fadeIn = 1.0, startTime = 3.0, duration = 4.0, currentTime = 2.0)).isNull()
    }

    @Test
    fun `at or after the clip end returns null`() {
        assertThat(opacity(fadeOut = 1.0, startTime = 0.0, duration = 4.0, currentTime = 4.0)).isNull()
        assertThat(opacity(fadeOut = 1.0, startTime = 0.0, duration = 4.0, currentTime = 5.0)).isNull()
    }

    @Test
    fun `at the clip start the fade-in is fully transparent`() {
        assertThat(opacity(fadeIn = 2.0, startTime = 0.0, duration = 10.0, currentTime = 0.0))
            .isWithin(1e-9).of(0.0)
    }

    @Test
    fun `mid fade-in ramps linearly toward opaque`() {
        assertThat(opacity(fadeIn = 2.0, startTime = 0.0, duration = 10.0, currentTime = 1.0))
            .isWithin(1e-9).of(0.5)
    }

    @Test
    fun `once past the fade-in window the clip is fully opaque`() {
        assertThat(opacity(fadeIn = 2.0, startTime = 0.0, duration = 10.0, currentTime = 5.0))
            .isWithin(1e-9).of(1.0)
    }

    @Test
    fun `the fade-in boundary itself is already fully opaque`() {
        // currentTime == start + fadeIn is NOT strictly inside the fade-in window,
        // so it falls through to the steady 1.0 rather than reporting progress 1.0.
        assertThat(opacity(fadeIn = 2.0, startTime = 0.0, duration = 10.0, currentTime = 2.0))
            .isWithin(1e-9).of(1.0)
    }

    @Test
    fun `mid fade-out ramps linearly toward transparent`() {
        // window [0,4], fadeOut 2 → tail (2,4); midpoint 3 → 0.5.
        assertThat(opacity(fadeOut = 2.0, startTime = 0.0, duration = 4.0, currentTime = 3.0))
            .isWithin(1e-9).of(0.5)
    }

    @Test
    fun `just before the end the fade-out is nearly transparent`() {
        assertThat(opacity(fadeOut = 2.0, startTime = 0.0, duration = 4.0, currentTime = 3.5))
            .isWithin(1e-9).of(0.25)
    }

    @Test
    fun `the fade-out boundary itself is still fully opaque`() {
        // currentTime == end - fadeOut is NOT strictly inside the fade-out window.
        assertThat(opacity(fadeOut = 2.0, startTime = 0.0, duration = 4.0, currentTime = 2.0))
            .isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a fade-in-only clip with no duration fades in then stays opaque forever`() {
        // No duration → end is infinite; the fade-out branch never fires.
        assertThat(opacity(fadeIn = 2.0, startTime = 0.0, duration = null, currentTime = 1.0))
            .isWithin(1e-9).of(0.5)
        assertThat(opacity(fadeIn = 2.0, startTime = 0.0, duration = null, currentTime = 1000.0))
            .isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a fade-out-only clip with no finite end can never fade out`() {
        // fadeOut is set but there is no duration, so end is infinite and the clip
        // stays opaque inside its (open-ended) window.
        assertThat(opacity(fadeOut = 2.0, startTime = 0.0, duration = null, currentTime = 1000.0))
            .isWithin(1e-9).of(1.0)
    }

    @Test
    fun `fade-in takes precedence when the in and out windows overlap`() {
        // A clip shorter than fadeIn+fadeOut: at t=0.5 both windows contain it,
        // but the fade-in is evaluated first (iOS parity).
        assertThat(opacity(fadeIn = 1.0, fadeOut = 1.0, startTime = 0.0, duration = 1.0, currentTime = 0.5))
            .isWithin(1e-9).of(0.5)
    }

    @Test
    fun `a shifted clip fades on its own start-relative clock`() {
        // startTime 10, fadeIn 2 → fully transparent at 10, half at 11.
        assertThat(opacity(fadeIn = 2.0, startTime = 10.0, duration = 10.0, currentTime = 11.0))
            .isWithin(1e-9).of(0.5)
    }

    @Test
    fun `an absent startTime is treated as zero`() {
        assertThat(opacity(fadeIn = 2.0, startTime = null, duration = 10.0, currentTime = 1.0))
            .isWithin(1e-9).of(0.5)
    }
}
