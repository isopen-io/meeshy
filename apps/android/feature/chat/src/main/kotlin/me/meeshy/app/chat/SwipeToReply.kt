package me.meeshy.app.chat

/**
 * The horizontal direction a bubble must be dragged to reveal the reply
 * affordance. Incoming (left-aligned) bubbles reply on a rightward drag; own
 * (right-aligned) bubbles reply on a leftward drag. [sign] turns a raw
 * horizontal translation into a *directed* distance where a positive value
 * always means "toward reply", so the threshold logic stays direction-agnostic.
 */
enum class ReplyDirection(val sign: Float) {
    FromIncoming(1f),
    FromOwn(-1f),
}

/**
 * Live state of an in-progress swipe-to-reply drag on a single bubble.
 * [offset] is the signed on-screen translation to render; [isArmed] is true
 * while the reply would commit if the finger were released now.
 */
data class SwipeReplyState(
    val offset: Float = 0f,
    val isArmed: Boolean = false,
)

/**
 * Outcome of feeding one cumulative drag translation into [SwipeToReply.onDrag]:
 * the next [state] plus [armedHaptic], true only on the transition *into* the
 * armed zone so the caller fires a single "snap" haptic per crossing.
 */
data class SwipeReplyDrag(
    val state: SwipeReplyState,
    val armedHaptic: Boolean,
)

/** What releasing the finger should do. */
enum class SwipeReplyRelease { Commit, Cancel }

/**
 * Pure SSOT for the swipe-to-reply gesture, a faithful port of the iOS
 * `MessageListView.dragGesture`: the bubble tracks the finger 1:1 toward its
 * reply direction up to a comfort [RUBBER_BAND_ZONE], then compresses further
 * travel by [RUBBER_BAND_RESISTANCE]; it arms once the directed offset reaches
 * [COMMIT_THRESHOLD] and commits the reply only if released while armed. A drag
 * away from the reply direction is inert (the bubble never leaves its rest).
 */
object SwipeToReply {
    const val RUBBER_BAND_ZONE = 72f
    const val RUBBER_BAND_RESISTANCE = 0.15f
    const val COMMIT_THRESHOLD = 66f

    /**
     * The signed offset to render for a raw horizontal [translationX] and reply
     * [direction]. Returns 0 for any drag away from the reply direction; tracks
     * the finger 1:1 inside the zone; rubber-bands past it.
     */
    fun resolveOffset(translationX: Float, direction: ReplyDirection): Float {
        val directed = translationX * direction.sign
        if (directed <= 0f) return 0f
        val magnitude = if (directed > RUBBER_BAND_ZONE) {
            RUBBER_BAND_ZONE + (directed - RUBBER_BAND_ZONE) * RUBBER_BAND_RESISTANCE
        } else {
            directed
        }
        return magnitude * direction.sign
    }

    /** True when the directed [offset] has reached the commit threshold. */
    fun isArmed(offset: Float, direction: ReplyDirection): Boolean =
        offset * direction.sign >= COMMIT_THRESHOLD

    /**
     * Reduce one cumulative drag [translationX] into the next state. [armedHaptic]
     * is true only when this delta crosses from not-armed to armed, so a held
     * armed drag never re-fires and re-arming after relaxing fires again.
     */
    fun onDrag(
        previous: SwipeReplyState,
        translationX: Float,
        direction: ReplyDirection,
    ): SwipeReplyDrag {
        val offset = resolveOffset(translationX, direction)
        val armed = isArmed(offset, direction)
        return SwipeReplyDrag(
            state = SwipeReplyState(offset = offset, isArmed = armed),
            armedHaptic = armed && !previous.isArmed,
        )
    }

    /** Commit the reply iff the finger is released while armed. */
    fun onRelease(state: SwipeReplyState, direction: ReplyDirection): SwipeReplyRelease =
        if (isArmed(state.offset, direction)) SwipeReplyRelease.Commit else SwipeReplyRelease.Cancel
}

/** The reply direction for a bubble, from whether it is the reader's own message. */
internal fun replyDirection(isOutgoing: Boolean): ReplyDirection =
    if (isOutgoing) ReplyDirection.FromOwn else ReplyDirection.FromIncoming
