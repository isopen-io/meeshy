package me.meeshy.sdk.media

/**
 * **Les étiquettes qu'un lecteur ou un éditeur pose AUTOUR d'un flux audio** (#13550) — partagées par [Mp3MetadataScrubber]
 * et [FlacMetadataScrubber] : ID3v2 (taille synchsafe, en-tête étendu compris, pied `3DI`), APEv2 (avec ou sans en-tête),
 * Lyrics3 v1 et v2, ID3v1 (`TAG`, 128 octets). Une étiquette qui déborde ne se reconnaît pas.
 */
internal object AudioTrailingTags {
    private const val ID3V1_SIZE = 128
    private const val APE_FOOTER_SIZE = 32

    private val ID3 = ascii("ID3")
    private val ID3_FOOTER = ascii("3DI")
    private val TAG = ascii("TAG")
    private val APE = ascii("APETAGEX")
    private val LYRICS_BEGIN = ascii("LYRICSBEGIN")
    private val LYRICS_END = ascii("LYRICSEND")
    private val LYRICS_200 = ascii("LYRICS200")

    fun startsWithId3v2(src: ByteArray, at: Int): Boolean = src.startsWithAt(at, ID3)

    /** La fin de l'ID3v2 qui commence à [at] (pied compris), ou `null` s'il est illisible ou déborde. */
    fun id3v2End(src: ByteArray, at: Int): Int? {
        if (at + 10 > src.size || !src.startsWithAt(at, ID3)) return null
        val version = src[at + 3].toInt() and 0xFF
        if (version !in 2..4) return null
        val size = synchsafe(src, at + 6) ?: return null
        val footer = if (version == 4 && (src[at + 5].toInt() and 0x10) != 0) 10 else 0
        val end = at.toLong() + 10 + size + footer
        return if (end <= src.size) end.toInt() else null
    }

    /** `true` si [from] est la fin du fichier ou si une suite d'étiquettes connues couvre exactement `[from, fin)`. */
    fun coverRest(src: ByteArray, from: Int): Boolean {
        var at = from
        while (at < src.size) at = tagEnd(src, at) ?: return false
        return true
    }

    /** La fin de l'étiquette connue qui commence à [at], ou `null`. */
    fun tagEnd(src: ByteArray, at: Int): Int? = when {
        src.startsWithAt(at, APE) -> apeEnd(src, at)
        src.startsWithAt(at, LYRICS_BEGIN) -> lyricsEnd(src, at)
        src.startsWithAt(at, TAG) -> (at + ID3V1_SIZE).takeIf { it <= src.size }
        src.startsWithAt(at, ID3) -> id3v2End(src, at)
        src.startsWithAt(at, ID3_FOOTER) -> (at + 10).takeIf { it <= src.size }
        else -> null
    }

    private fun synchsafe(src: ByteArray, at: Int): Int? {
        val bytes = (0 until 4).map { src[at + it].toInt() and 0xFF }
        if (bytes.any { it >= 0x80 }) return null
        return bytes.fold(0) { acc, b -> (acc shl 7) or b }
    }

    private fun apeEnd(src: ByteArray, at: Int): Int? {
        if (at + APE_FOOTER_SIZE > src.size) return null
        val size = le32(src, at + 12)
        val isHeader = (le32(src, at + 20) and 0x20000000L) != 0L
        val end = at.toLong() + size + if (isHeader) APE_FOOTER_SIZE else 0
        return if (size >= APE_FOOTER_SIZE && end <= src.size) end.toInt() else null
    }

    private fun lyricsEnd(src: ByteArray, at: Int): Int? {
        val v2 = (at until src.size - LYRICS_200.size + 1).firstOrNull { src.startsWithAt(it, LYRICS_200) }
        if (v2 != null && v2 - 6 >= at) {
            val size = String(src, v2 - 6, 6, Charsets.ISO_8859_1).toIntOrNull()
            if (size == v2 - 6 - at) return v2 + LYRICS_200.size
        }
        val v1 = (at until src.size - LYRICS_END.size + 1).firstOrNull { src.startsWithAt(it, LYRICS_END) } ?: return null
        return v1 + LYRICS_END.size
    }

    private fun le32(src: ByteArray, at: Int): Long =
        (0 until 4).fold(0L) { acc, i -> acc or ((src[at + i].toLong() and 0xFF) shl (8 * i)) }

    private fun ascii(text: String) = text.toByteArray(Charsets.ISO_8859_1)

    private fun ByteArray.startsWithAt(at: Int, prefix: ByteArray): Boolean =
        at >= 0 && at + prefix.size <= size && prefix.indices.all { this[at + it] == prefix[it] }
}
