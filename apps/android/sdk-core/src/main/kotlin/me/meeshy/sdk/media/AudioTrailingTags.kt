package me.meeshy.sdk.media

/**
 * **Les étiquettes qu'un lecteur ou un éditeur pose AUTOUR d'un flux audio** (#13550) — partagées par [Mp3MetadataScrubber]
 * et [FlacMetadataScrubber] : ID3v2 (taille synchsafe, en-tête étendu compris, pied `3DI`), APEv2 (avec ou sans en-tête),
 * Lyrics3 v1 et v2, ID3v1 (`TAG`, 128 octets). Une étiquette qui déborde ne se reconnaît pas.
 * Lues par position ([MediaBytes], #13551) : une étiquette se reconnaît sans charger le son qu'elle entoure.
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

    fun startsWithId3v2(media: MediaBytes, at: Long): Boolean = media.startsWithAt(at, ID3)

    /** La fin de l'ID3v2 qui commence à [at] (pied compris), ou `null` s'il est illisible ou déborde. */
    fun id3v2End(media: MediaBytes, at: Long): Long? {
        if (at + 10 > media.size || !media.startsWithAt(at, ID3)) return null
        val version = media.byteAt(at + 3)
        if (version !in 2..4) return null
        val size = synchsafe(media, at + 6) ?: return null
        val footer = if (version == 4 && (media.byteAt(at + 5) and 0x10) != 0) 10 else 0
        val end = at + 10 + size + footer
        return if (end <= media.size) end else null
    }

    /** `true` si [from] est la fin du fichier ou si une suite d'étiquettes connues couvre exactement `[from, fin)`. */
    fun coverRest(media: MediaBytes, from: Long): Boolean {
        var at = from
        while (at < media.size) at = tagEnd(media, at) ?: return false
        return true
    }

    /** La fin de l'étiquette connue qui commence à [at], ou `null`. */
    fun tagEnd(media: MediaBytes, at: Long): Long? = when {
        media.startsWithAt(at, APE) -> apeEnd(media, at)
        media.startsWithAt(at, LYRICS_BEGIN) -> lyricsEnd(media, at)
        media.startsWithAt(at, TAG) -> (at + ID3V1_SIZE).takeIf { it <= media.size }
        media.startsWithAt(at, ID3) -> id3v2End(media, at)
        media.startsWithAt(at, ID3_FOOTER) -> (at + 10).takeIf { it <= media.size }
        else -> null
    }

    private fun synchsafe(media: MediaBytes, at: Long): Long? {
        val bytes = (0 until 4).map { media.byteAt(at + it) }
        if (bytes.any { it !in 0 until 0x80 }) return null
        return bytes.fold(0L) { acc, b -> (acc shl 7) or b.toLong() }
    }

    private fun apeEnd(media: MediaBytes, at: Long): Long? {
        if (at + APE_FOOTER_SIZE > media.size) return null
        val size = media.u32LeAt(at + 12)
        val isHeader = (media.u32LeAt(at + 20) and 0x20000000L) != 0L
        val end = at + size + if (isHeader) APE_FOOTER_SIZE else 0
        return if (size >= APE_FOOTER_SIZE && end <= media.size) end else null
    }

    private fun lyricsEnd(media: MediaBytes, at: Long): Long? {
        val v2 = firstFrom(media, at, LYRICS_200)
        if (v2 != null && v2 - 6 >= at) {
            val size = media.ascii(v2 - 6, 6).toLongOrNull()
            if (size == v2 - 6 - at) return v2 + LYRICS_200.size
        }
        val v1 = firstFrom(media, at, LYRICS_END) ?: return null
        return v1 + LYRICS_END.size
    }

    private fun firstFrom(media: MediaBytes, from: Long, needle: ByteArray): Long? {
        var at = from
        while (at + needle.size <= media.size) {
            if (media.startsWithAt(at, needle)) return at
            at++
        }
        return null
    }

    private fun ascii(text: String) = text.toByteArray(Charsets.ISO_8859_1)
}
