package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural contract for [VideoDismissWatchReport.shouldReport] — the pure
 * close-report guard ported from iOS `VideoDismissWatchReport.shouldReport`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDismissWatchReport.swift`),
 * the fix for issue #3908.
 *
 * A video watch is reported at TWO moments by two owners: the shared player's
 * `cleanup()` (which persists the resume position, THEN zeroes its counters) and
 * the fullscreen `.onDisappear`, which runs AFTER. Closing a PAUSED video routes
 * through `stop()` → `cleanup()`, so the second reporter read a detached player,
 * concluded "nothing to resume", and ERASED the resume position the first owner
 * had just written. The rule tells the second reporter to stay silent once the
 * player no longer describes this attachment. Tests drive the public API and
 * assert the WHO/WHEN decision, never this port's internals.
 */
class VideoDismissWatchReportTest {

    // --- detached player: the second reporter must stay silent (#3908) --------------------

    @Test
    fun detachedPlayerStaysSilentRegardlessOfTimeWatched() {
        // The player has already been detached — it was cleanup() that reported,
        // with the real values. A long partial watch does not resurrect the report.
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = false,
                watchedSeconds = 120.0,
                playerStillHoldsAttachment = false,
            ),
        ).isFalse()
    }

    @Test
    fun detachedPlayerStaysSilentEvenWhenComplete() {
        // The exact #3908 defect: closing PAUSED ⇒ stop() ⇒ cleanup() ⇒ detached.
        // Even a completed watch must not fire a second, zeroed report.
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = true,
                watchedSeconds = 120.0,
                playerStillHoldsAttachment = false,
            ),
        ).isFalse()
    }

    // --- attached player: the path this report actually serves ----------------------------

    @Test
    fun attachedPlayerWithALongEnoughWatchReports() {
        // Dismiss while playing, PiP handoff, inline continuation — the player is
        // still attached, so this reporter is the one that must speak.
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = false,
                watchedSeconds = 5.0,
                playerStillHoldsAttachment = true,
            ),
        ).isTrue()
    }

    @Test
    fun aBriefGlanceStaysSilentEvenWithAnAttachedPlayer() {
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = false,
                watchedSeconds = 1.0,
                playerStillHoldsAttachment = true,
            ),
        ).isFalse()
    }

    @Test
    fun aCompletedWatchEscapesTheDurationThreshold() {
        // A watch played to the end reports no matter how short it was.
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = true,
                watchedSeconds = 0.5,
                playerStillHoldsAttachment = true,
            ),
        ).isTrue()
    }

    // --- the partial-watch threshold is inclusive to the second ---------------------------

    @Test
    fun theThresholdIsInclusiveAtExactlyTheMinimum() {
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = false,
                watchedSeconds = VideoDismissWatchReport.MINIMUM_PARTIAL_WATCH_SECONDS,
                playerStillHoldsAttachment = true,
            ),
        ).isTrue()
    }

    @Test
    fun justBelowTheThresholdStaysSilent() {
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = false,
                watchedSeconds = VideoDismissWatchReport.MINIMUM_PARTIAL_WATCH_SECONDS - 0.01,
                playerStillHoldsAttachment = true,
            ),
        ).isFalse()
    }

    // --- the detachment check gates BOTH ways in of the watch guard -----------------------

    @Test
    fun aQualifyingWatchIsStillSilencedByDetachment() {
        // Even a watch that clears the duration threshold reports nothing once the
        // player is detached — the detachment check is the outermost gate.
        assertThat(
            VideoDismissWatchReport.shouldReport(
                complete = false,
                watchedSeconds = 10.0,
                playerStillHoldsAttachment = false,
            ),
        ).isFalse()
    }

    @Test
    fun theMinimumPartialWatchIsThreeSeconds() {
        assertThat(VideoDismissWatchReport.MINIMUM_PARTIAL_WATCH_SECONDS).isEqualTo(3.0)
    }
}
