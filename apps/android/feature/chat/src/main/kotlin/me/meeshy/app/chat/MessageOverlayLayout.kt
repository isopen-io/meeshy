package me.meeshy.app.chat

/**
 * An axis-aligned rectangle in a single linear unit (the caller keeps px **or**
 * dp consistent across every input). Used both for the source message-bubble
 * frame fed into [MessageOverlayLayout] and the scaled preview it returns.
 */
data class OverlayRect(
    val left: Float,
    val top: Float,
    val width: Float,
    val height: Float,
) {
    val right: Float get() = left + width
    val bottom: Float get() = top + height
    val centerX: Float get() = left + width / 2f
    val centerY: Float get() = top + height / 2f
}

/** A single anchor point (center of the emoji bar / action menu). */
data class OverlayPoint(val x: Float, val y: Float)

/**
 * The resolved geometry of the long-press overlay "cluster": the reactions
 * emoji bar on top, the elevated preview bubble hero in the middle, and the
 * action menu underneath — each already positioned and, for the preview,
 * uniformly scaled.
 *
 * @property scale the uniform scale applied to the source bubble (1.0 when it
 *   fits at full size; < 1 when capped for height or squeezed to fit vertically).
 * @property preview the scaled preview-bubble rect, centered on the message's
 *   trailing/leading edge (never horizontally clamped — the hero tracks its
 *   source bubble faithfully).
 * @property emojiBar the center of the quick-reactions bar.
 * @property actionMenu the center of the action menu.
 */
data class MessageOverlayCluster(
    val scale: Float,
    val preview: OverlayRect,
    val emojiBar: OverlayPoint,
    val actionMenu: OverlayPoint,
)

/**
 * Pure layout law of the long-press overlay's floating preview presentation — a
 * faithful port of the "native-lean" geometry inside iOS `MessageOverlayMenu`
 * (`Features/Main/Components/MessageOverlayMenu.swift`). It stacks
 * `[emoji bar] · gap · [preview bubble] · gap · [action menu]` into one cluster,
 * scales the hero so tall bubbles stay on-screen, and clamps the cluster inside
 * the safe area — all as one deterministic, UI-free function tested through
 * [MessageOverlayLayoutTest].
 *
 * No Android/Compose type is referenced: inputs and outputs are bare [Float]s and
 * value records so the whole thing is JVM-coverable.
 */
object MessageOverlayLayout {
    /** Visual cap on the preview bubble's height before proportional shrinking. */
    const val MAX_PREVIEW_HEIGHT = 320f

    /** Height reserved for the quick-reactions emoji bar. */
    const val EMOJI_BAR_HEIGHT = 52f

    /** Vertical gap between the three cluster members. */
    const val GAP = 12f

    /** Horizontal inset kept between the emoji bar / menu and the screen edges. */
    const val SIDE_PADDING = 16f

    /** Nominal width of the quick-reactions emoji bar (used only for X clamping). */
    const val EMOJI_BAR_WIDTH = 300f

    /** Floor on the height-driven preview scale — keep the hero legible. */
    const val PREVIEW_SCALE_FLOOR = 0.55f

    /** Floor on the fit-to-screen scale — never collapse the hero to nothing. */
    const val FIT_SCALE_FLOOR = 0.4f

    /** Minimum available vertical band the cluster is laid out within. */
    const val MIN_AVAILABLE = 160f

    /** Minimum usable bubble height when computing the squeeze scale. */
    private const val MIN_FIT_BUBBLE_HEIGHT = 60f

    /** Inset from the safe-area top/bottom before the cluster may extend. */
    private const val EDGE_INSET = 12f

    /**
     * Resolve the overlay cluster for a message.
     *
     * @param bubble source bubble frame (root coordinates, same unit as the rest).
     * @param screenWidth full presentation width.
     * @param screenHeight full presentation height.
     * @param safeTop top safe-area inset.
     * @param safeBottom bottom safe-area inset.
     * @param menuWidth action-menu width (caller-measured; used for X clamping).
     * @param menuHeight action-menu height (caller-measured; drives the fit math).
     * @param isOutgoing true for the current user's own messages (anchor trailing).
     */
    fun compute(
        bubble: OverlayRect,
        screenWidth: Float,
        screenHeight: Float,
        safeTop: Float,
        safeBottom: Float,
        menuWidth: Float,
        menuHeight: Float,
        isOutgoing: Boolean,
    ): MessageOverlayCluster {
        val previewScale = if (bubble.height > MAX_PREVIEW_HEIGHT) {
            maxOf(PREVIEW_SCALE_FLOOR, MAX_PREVIEW_HEIGHT / bubble.height)
        } else {
            1.0f
        }
        val scaledBubbleHeight = bubble.height * previewScale

        val availTop = safeTop + EDGE_INSET
        val availBottom = screenHeight - safeBottom - EDGE_INSET
        val available = maxOf(MIN_AVAILABLE, availBottom - availTop)
        val chrome = EMOJI_BAR_HEIGHT + GAP * 2f + menuHeight

        val fitScale = if (scaledBubbleHeight + chrome > available) {
            maxOf(
                FIT_SCALE_FLOOR,
                minOf(previewScale, maxOf(MIN_FIT_BUBBLE_HEIGHT, available - chrome) / maxOf(1f, bubble.height)),
            )
        } else {
            previewScale
        }

        val bubbleW = bubble.width * fitScale
        val bubbleH = bubble.height * fitScale
        val clusterH = EMOJI_BAR_HEIGHT + GAP + bubbleH + GAP + menuHeight

        val anchorX = if (isOutgoing) bubble.right - bubbleW / 2f else bubble.left + bubbleW / 2f
        val desiredTop = bubble.top - EMOJI_BAR_HEIGHT - GAP
        val clusterTop = maxOf(availTop, minOf(desiredTop, availBottom - clusterH))

        val emojiY = clusterTop + EMOJI_BAR_HEIGHT / 2f
        val bubbleTop = clusterTop + EMOJI_BAR_HEIGHT + GAP
        val menuY = bubbleTop + bubbleH + GAP + menuHeight / 2f

        val menuX = clampX(anchorX, screenWidth, menuWidth)
        val emojiX = clampX(anchorX, screenWidth, EMOJI_BAR_WIDTH)

        return MessageOverlayCluster(
            scale = fitScale,
            preview = OverlayRect(left = anchorX - bubbleW / 2f, top = bubbleTop, width = bubbleW, height = bubbleH),
            emojiBar = OverlayPoint(x = emojiX, y = emojiY),
            actionMenu = OverlayPoint(x = menuX, y = menuY),
        )
    }

    private fun clampX(anchorX: Float, screenWidth: Float, elementWidth: Float): Float {
        val half = elementWidth / 2f
        return maxOf(SIDE_PADDING + half, minOf(screenWidth - SIDE_PADDING - half, anchorX))
    }
}
