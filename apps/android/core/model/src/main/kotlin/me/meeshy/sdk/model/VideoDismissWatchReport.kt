package me.meeshy.sdk.model

/**
 * A video watch is reported at TWO moments, by two owners, and one can destroy
 * what the other just wrote.
 *
 * The shared player's `cleanup()` closes the watch — report AND persisted resume
 * position — **then** zeroes its `currentTime` and `duration`. The fullscreen
 * `.onDisappear` runs AFTER: closing a PAUSED video routes through
 * `stop()` → `cleanup()`, so the second reporter read a player that no longer
 * described anything. With `currentTime`/`duration` at zero it concluded "nothing
 * to resume" and **erased the resume position written a fraction of a second
 * earlier** — the exact defect of issue #3908 — emitting a zeroed telemetry along
 * the way.
 *
 * The rule is therefore one question asked BEFORE reading the player at all:
 * *does it still describe the attachment I am talking about?* If not, it has
 * already said everything. A PURE decision — two booleans and a duration, no
 * state, no view. Port of iOS `VideoDismissWatchReport`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDismissWatchReport.swift`).
 *
 * SDK purity: the "when to attach/detach the shared player" orchestration and the
 * telemetry emission stay app-side; this building block only names WHETHER the
 * close report should fire.
 */
public object VideoDismissWatchReport {

    /** Minimum duration (seconds) of a partial watch worth a report. */
    public const val MINIMUM_PARTIAL_WATCH_SECONDS: Double = 3.0

    /**
     * Should the close report fire?
     *
     * @param complete the playback reached the end (no duration threshold applies).
     * @param watchedSeconds time spent on this screen since it opened.
     * @param playerStillHoldsAttachment the shared player STILL carries this
     *   attachment. False the moment it has been detached — and it is then that
     *   player, via `cleanup()`, that reported, with the real values.
     */
    public fun shouldReport(
        complete: Boolean,
        watchedSeconds: Double,
        playerStillHoldsAttachment: Boolean,
    ): Boolean {
        if (!(complete || watchedSeconds >= MINIMUM_PARTIAL_WATCH_SECONDS)) return false
        return playerStillHoldsAttachment
    }
}
