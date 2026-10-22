package me.meeshy.sdk.model.composer

/**
 * What it takes for a row of entries to FIT the width it is given — port of iOS
 * `ComposerRowFit`. **The gap tightens while everything fits, never under its floor;
 * beyond that the row scrolls and the last entry must at least PEEK past the edge.**
 * Tightening answers an overflow, it is never a permanent setting. All numbers are
 * parameters (dp): the rule is the arithmetic, not the values.
 */
object ComposerRowFit {

    /**
     * The RENDERED gap between two entries. An unknown width (`<= 0`) answers the
     * nominal gap, never an estimate: a row born tight then relaxing would make the
     * glyphs jump under the finger.
     */
    fun spacing(
        count: Int,
        tileWidth: Float,
        nominalSpacing: Float,
        minimumSpacing: Float,
        margin: Float,
        available: Float,
    ): Float {
        if (count <= 1 || available <= 0f) return nominalSpacing
        val required = rowWidth(count, tileWidth, nominalSpacing, margin)
        if (required <= available) return nominalSpacing
        val remaining = available - count * tileWidth - 2 * margin
        return maxOf(minimumSpacing, remaining / (count - 1))
    }

    /** The width the row occupies at that gap, margins included. Zero entries occupy nothing. */
    fun rowWidth(count: Int, tileWidth: Float, spacing: Float, margin: Float): Float =
        if (count <= 0) 0f else count * tileWidth + (count - 1) * spacing + 2 * margin

    /**
     * Does the last entry show something? The witness is the START of the last entry —
     * the first pixel is the signal: half an entry says "there is more", an entry fully
     * out of the field says nothing.
     */
    fun lastTilePeeks(count: Int, tileWidth: Float, spacing: Float, margin: Float, available: Float): Boolean {
        if (count <= 0 || available <= 0f) return false
        return margin + (count - 1) * (tileWidth + spacing) < available
    }
}
