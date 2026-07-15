package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OverlayMediaTransportTest {

    // A transport loaded and ready with a known duration, reached only through the
    // public API: toggle to load, ready to become playable, then a tick supplies the
    // real duration the periodic observer would report.
    private fun loaded(url: String = "u", duration: Double = 100.0): OverlayMediaTransport =
        OverlayMediaTransport.idle().toggle(url).ready().tick(currentSeconds = 0.0, durationSeconds = duration)

    // region — idle / initial state

    @Test
    fun `idle transport is stopped with no url and normal rate`() {
        val t = OverlayMediaTransport.idle()

        assertThat(t.isPlaying).isFalse()
        assertThat(t.isLoading).isFalse()
        assertThat(t.currentUrl).isNull()
        assertThat(t.progress).isEqualTo(0.0)
        assertThat(t.currentSeconds).isEqualTo(0.0)
        assertThat(t.durationSeconds).isEqualTo(0.0)
        assertThat(t.playbackRate).isEqualTo(1.0f)
        assertThat(t.hasDuration).isFalse()
    }

    // endregion

    // region — toggle (load / play / pause)

    @Test
    fun `toggle from idle loads the url into a loading, not-yet-playing state`() {
        val t = OverlayMediaTransport.idle().toggle("clip")

        assertThat(t.currentUrl).isEqualTo("clip")
        assertThat(t.isLoading).isTrue()
        assertThat(t.isPlaying).isFalse()
    }

    @Test
    fun `ready clears loading and starts playback`() {
        val t = OverlayMediaTransport.idle().toggle("clip").ready()

        assertThat(t.isLoading).isFalse()
        assertThat(t.isPlaying).isTrue()
    }

    @Test
    fun `ready with nothing loaded is inert`() {
        val idle = OverlayMediaTransport.idle()

        val t = idle.ready()

        assertThat(t.isPlaying).isFalse()
        assertThat(t.isLoading).isFalse()
    }

    @Test
    fun `toggle while playing pauses without losing position or url`() {
        val playing = loaded().tick(currentSeconds = 30.0, durationSeconds = 100.0)

        val paused = playing.toggle("u")

        assertThat(paused.isPlaying).isFalse()
        assertThat(paused.currentUrl).isEqualTo("u")
        assertThat(paused.currentSeconds).isEqualTo(30.0)
        assertThat(paused.progress).isWithin(1e-9).of(0.3)
    }

    @Test
    fun `toggle the same paused url resumes playback from the same position`() {
        val paused = loaded().tick(currentSeconds = 30.0, durationSeconds = 100.0).toggle("u")

        val resumed = paused.toggle("u")

        assertThat(resumed.isPlaying).isTrue()
        assertThat(resumed.currentSeconds).isEqualTo(30.0)
    }

    @Test
    fun `toggle a different url reloads from zero and keeps the chosen rate`() {
        // Realistic path: the shared preview player is paused on the first clip
        // (toggle-while-playing pauses first, iOS parity), then a second clip loads.
        val pausedOnFirst = loaded("first").setRate(1.5f).tick(currentSeconds = 40.0, durationSeconds = 100.0).toggle("first")

        val reloaded = pausedOnFirst.toggle("second")

        assertThat(reloaded.currentUrl).isEqualTo("second")
        assertThat(reloaded.isLoading).isTrue()
        assertThat(reloaded.isPlaying).isFalse()
        assertThat(reloaded.currentSeconds).isEqualTo(0.0)
        assertThat(reloaded.progress).isEqualTo(0.0)
        assertThat(reloaded.durationSeconds).isEqualTo(0.0)
        assertThat(reloaded.playbackRate).isEqualTo(1.5f)
    }

    @Test
    fun `failed clears loading and leaves playback stopped`() {
        val t = OverlayMediaTransport.idle().toggle("clip").failed()

        assertThat(t.isLoading).isFalse()
        assertThat(t.isPlaying).isFalse()
    }

    // endregion

    // region — stop

    @Test
    fun `stop resets everything but preserves the chosen rate`() {
        val t = loaded().setRate(2.0f).tick(currentSeconds = 55.0, durationSeconds = 100.0)

        val stopped = t.stop()

        assertThat(stopped.isPlaying).isFalse()
        assertThat(stopped.isLoading).isFalse()
        assertThat(stopped.currentUrl).isNull()
        assertThat(stopped.progress).isEqualTo(0.0)
        assertThat(stopped.currentSeconds).isEqualTo(0.0)
        assertThat(stopped.durationSeconds).isEqualTo(0.0)
        assertThat(stopped.playbackRate).isEqualTo(2.0f)
    }

    // endregion

    // region — seek (scrub)

    @Test
    fun `seek moves to the requested fraction of the known duration`() {
        val t = loaded(duration = 200.0).seek(0.25)

        assertThat(t.progress).isEqualTo(0.25)
        assertThat(t.currentSeconds).isEqualTo(50.0)
    }

    @Test
    fun `seek clamps a below-zero fraction to the start`() {
        val t = loaded(duration = 200.0).seek(-0.5)

        assertThat(t.progress).isEqualTo(0.0)
        assertThat(t.currentSeconds).isEqualTo(0.0)
    }

    @Test
    fun `seek clamps an above-one fraction to the end`() {
        val t = loaded(duration = 200.0).seek(1.7)

        assertThat(t.progress).isEqualTo(1.0)
        assertThat(t.currentSeconds).isEqualTo(200.0)
    }

    @Test
    fun `seek before a duration is known is inert`() {
        val loading = OverlayMediaTransport.idle().toggle("clip")

        val t = loading.seek(0.5)

        assertThat(t.progress).isEqualTo(0.0)
        assertThat(t.currentSeconds).isEqualTo(0.0)
    }

    // endregion

    // region — skip (±5s)

    @Test
    fun `skip forward advances by the offset within the clip`() {
        val t = loaded(duration = 100.0).tick(currentSeconds = 20.0, durationSeconds = 100.0).skip(5.0)

        assertThat(t.currentSeconds).isEqualTo(25.0)
        assertThat(t.progress).isWithin(1e-9).of(0.25)
    }

    @Test
    fun `skip backward past the start clamps to zero`() {
        val t = loaded(duration = 100.0).tick(currentSeconds = 3.0, durationSeconds = 100.0).skip(-5.0)

        assertThat(t.currentSeconds).isEqualTo(0.0)
        assertThat(t.progress).isEqualTo(0.0)
    }

    @Test
    fun `skip forward past the end clamps to the duration`() {
        val t = loaded(duration = 100.0).tick(currentSeconds = 98.0, durationSeconds = 100.0).skip(5.0)

        assertThat(t.currentSeconds).isEqualTo(100.0)
        assertThat(t.progress).isEqualTo(1.0)
    }

    @Test
    fun `skip before a duration is known is inert`() {
        val loading = OverlayMediaTransport.idle().toggle("clip")

        val t = loading.skip(5.0)

        assertThat(t.currentSeconds).isEqualTo(0.0)
    }

    // endregion

    // region — playback rate (0.5–2.0×)

    @Test
    fun `setRate stores the requested rate`() {
        val t = OverlayMediaTransport.idle().setRate(0.75f)

        assertThat(t.playbackRate).isEqualTo(0.75f)
    }

    @Test
    fun `cycleRate advances through the fixed steps and wraps back to the slowest`() {
        var t = OverlayMediaTransport.idle() // starts at 1.0
        val seen = mutableListOf(t.playbackRate)
        repeat(OverlayMediaTransport.RATES.size) {
            t = t.cycleRate()
            seen.add(t.playbackRate)
        }

        // 1.0 -> 1.25 -> 1.5 -> 2.0 -> 0.5 -> 0.75 -> 1.0
        assertThat(seen).containsExactly(1.0f, 1.25f, 1.5f, 2.0f, 0.5f, 0.75f, 1.0f).inOrder()
    }

    @Test
    fun `cycleRate from the slowest step advances to the next`() {
        val t = OverlayMediaTransport.idle().setRate(0.5f).cycleRate()

        assertThat(t.playbackRate).isEqualTo(0.75f)
    }

    @Test
    fun `cycleRate from an off-grid rate lands on the next-higher step`() {
        val t = OverlayMediaTransport.idle().setRate(1.1f).cycleRate()

        assertThat(t.playbackRate).isEqualTo(1.25f)
    }

    @Test
    fun `cycleRate from at or above the fastest step wraps to the slowest`() {
        val t = OverlayMediaTransport.idle().setRate(2.0f).cycleRate()

        assertThat(t.playbackRate).isEqualTo(0.5f)
    }

    // endregion

    // region — tick (periodic position observer)

    @Test
    fun `tick records duration, position and derived progress`() {
        val t = loaded().tick(currentSeconds = 45.0, durationSeconds = 90.0)

        assertThat(t.durationSeconds).isEqualTo(90.0)
        assertThat(t.currentSeconds).isEqualTo(45.0)
        assertThat(t.progress).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `tick with a non-positive duration is inert`() {
        val t = loaded(duration = 80.0).tick(currentSeconds = 10.0, durationSeconds = 0.0)

        assertThat(t.durationSeconds).isEqualTo(80.0)
        assertThat(t.currentSeconds).isEqualTo(0.0)
    }

    @Test
    fun `tick with a non-finite duration is inert`() {
        val t = loaded(duration = 80.0).tick(currentSeconds = 10.0, durationSeconds = Double.NaN)

        assertThat(t.durationSeconds).isEqualTo(80.0)
    }

    @Test
    fun `tick clamps a position beyond the duration to the end`() {
        val t = loaded().tick(currentSeconds = 130.0, durationSeconds = 100.0)

        assertThat(t.currentSeconds).isEqualTo(100.0)
        assertThat(t.progress).isEqualTo(1.0)
    }

    // endregion

    // region — onEnded

    @Test
    fun `onEnded rewinds to the start and stops playing`() {
        val t = loaded().tick(currentSeconds = 100.0, durationSeconds = 100.0).onEnded()

        assertThat(t.isPlaying).isFalse()
        assertThat(t.progress).isEqualTo(0.0)
        assertThat(t.currentSeconds).isEqualTo(0.0)
    }

    // endregion

    // region — derived read surface

    @Test
    fun `percentInt truncates the progress fraction`() {
        assertThat(loaded().seek(0.0).percentInt).isEqualTo(0)
        assertThat(loaded().seek(0.379).percentInt).isEqualTo(37)
        assertThat(loaded().seek(1.0).percentInt).isEqualTo(100)
    }

    @Test
    fun `timeLabel formats current over known duration as m colon ss`() {
        val t = loaded(duration = 125.0).tick(currentSeconds = 65.0, durationSeconds = 125.0)

        assertThat(t.timeLabel()).isEqualTo("1:05 / 2:05")
    }

    @Test
    fun `timeLabel falls back to the provided total when no duration is known yet`() {
        val idle = OverlayMediaTransport.idle()

        assertThat(idle.timeLabel(totalDurationSeconds = 42)).isEqualTo("0:00 / 0:42")
    }

    @Test
    fun `timeLabel renders a null fallback total as zero`() {
        assertThat(OverlayMediaTransport.idle().timeLabel(totalDurationSeconds = null)).isEqualTo("0:00 / 0:00")
    }

    // endregion

    // region — immutability

    @Test
    fun `transitions never mutate the source transport`() {
        val base = loaded(duration = 100.0)

        base.seek(0.9)
        base.skip(5.0)
        base.setRate(2.0f)
        base.stop()
        base.toggle("other")

        assertThat(base.currentUrl).isEqualTo("u")
        assertThat(base.progress).isEqualTo(0.0)
        assertThat(base.currentSeconds).isEqualTo(0.0)
        assertThat(base.playbackRate).isEqualTo(1.0f)
        assertThat(base.durationSeconds).isEqualTo(100.0)
    }

    // endregion
}
