package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

/** Why a widget inside a bubble asks the bubble's own horizontal swipe to stand down. */
public enum class BubbleGestureReason {
    /** A media scrubber (audio/video seek) is being dragged. */
    MediaScrubbing,

    /** A horizontal media carousel is open and owns horizontal drags. */
    CarouselOpen,

    /** A text selection is in progress inside the bubble. */
    Selection,
}

/**
 * Arbitrates the bubble's swipe gesture (reply / forward) against the gestures of the widgets it
 * hosts. A widget that needs horizontal drags for itself acquires a [Claim]; while at least one
 * claim is live, [suppressSwipe] is true and the swipe container ignores drags.
 *
 * The state is a COUNT of live claims, never a boolean: two widgets can suppress at once, and the
 * swipe only re-arms when the last one lets go. Releasing a claim is idempotent, so a duplicate
 * release (cancellation racing a normal end) can never drive the count negative nor cancel another
 * widget's live claim.
 *
 * Inside a composable, prefer [SuppressBubbleSwipeWhile], which ties the claim to the composition
 * lifecycle.
 */
@Stable
public class BubbleGestureArbiter {

    private var liveClaims by mutableIntStateOf(0)

    /** Number of live claims currently holding the swipe. */
    public val activeReasonCount: Int get() = liveClaims

    /** True while at least one claim is live: the bubble's swipe must stand down. */
    public val suppressSwipe: Boolean get() = liveClaims > 0

    /** Opens a claim for [reason]; the swipe stays suppressed until [Claim.release]. */
    public fun acquire(reason: BubbleGestureReason): Claim {
        liveClaims += 1
        return Claim(reason)
    }

    /** One live suppression. [release] is idempotent. */
    public inner class Claim internal constructor(public val reason: BubbleGestureReason) {
        private var released = false

        /** True until the claim is released. */
        public val isActive: Boolean get() = !released

        /** Gives the swipe back; a second call is a no-op. */
        public fun release() {
            if (released) return
            released = true
            liveClaims = (liveClaims - 1).coerceAtLeast(0)
        }
    }
}

/**
 * The arbiter of the bubble being composed, provided by the swipe container that hosts it. Null
 * outside a swipeable host (e.g. the non-interactive long-press preview), where suppressing is
 * simply a no-op.
 */
public val LocalBubbleGestureArbiter: ProvidableCompositionLocal<BubbleGestureArbiter?> =
    staticCompositionLocalOf { null }

/**
 * Suppresses the enclosing bubble's swipe for [reason] while [active] is true. The claim is taken
 * in an effect (never during composition) and released in `onDispose`, so leaving the composition
 * — including a cancelled or abandoned one — always gives the swipe back.
 */
@Composable
public fun SuppressBubbleSwipeWhile(active: Boolean, reason: BubbleGestureReason) {
    val arbiter = LocalBubbleGestureArbiter.current ?: return
    DisposableEffect(arbiter, active, reason) {
        val claim = if (active) arbiter.acquire(reason) else null
        onDispose { claim?.release() }
    }
}
