package me.meeshy.sdk.model.call

/**
 * How the pill's glass unfolds and tightens (laws 11 and 17). The glass is never resized at once: with « Reduce
 * animations » it still follows what it holds, over a short 0.2 s fade without the scale (iOS `disclosureAnimation`).
 */
object CallPillMotion {
    const val UNFOLD_MILLIS: Int = 250
    const val REDUCED_MILLIS: Int = 200

    fun millis(reduceMotion: Boolean): Int = if (reduceMotion) REDUCED_MILLIS else UNFOLD_MILLIS

    /**
     * L3.3 — the width of the glass (440 → 560 dp past a 440 dp window) travels over the same curve as its height; a
     * width cannot fade, so « Reduce animations » lets it settle at once while the content cross-fades.
     */
    fun widthMillis(reduceMotion: Boolean): Int = if (reduceMotion) 0 else UNFOLD_MILLIS

    fun scalesOnUnfold(reduceMotion: Boolean): Boolean = !reduceMotion
}
