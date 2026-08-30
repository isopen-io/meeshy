package me.meeshy.sdk.model

/**
 * Pure karaoke resolver for synchronized audio transcription (feature-parity §P, "synchronized
 * karaoke-style transcription (tap-to-seek)") — a faithful port of iOS
 * `AudioPlayerView.activeSegmentIndex(segments:currentTime:progress:isPlaying:)`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`), the single source of
 * truth iOS shares between its bubble player and its full-screen `MediaTranscriptionView`.
 *
 * It answers ONE question — which transcription segment is "lit" at the current playback
 * position — with three faithful layers:
 *
 *  1. **Idle / empty → nothing lit.** When playback is paused (`isPlaying == false`) or there
 *     are no segments, the result is `null`. This is iOS's "BUG D" guard: at rest
 *     `currentTime == 0` and a segment starting at `0` would otherwise false-highlight
 *     segment 0 while nothing is playing.
 *  2. **Real timing → the segment whose half-open window `[start, end)` contains the position.**
 *     "Real timing" means at least one segment has `endTime > startTime`; then the FIRST
 *     segment whose window contains `currentTimeSeconds` wins (start inclusive, end exclusive),
 *     or `null` when the position sits before the first segment, in a gap, or past the last —
 *     exactly iOS `firstIndex { currentTime >= start && currentTime < end }`.
 *  3. **No usable timing → proportional fallback on `progress`.** When every segment is
 *     zero-length (`start == end`, e.g. `0…0`) no window could ever match, so the karaoke would
 *     freeze; instead the lit index advances proportionally to the engine's global progress
 *     (`0…1`), clamped to the segment range — iOS `min(max(Int(progress·count), 0), count-1)`.
 *
 * Android's [MessageTranscriptionSegment] carries nullable `startTime`/`endTime`; an absent
 * bound reads as `0.0`, matching iOS's non-optional `TranscriptionDisplaySegment` where a
 * missing timing defaults to zero. The resolver is a pure function of its inputs — no clock, no
 * player, no side effects — so every branch is JVM-testable and the "when" (who is playing,
 * what the clock says) stays in the caller.
 */
public object TranscriptionKaraokeResolver {

    /**
     * Index of the transcription segment lit at [currentTimeSeconds], or `null` when nothing is
     * lit (paused, empty, or the position matches no timed window). [progress] (`0…1`) is used
     * only as the proportional fallback when no segment carries usable timing.
     */
    public fun activeSegmentIndex(
        segments: List<MessageTranscriptionSegment>,
        currentTimeSeconds: Double,
        progress: Double,
        isPlaying: Boolean,
    ): Int? {
        if (!isPlaying || segments.isEmpty()) return null

        val hasRealTiming = segments.any { (it.endTime ?: 0.0) > (it.startTime ?: 0.0) }
        if (hasRealTiming) {
            val index = segments.indexOfFirst {
                val start = it.startTime ?: 0.0
                val end = it.endTime ?: 0.0
                currentTimeSeconds >= start && currentTimeSeconds < end
            }
            return index.takeIf { it >= 0 }
        }

        val proportional = (progress * segments.size).toInt()
        return proportional.coerceIn(0, segments.size - 1)
    }
}
