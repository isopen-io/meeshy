package me.meeshy.sdk.media

/**
 * A pattern to find anywhere in a media (#13551): [firstBytes] marks the octets a match can START with (a cheap filter
 * over each window), [matchesAt] confirms a candidate. [matchesAt] reads through [MediaBytes.byteAt], so a match may run
 * past the window it starts in — and past any fixed length: a coordinate with forty decimals is still one match.
 */
internal interface MediaSignature {
    val firstBytes: BooleanArray

    fun matchesAt(media: MediaBytes, at: Long): Boolean
}

/**
 * The whole-media scan a scrubber's verification runs: windows of [WINDOW_BYTES] read in turn, every position of every
 * window offered to [MediaSignature.firstBytes], candidates confirmed by [MediaSignature.matchesAt] over the MEDIA, not
 * the window — so a signature straddling two windows is found like any other. Memory: one window plus the reader's
 * cache, whatever the size of the media.
 */
internal object MediaSignatureScan {
    const val WINDOW_BYTES: Int = 64 * 1024

    fun foundIn(media: MediaBytes, signature: MediaSignature): Boolean {
        val window = ByteArray(WINDOW_BYTES)
        val first = signature.firstBytes
        var start = 0L
        while (start < media.size) {
            val count = minOf(WINDOW_BYTES.toLong(), media.size - start).toInt()
            media.read(start, window, 0, count)
            for (i in 0 until count) {
                if (first[window[i].toInt() and 0xFF] && signature.matchesAt(media, start + i)) return true
            }
            start += count
        }
        return false
    }
}
