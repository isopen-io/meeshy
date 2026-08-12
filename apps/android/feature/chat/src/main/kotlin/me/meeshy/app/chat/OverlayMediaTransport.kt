package me.meeshy.app.chat

/**
 * Pure, immutable state machine for the long-press overlay's **interactive
 * audio/video preview** — the single source of truth for "is it playing, how far
 * in, at what speed, and where does each control move the playhead". A faithful
 * port of the transport logic buried inside iOS `OverlayAudioPlayer` (the
 * `@StateObject` behind `PreviewAudioPlayer` / `PreviewVideoPlayer` in
 * `MessageOverlayMenu.swift`): `toggle`, `seek(to:)`, `skip(seconds:)`, `setRate`,
 * the periodic time observer, and the end-of-item reset — gathered into one
 * JVM-testable value type.
 *
 * **Surpasses iOS** by (1) making every transition a pure function that returns a
 * new transport rather than mutating scattered `@Published` fields on an
 * `ObservableObject`, (2) clamping the reported position into `[0, duration]` so a
 * jittery observer frame can never overshoot the scrubber, and (3) adding a
 * [cycleRate] affordance so Android drives the speed with a single natural
 * tap-to-cycle chip instead of iOS's context menu — while keeping the exact same
 * `0.5 … 2.0×` grid.
 *
 * The actual `MediaPlayer` (audio) / video-surface plumbing is Android-runtime
 * glue that lives app-side; it maps player callbacks onto [ready] / [failed] /
 * [tick] / [onEnded] and applies [progress] / [playbackRate] / [isPlaying] back
 * onto the platform player.
 */
class OverlayMediaTransport private constructor(
    val currentUrl: String?,
    val isPlaying: Boolean,
    val isLoading: Boolean,
    val progress: Double,
    val currentSeconds: Double,
    val durationSeconds: Double,
    val playbackRate: Float,
) {
    /** True once a real, positive duration is known (a scrub/skip target exists). */
    val hasDuration: Boolean get() = durationSeconds.isFinite() && durationSeconds > 0.0

    /** The whole-percent playhead position (truncated), matching iOS `percentInt`. */
    val percentInt: Int get() = (progress * 100).toInt()

    /**
     * The `current / total` label (each `m:ss`, unpadded minutes, zero-padded
     * seconds — iOS `timeLabel(totalDuration:)`). The total prefers the observed
     * [durationSeconds] and falls back to [totalDurationSeconds] (the attachment's
     * declared length) before the player has reported its own duration.
     */
    fun timeLabel(totalDurationSeconds: Int? = null): String {
        val total = if (durationSeconds > 0.0) durationSeconds else (totalDurationSeconds ?: 0).toDouble()
        return "${formatTime(currentSeconds)} / ${formatTime(total)}"
    }

    /**
     * The play/pause/load button. While playing → pause (position preserved). A new
     * [url] → (re)load from zero, keeping the chosen [playbackRate] (iOS `stop()`
     * then `currentURL = url`, `isLoading = true`). The same paused url → resume.
     */
    fun toggle(url: String): OverlayMediaTransport {
        if (isPlaying) return copy(isPlaying = false)
        if (currentUrl != url) {
            return OverlayMediaTransport(
                currentUrl = url,
                isPlaying = false,
                isLoading = true,
                progress = 0.0,
                currentSeconds = 0.0,
                durationSeconds = 0.0,
                playbackRate = playbackRate,
            )
        }
        return copy(isPlaying = true)
    }

    /** The player became ready to play: clear loading and start (iOS `.readyToPlay`). */
    fun ready(): OverlayMediaTransport {
        if (currentUrl == null) return this
        return copy(isLoading = false, isPlaying = true)
    }

    /** The player failed to load: clear loading, stay paused (iOS `.failed`). */
    fun failed(): OverlayMediaTransport = copy(isLoading = false)

    /** Tear the preview down to a clean stopped transport, keeping the chosen rate. */
    fun stop(): OverlayMediaTransport = stopped(playbackRate)

    /** Scrub to [fraction] of the clip (clamped to `0…1`); inert until a duration is known. */
    fun seek(fraction: Double): OverlayMediaTransport {
        if (!hasDuration) return this
        val clamped = fraction.coerceIn(0.0, 1.0)
        return copy(progress = clamped, currentSeconds = clamped * durationSeconds)
    }

    /** Nudge the playhead by [seconds] (clamped to `0…duration`); inert until a duration is known. */
    fun skip(seconds: Double): OverlayMediaTransport {
        if (!hasDuration) return this
        val target = (currentSeconds + seconds).coerceIn(0.0, durationSeconds)
        return copy(currentSeconds = target, progress = target / durationSeconds)
    }

    /** Set the playback speed (iOS `setRate`). Applied to the live player app-side. */
    fun setRate(rate: Float): OverlayMediaTransport = copy(playbackRate = rate)

    /** Advance the speed to the next step on the [RATES] grid, wrapping past the fastest. */
    fun cycleRate(): OverlayMediaTransport = copy(playbackRate = nextRate(playbackRate))

    /**
     * A periodic position report from the player. Records the observed
     * [durationSeconds] and clamps [currentSeconds] into `[0, duration]` before
     * deriving [progress]. Inert for a non-positive or non-finite duration (the
     * player has not resolved a real length yet).
     */
    fun tick(currentSeconds: Double, durationSeconds: Double): OverlayMediaTransport {
        if (!(durationSeconds.isFinite() && durationSeconds > 0.0)) return this
        val clamped = currentSeconds.coerceIn(0.0, durationSeconds)
        return copy(
            durationSeconds = durationSeconds,
            currentSeconds = clamped,
            progress = clamped / durationSeconds,
        )
    }

    /** The item played to the end: rewind to the start and stop (iOS end observer). */
    fun onEnded(): OverlayMediaTransport = copy(isPlaying = false, progress = 0.0, currentSeconds = 0.0)

    private fun copy(
        currentUrl: String? = this.currentUrl,
        isPlaying: Boolean = this.isPlaying,
        isLoading: Boolean = this.isLoading,
        progress: Double = this.progress,
        currentSeconds: Double = this.currentSeconds,
        durationSeconds: Double = this.durationSeconds,
        playbackRate: Float = this.playbackRate,
    ) = OverlayMediaTransport(
        currentUrl, isPlaying, isLoading, progress, currentSeconds, durationSeconds, playbackRate,
    )

    private fun formatTime(seconds: Double): String {
        if (!seconds.isFinite() || seconds < 0.0) return "0:00"
        val whole = seconds.toInt()
        val minutes = whole / 60
        val secs = whole % 60
        return "$minutes:${secs.toString().padStart(2, '0')}"
    }

    companion object {
        /** The `0.5 … 2.0×` speed grid offered in the preview (iOS `[0.5, 0.75, 1.0, 1.25, 1.5, 2.0]`). */
        val RATES: List<Float> = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)

        /** The default single-tap skip offset, in seconds (iOS `gobackward.5` / `goforward.5`). */
        const val SKIP_SECONDS: Double = 5.0

        /** A clean stopped transport at normal speed. */
        fun idle(): OverlayMediaTransport = stopped(1.0f)

        /**
         * The next speed on the [RATES] grid strictly above [current], wrapping to
         * the slowest step once at or past the fastest. Tolerant of an off-grid
         * [current] (lands on the next-higher step).
         */
        fun nextRate(current: Float): Float =
            RATES.firstOrNull { it > current + 0.001f } ?: RATES.first()

        private fun stopped(rate: Float) = OverlayMediaTransport(
            currentUrl = null,
            isPlaying = false,
            isLoading = false,
            progress = 0.0,
            currentSeconds = 0.0,
            durationSeconds = 0.0,
            playbackRate = rate,
        )
    }
}
