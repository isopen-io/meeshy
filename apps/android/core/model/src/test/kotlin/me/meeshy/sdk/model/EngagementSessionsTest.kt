package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behaviour of the pure engagement/dwell state machine — the port of iOS
 * `EngagementTracker`'s bookkeeping (monotonic dwell, the topmost-owns-the-clock
 * rule, and the qualified-session threshold). Every assertion drives the public
 * `begin`/`end` API and reads only what a caller can observe: the next state (via
 * a follow-up `end`) and the emitted [QualifiedView].
 */
class EngagementSessionsTest {

    private val start = EngagementSessions()

    // --- begin / end dwell accounting -------------------------------------

    @Test
    fun `a session dwelt past the floor qualifies with its measured dwell`() {
        val (_, view) = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 0)
            .end(EngagementSurface.REELS, nowMs = 1000)

        assertThat(view).isEqualTo(QualifiedView("r1", dwellMs = 1000))
    }

    @Test
    fun `a session below the dwell floor is dropped`() {
        val (_, view) = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 0)
            .end(EngagementSurface.REELS, nowMs = 999)

        assertThat(view).isNull()
    }

    @Test
    fun `the dwell floor is inclusive at exactly the boundary`() {
        val (_, view) = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 500)
            .end(EngagementSurface.REELS, nowMs = 1500)

        assertThat(view).isEqualTo(QualifiedView("r1", dwellMs = 1000))
    }

    // --- unknown surface --------------------------------------------------

    @Test
    fun `ending an unknown surface is inert and emits nothing`() {
        val (next, view) = start.end(EngagementSurface.REELS, nowMs = 5000)

        assertThat(view).isNull()
        assertThat(next).isEqualTo(start)
    }

    @Test
    fun `ending a surface other than the active one is inert`() {
        val sessions = start.begin(EngagementSurface.REELS, "r1", nowMs = 0)

        val (next, view) = sessions.end(EngagementSurface.DETAIL, nowMs = 3000)

        assertThat(view).isNull()
        // the reels session survives and still qualifies when it is ended
        val (_, reelsView) = next.end(EngagementSurface.REELS, nowMs = 3000)
        assertThat(reelsView).isEqualTo(QualifiedView("r1", dwellMs = 3000))
    }

    // --- watch-time / completion qualification (video surfaces) -----------

    @Test
    fun `a short-dwell session still qualifies on watch-time`() {
        val (_, view) = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 0)
            .end(EngagementSurface.REELS, nowMs = 100, watchMs = 2000)

        assertThat(view).isEqualTo(QualifiedView("r1", dwellMs = 100))
    }

    @Test
    fun `watch-time below its floor does not by itself qualify`() {
        val (_, view) = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 0)
            .end(EngagementSurface.REELS, nowMs = 100, watchMs = 1999)

        assertThat(view).isNull()
    }

    @Test
    fun `a completed play qualifies regardless of dwell or watch-time`() {
        val (_, view) = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 0)
            .end(EngagementSurface.REELS, nowMs = 10, watchMs = 5, completed = true)

        assertThat(view).isEqualTo(QualifiedView("r1", dwellMs = 10))
    }

    // --- monotonic-clock robustness ---------------------------------------

    @Test
    fun `a backwards clock never produces negative dwell`() {
        val (_, view) = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 5000)
            .end(EngagementSurface.REELS, nowMs = 4000)

        assertThat(view).isNull()
    }

    // --- topmost-owns-the-clock (multi-surface nesting) -------------------

    @Test
    fun `beginning an overlay pauses the surface underneath`() {
        // DETAIL at t0, an overlay REELS opens at t600 (pauses DETAIL), the overlay
        // closes at t800, DETAIL resumes and finally ends at t1200.
        val afterOverlay = start
            .begin(EngagementSurface.DETAIL, "p1", nowMs = 0)
            .begin(EngagementSurface.REELS, "r1", nowMs = 600)

        val (afterReels, reelsView) = afterOverlay.end(EngagementSurface.REELS, nowMs = 800)
        assertThat(reelsView).isNull() // 200 ms < floor

        val (_, detailView) = afterReels.end(EngagementSurface.DETAIL, nowMs = 1200)
        // DETAIL accrued 0..600 (=600) while on top, was paused for the overlay
        // 600..800, resumed 800..1200 (=400): 1000 ms total — the overlay's window
        // is excluded, and that is exactly the qualifying floor.
        assertThat(detailView).isEqualTo(QualifiedView("p1", dwellMs = 1000))
    }

    @Test
    fun `the paused surface does not accrue dwell while covered`() {
        // DETAIL opens at t0, REELS covers it for a long time, DETAIL is ended
        // right after REELS closes: DETAIL's dwell excludes the whole covered span.
        val sessions = start
            .begin(EngagementSurface.DETAIL, "p1", nowMs = 0)
            .begin(EngagementSurface.REELS, "r1", nowMs = 1200)

        val (afterReels, _) = sessions.end(EngagementSurface.REELS, nowMs = 10_000)
        val (_, detailView) = afterReels.end(EngagementSurface.DETAIL, nowMs = 10_050)

        // 0..1200 (=1200) + 10_000..10_050 (=50) = 1250, never the covered
        // 1200..10_000 (=8800) span.
        assertThat(detailView).isEqualTo(QualifiedView("p1", dwellMs = 1250))
    }

    @Test
    fun `re-beginning the same surface restarts its dwell from zero`() {
        val reopened = start
            .begin(EngagementSurface.REELS, "r1", nowMs = 0)
            .begin(EngagementSurface.REELS, "r1", nowMs = 100)

        val (_, view) = reopened.end(EngagementSurface.REELS, nowMs = 100)
        // the second begin replaced the first: dwell is 100..100 = 0, dropped.
        assertThat(view).isNull()
    }

    @Test
    fun `default thresholds match the iOS tracker`() {
        assertThat(EngagementSessions.MIN_DWELL_MS).isEqualTo(1000L)
        assertThat(EngagementSessions.MIN_WATCH_MS).isEqualTo(2000L)
    }
}
