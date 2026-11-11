package me.meeshy.sdk.model.call

import kotlin.math.max
import kotlin.math.min

/**
 * #17343 — what the pill carries as TEXT above its base row. The captions and the journal live INSIDE its glass, on a
 * duo as on a group; the journal opens in place of the captions; (…) stows them both and closing the actions gives them
 * back; a touch that stows the pill leaves the captions in a glass without a base row (law 11 of
 * `docs/product/appels-vue-finale.md`). Mirrors iOS `CallPillText`.
 */
enum class CallPillText {
    /** Nothing above the base row. */
    None,

    /** The last two sentences, in the glass of the pill. */
    Captions,

    /** The whole call, in place of the captions. */
    Journal,

    /** The pill is stowed: the captions stay, in a glass without its base row. */
    CaptionsAlone,
    ;

    /** Only the stowed pill leaves the captions without their base row. */
    val hasBaseRow: Boolean get() = this != CaptionsAlone

    companion object {
        /**
         * [isCaptionsEnabled]: the « Captions » setting of the user. The journal keeps the whole call, captions on or
         * off (#17342), so it opens without them. A mode (Effects, Montage) has its own band.
         */
        fun resolve(isCaptionsEnabled: Boolean, layer: CallScreenLayer, isChromeRevealed: Boolean): CallPillText = when {
            layer.freesTheScreen -> None
            !isChromeRevealed -> if (isCaptionsEnabled) CaptionsAlone else None
            layer.pillPanel == CallScreenPanel.Journal -> Journal
            isCaptionsEnabled && layer == CallScreenLayer.Idle -> Captions
            else -> None
        }
    }
}

/**
 * #17343 — ONE width for the glass: the pill that carries text and the glass of the stowed captions are limited to
 * [TEXT_DP] so the eye does not sweep the whole screen (landscape, tablet); the resting pill keeps its [RESTING_DP].
 */
object CallPillWidth {
    const val RESTING_DP: Float = 440f
    const val TEXT_DP: Float = 560f

    fun maxWidthDp(content: CallPillText): Float = if (content == CallPillText.None) RESTING_DP else TEXT_DP
}

/**
 * #17343 — the height of the journal in the pill: a share of the window, never under a readable floor nor over a
 * ceiling (so the group grid keeps its room).
 */
object CallJournalSizing {
    const val SHARE: Float = 0.45f
    const val MINIMUM_DP: Float = 160f
    const val MAXIMUM_DP: Float = 440f

    fun heightDp(windowHeightDp: Float): Float = min(max(windowHeightDp * SHARE, MINIMUM_DP), MAXIMUM_DP)
}

/** #17343 — the foot of the captions: what the line says of its translation, next to the Journal button. */
sealed interface CallCaptionsFooter {
    data object None : CallCaptionsFooter

    /** « EN → FR · touch = original ». */
    data class TouchForOriginal(val pair: String) : CallCaptionsFooter

    companion object {
        /** The newest line that carries a language tag decides the pair. */
        fun resolve(lines: List<CallLiveCaptionLine>): CallCaptionsFooter {
            val pair = lines.lastOrNull { it.languageTag != null }?.languageTag ?: return None
            return TouchForOriginal(pair)
        }
    }
}
