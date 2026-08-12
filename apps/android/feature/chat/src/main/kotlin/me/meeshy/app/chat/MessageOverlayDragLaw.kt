package me.meeshy.app.chat

/**
 * Outcome of a vertical gesture released on the long-press overlay menu — a
 * faithful port of iOS `MessageOverlayDragOutcome`.
 *
 * - [OpenMore]: a strong swipe up expands the compact action sheet into the full
 *   language explorer ("Plus…" / Menu 2).
 * - [Dismiss]: a strong swipe down closes the overlay.
 * - [SnapBack]: an insufficient gesture springs the sheet back to rest.
 */
enum class MessageOverlayDragOutcome {
    OpenMore,
    Dismiss,
    SnapBack,
}

/**
 * Pure vertical-drag law of the long-press overlay menu — the single source of
 * truth for "what does this drag do". A faithful port of iOS
 * `MessageOverlayDragLaw`, with no UI dependency, tested exhaustively in
 * [MessageOverlayDragLawTest].
 *
 * Ranges are disjoint by construction: each directional outcome requires a strict
 * sign of `translation`, and the projected velocity (via `predicted`) only counts
 * in the direction of the drag. The crossed case — "drag up past the threshold
 * then fling down on release" — falls back to the position rule ([OpenMore]);
 * cancelling requires sliding back under the threshold before releasing.
 *
 * Values are in pixels of vertical travel: negative is upward (toward "More…"),
 * positive is downward (toward dismiss).
 */
object MessageOverlayDragLaw {
    const val OPEN_MORE_THRESHOLD = -80f
    const val DISMISS_THRESHOLD = 80f

    /** The projected translation (position + velocity) counts double. */
    private const val PREDICTION_FACTOR = 2f

    /** Elastic overshoot resistance once the finger travels past a threshold. */
    private const val OVERSHOOT_DAMPING = 0.3f

    /**
     * Resolve the released gesture. A translation at or past [OPEN_MORE_THRESHOLD],
     * or a strong upward projection while still dragging up, opens "More…"; the
     * mirror image downward dismisses; anything weaker snaps back. The up-arm is
     * checked first, so a pathological both-armed input resolves to [OpenMore].
     */
    fun outcome(translation: Float, predicted: Float): MessageOverlayDragOutcome {
        val openMorePredicted = OPEN_MORE_THRESHOLD * PREDICTION_FACTOR
        val dismissPredicted = DISMISS_THRESHOLD * PREDICTION_FACTOR
        if (translation <= OPEN_MORE_THRESHOLD || (predicted <= openMorePredicted && translation < 0f)) {
            return MessageOverlayDragOutcome.OpenMore
        }
        if (translation >= DISMISS_THRESHOLD || (predicted >= dismissPredicted && translation > 0f)) {
            return MessageOverlayDragOutcome.Dismiss
        }
        return MessageOverlayDragOutcome.SnapBack
    }

    /**
     * The on-screen offset to render for a raw finger [translation]: 1:1 inside the
     * thresholds, then a damped elastic overshoot beyond either end so the sheet
     * keeps following the finger without tracking it fully.
     */
    fun displayOffset(translation: Float): Float {
        if (translation < OPEN_MORE_THRESHOLD) {
            return OPEN_MORE_THRESHOLD + (translation - OPEN_MORE_THRESHOLD) * OVERSHOOT_DAMPING
        }
        if (translation > DISMISS_THRESHOLD) {
            return DISMISS_THRESHOLD + (translation - DISMISS_THRESHOLD) * OVERSHOOT_DAMPING
        }
        return translation
    }

    /** True while releasing now would open "More…" (the finger is past the up-threshold). */
    fun isArmed(translation: Float): Boolean = translation <= OPEN_MORE_THRESHOLD
}
