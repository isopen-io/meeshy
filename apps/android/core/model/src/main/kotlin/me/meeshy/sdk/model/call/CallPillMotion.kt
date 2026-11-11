package me.meeshy.sdk.model.call

/**
 * How the pill's glass unfolds and tightens (laws 11 and 17). The glass is never resized at once: with « Reduce
 * animations » it still follows what it holds, over a short 0.2 s fade without the scale (iOS `disclosureAnimation`).
 */
object CallPillMotion {
    const val UNFOLD_MILLIS: Int = 250
    const val REDUCED_MILLIS: Int = 200

    fun millis(reduceMotion: Boolean): Int = if (reduceMotion) REDUCED_MILLIS else UNFOLD_MILLIS

    fun scalesOnUnfold(reduceMotion: Boolean): Boolean = !reduceMotion
}
