package me.meeshy.app.stories

/**
 * Pure decision for whether the story viewer's auto-advance countdown may run
 * for the current slide *now*.
 *
 * The Instant-App rule for stories: a slow image must never auto-advance before
 * it has painted. Where iOS starts its 5s timer on slide appearance regardless
 * of media-load state (so a still-loading photo can be skipped before the user
 * ever sees it), Android gates the timer on actual readiness:
 *
 * - no slide → nothing to time;
 * - a text-only slide (no image) paints immediately → count down at once;
 * - an image slide → count down only once that image URL has resolved
 *   (loaded or failed — a failure resolves too so the viewer never hangs).
 *
 * The set of resolved URLs is owned by the ViewModel and fed from the live
 * `AsyncImage` load callbacks; this unit holds no clock and no IO so the gate
 * stays fully testable.
 */
object StoryAutoAdvanceGate {

    fun shouldCountdown(slide: StorySlideView?, resolvedImageUrls: Set<String>): Boolean {
        val imageUrl = slide?.imageUrl ?: return slide != null
        return imageUrl in resolvedImageUrls
    }
}
