package me.meeshy.sdk.model.text

import java.text.BreakIterator
import me.meeshy.sdk.model.MessageSegment

/** One painted letter: the [start, end) UTF-16 range of a grapheme inside segment [segment]. */
data class RainbowLetter(val segment: Int, val start: Int, val end: Int, val colorIndex: Int)

/**
 * The rainbow of the Script mode: no outline, every ordinary LETTER a colour
 * drawn at random. The draw is SEEDED by the message id (FNV-1a then SplitMix64,
 * bit for bit the iOS `RainbowLetters`) so a letter keeps its colour from one
 * render to the next, and two neighbours never share a hue.
 */
object RainbowLetters {

    /** Deep shades on a light background, light ones on a dark background (>= 4.5:1). */
    fun paletteHex(isDark: Boolean): List<String> =
        if (isDark) listOf("#A5B4FC", "#F0ABFC", "#FDA4AF", "#FCD34D", "#6EE7B7", "#7DD3FC")
        else listOf("#4338CA", "#A21CAF", "#BE123C", "#92400E", "#047857", "#0369A1")

    /** `count` palette indices, deterministic for [seed], no two neighbours equal. */
    fun colorIndices(count: Int, seed: String, paletteSize: Int): List<Int> {
        if (count <= 0 || paletteSize <= 0) return emptyList()
        val size = paletteSize.toULong()
        var state = fnv1a(seed)
        val indices = ArrayList<Int>(count)
        repeat(count) {
            state = splitMix(state)
            var index = (state % size).toInt()
            val previous = indices.lastOrNull()
            if (paletteSize > 1 && previous == index) {
                index = ((index + 1 + ((state shr 32) % (size - 1uL)).toInt()) % paletteSize)
            }
            indices += index
        }
        return indices
    }

    /** The seed of a rainbow message's letters (its id), null when the effect is off. */
    fun seed(rainbow: Boolean, messageId: String): String? = if (rainbow) messageId else null

    /**
     * Which letters to paint. Only ORDINARY runs (text and inline code) take
     * colour — never mentions, hashtags or links — and whitespace is skipped. The
     * text itself is unchanged; a renderer maps each letter range to a colour.
     */
    fun letters(segments: List<MessageSegment>, seed: String, paletteSize: Int): List<RainbowLetter> {
        val ranges = segments.flatMapIndexed { position, segment ->
            val text = when (segment) {
                is MessageSegment.Text -> segment.text
                is MessageSegment.Code -> segment.text
                else -> return@flatMapIndexed emptyList()
            }
            graphemes(text).filter { (start, end) -> !text.substring(start, end).all(Char::isWhitespace) }
                .map { (start, end) -> Triple(position, start, end) }
        }
        return ranges.zip(colorIndices(ranges.size, seed, paletteSize)) { (position, start, end), color ->
            RainbowLetter(position, start, end, color)
        }
    }

    private fun graphemes(text: String): List<Pair<Int, Int>> {
        val iterator = BreakIterator.getCharacterInstance()
        iterator.setText(text)
        val result = ArrayList<Pair<Int, Int>>()
        var start = iterator.first()
        var end = iterator.next()
        while (end != BreakIterator.DONE) {
            result += start to end
            start = end
            end = iterator.next()
        }
        return result
    }

    private fun fnv1a(text: String): ULong {
        var hash = 0xcbf29ce484222325uL
        for (byte in text.toByteArray(Charsets.UTF_8)) {
            hash = (hash xor byte.toUByte().toULong()) * 0x100000001b3uL
        }
        return hash
    }

    private fun splitMix(x: ULong): ULong {
        var z = x + 0x9E3779B97F4A7C15uL
        z = (z xor (z shr 30)) * 0xBF58476D1CE4E5B9uL
        z = (z xor (z shr 27)) * 0x94D049BB133111EBuL
        return z xor (z shr 31)
    }
}
