package me.meeshy.sdk.model.call

import kotlin.math.max
import kotlin.math.min

/**
 * #17343 — what the pill carries as TEXT above its base row. The captions and the journal live INSIDE its glass, on a
 * duo as on a group; the journal opens in place of the captions; (…) stows them both and closing the actions gives them
 * back; a touch that stows the pill tightens the same glass around the captions (law 11 of
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

    /** The captions are in the glass: at rest, or alone when the pill is stowed. */
    val showsCaptionsBand: Boolean get() = this == Captions || this == CaptionsAlone

    /**
     * Law 11 · 17 — stowed, the pill does not leave: its glass stays on screen, loses its base row and tightens around the
     * captions. No second glass.
     */
    val staysWhenChromeStowed: Boolean get() = this == CaptionsAlone

    /**
     * U2.9 — in group full screen the pill is stowed with the controls: only its captions glass, deprived of its base
     * row, stays on the stage. Out of the full screen it is always there. Mirrors iOS `isOnStage(isStageFullScreen:)`.
     */
    fun isOnStage(isStageFullScreen: Boolean): Boolean = !isStageFullScreen || staysWhenChromeStowed

    /**
     * #17529 — the journal takes a share of the window ([CallJournalSizing]): on an audio call the avatar then shrinks
     * into a compact header to leave it the room ([CallAudioStageLayout]). Mirrors iOS `compactsAudioLayout`.
     */
    val compactsAudioLayout: Boolean get() = this == Journal

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
 * #17343 — ONE width for the glass: the pill that carries text, stowed or not, is limited to
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

/**
 * #17343 — the foot of the captions: what the lines say of their translation, next to the Journal button. One
 * component for the duo and the group: one pair of languages says « EN → FR · touch = original », several pairs
 * « Translated · N languages », and a translation awaited « EN · translating » (the plate, views P3 and P13).
 */
sealed interface CallCaptionsFooter {
    data object None : CallCaptionsFooter

    /** « EN · translating » — the language of the sentence whose translation is awaited. */
    data class Translating(val language: String) : CallCaptionsFooter

    /** « EN → FR · touch = original ». */
    data class TouchForOriginal(val pair: String) : CallCaptionsFooter

    /** « Translated · N languages » — the distinct languages the lines were read through. */
    data class TranslatedLanguages(val count: Int) : CallCaptionsFooter

    companion object {
        /** [lines]: already `settled(nowMs)`, so a wait that fell no longer speaks. */
        fun resolve(lines: List<CallLiveCaptionLine>): CallCaptionsFooter {
            lines.lastOrNull { it.isAwaitingTranslation }?.originLanguage?.let { return Translating(it) }
            val pairs = lines.mapNotNull { line -> line.originLanguage?.let { origin -> line.servedLanguage?.let { origin to it } } }
            val newest = pairs.lastOrNull() ?: return None
            if (pairs.distinct().size <= 1) return TouchForOriginal("${newest.first} → ${newest.second}")
            return TranslatedLanguages(pairs.flatMap { listOf(it.first, it.second) }.toSet().size)
        }
    }
}
