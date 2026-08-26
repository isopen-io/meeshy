package me.meeshy.app.stories

/**
 * The composer's background-image framing, expressed in the wire's **normalised**
 * coordinates — the exact `x`/`y`/`scale` a background [me.meeshy.sdk.model.StoryMediaObject]
 * carries. It is the author-side inverse of the reader's [StoryBackgroundObjectTransform]:
 * where the reader reads `x`/`y` as an offset FROM CENTRE (`(x - 0.5) * canvasSize`), the
 * composer writes `x = 0.5 + offsetX / canvasWidth`, so a story framed by an Android author
 * renders identically on every client.
 *
 * [x]/[y] are canvas fractions (0.5 = centred); [scale] is the zoom multiplier (1.0 = the
 * plain aspect-fill). The neutral [IDENTITY] matches `StoryMediaObject`'s own field defaults,
 * so an unframed background serialises to the bare defaults.
 */
data class StoryBackgroundFraming(
    val x: Double,
    val y: Double,
    val scale: Double,
) {
    /** At rest — a plain aspect-fill with no pan or zoom, so nothing needs to ride the wire. */
    val isIdentity: Boolean get() = x == 0.5 && y == 0.5 && scale == 1.0

    companion object {
        /** No framing — dead-centre, unscaled; identical to `StoryMediaObject`'s x/y/scale defaults. */
        val IDENTITY: StoryBackgroundFraming = StoryBackgroundFraming(x = 0.5, y = 0.5, scale = 1.0)
    }
}
