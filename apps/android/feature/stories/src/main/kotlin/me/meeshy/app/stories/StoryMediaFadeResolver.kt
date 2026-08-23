package me.meeshy.app.stories

/**
 * Pure resolver for a timed canvas clip's own fadeIn/fadeOut opacity envelope —
 * the Android port of iOS's `StoryRenderer.fadeOpacity(item:at:)`
 * (`MeeshyUI/Story/Canvas/StoryRenderer.swift`).
 *
 * A clip may author a `fadeIn` and/or `fadeOut` (seconds). Inside its own
 * `[startTime, startTime + duration)` window the opacity ramps `0 → 1` over the
 * fade-in, holds at `1`, then ramps `1 → 0` over the fade-out. The envelope is a
 * *default* opacity source: iOS combines it as `fade ?? keyframeOpacity ?? base`,
 * so a present envelope value overrides an authored keyframe opacity (see
 * [StoryForegroundMediaView.animated]).
 *
 * Returns `null` — meaning "this clip authors no envelope opacity at this instant"
 * — when there is no fade at all, or when the playhead sits outside the clip's
 * window. The caller then keeps the clip's base/keyframe opacity unchanged.
 */
object StoryMediaFadeResolver {

    /**
     * The envelope opacity at [currentTime] (seconds, absolute playhead), or `null`
     * when the clip authors no fade or the playhead is outside its window.
     *
     * [fadeIn]/[fadeOut] are the fade durations in seconds; a `null` or non-positive
     * value means that edge does not fade. [startTime] defaults to 0 when absent;
     * [duration] `null` means an open-ended clip (infinite end) — the fade-out edge,
     * which needs a finite end, then never fires. The fade-in edge is evaluated
     * before the fade-out edge, so on a clip shorter than `fadeIn + fadeOut` the
     * overlapping instant reports the fade-in ramp (iOS parity).
     */
    fun fadeOpacity(
        fadeIn: Double?,
        fadeOut: Double?,
        startTime: Double?,
        duration: Double?,
        currentTime: Double,
    ): Double? {
        val fin = fadeIn ?: 0.0
        val fout = fadeOut ?: 0.0
        if (fin <= 0.0 && fout <= 0.0) return null

        val start = startTime ?: 0.0
        val end = duration?.let { start + it } ?: Double.POSITIVE_INFINITY
        if (currentTime < start || currentTime >= end) return null

        if (fin > 0.0 && currentTime < start + fin) {
            return ((currentTime - start) / fin).coerceIn(0.0, 1.0)
        }

        if (fout > 0.0 && end.isFinite() && currentTime > end - fout) {
            return ((end - currentTime) / fout).coerceIn(0.0, 1.0)
        }

        return 1.0
    }
}
