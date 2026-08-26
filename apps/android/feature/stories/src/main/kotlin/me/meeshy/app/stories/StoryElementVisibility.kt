package me.meeshy.app.stories

/**
 * Pure play-mode visibility gate for a timed story canvas element — the Android
 * port of iOS `StoryRenderer.shouldRender(item:at:mode:)`
 * (`MeeshyUI/Story/Canvas/StoryRenderer.swift`).
 *
 * iOS gates every `RenderableItem` (text, foreground media, sticker) on a **sharp
 * on/off** timing window in `.play` mode: the item is drawn iff the playhead lies
 * in `[startTime, startTime + duration)` — inclusive at the start, exclusive at the
 * end. It is deliberately a hard cut, not a fade (Reduce-Motion safe): the smooth
 * opacity ramp around the same window lives in [StoryMediaFadeResolver], applied
 * only while the element is on screen.
 *
 * **Convention deviation from iOS's literal `duration.map { start + $0 }`.** On the
 * Android wire projection an ABSENT duration collapses to `0.0`
 * ([StoryTextObjectView]/[StoryForegroundMediaView] default it so), so here a
 * non-positive (or non-finite-negative) [duration] means an OPEN-ENDED element
 * (`end = +∞`, always visible from [startTime] on) rather than a zero-length window
 * that would hide it at every instant. This matches how [StoryMediaFadeResolver] and
 * the foreground clip-transition path already read `duration <= 0` across this module.
 */
object StoryElementVisibility {

    /**
     * Whether an element with the given timing window is drawn at [currentTime]
     * (seconds, absolute playhead).
     *
     * A non-finite [currentTime] **fails open** (returns `true`) so a degenerate
     * clock never blanks the canvas. A non-finite [startTime] is treated as `0`
     * (iOS's `startTime ?? 0`). A [duration] `<= 0`, or a non-finite one, marks an
     * open-ended element (`end = +∞`).
     */
    fun isVisible(startTime: Double, duration: Double, currentTime: Double): Boolean {
        if (!currentTime.isFinite()) return true
        val start = if (startTime.isFinite()) startTime else 0.0
        val end = if (duration > 0.0 && duration.isFinite()) start + duration else Double.POSITIVE_INFINITY
        return currentTime >= start && currentTime < end
    }
}
