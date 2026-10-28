package me.meeshy.sdk.media

/**
 * **Le retrait des étiquettes d'un FLAC natif, SANS réencodage ni déplacement d'octet** (#13550, #13543).
 *
 * Après `fLaC` viennent des blocs de métadonnées (en-tête d'un octet — dernier bloc, type — et longueur sur trois). Restent
 * `STREAMINFO` (obligatoire, en premier), `SEEKTABLE` (des positions) et `PADDING` ; tout autre bloc — `VORBIS_COMMENT`
 * (titre, commentaire, lieu), `PICTURE`, `APPLICATION`, `CUESHEET`, type réservé — devient un `PADDING` de MÊME longueur mis
 * à zéro, si bien que les trames audio ne bougent pas. Un ID3v1 (`TAG`, 128 octets) posé en toute fin est coupé. Un bloc
 * qui déborde, un `STREAMINFO` absent ou mal dimensionné, un type 127, des trames qui ne commencent pas par la
 * synchronisation FLAC rendent `null` : l'appelant refuse l'envoi.
 */
internal object FlacMetadataScrubber {
    private const val STREAMINFO = 0
    private const val PADDING = 1
    private const val SEEKTABLE = 3
    private const val INVALID = 127
    private const val STREAMINFO_LENGTH = 34
    private const val ID3V1_SIZE = 128
    private val KEPT = setOf(STREAMINFO, PADDING, SEEKTABLE)

    private class Block(val type: Int, val headerAt: Int, val end: Int)

    fun looksLikeFlac(src: ByteArray): Boolean = src.size >= 4 && String(src, 0, 4, Charsets.ISO_8859_1) == "fLaC"

    /** Les blocs étiquettes devenus `PADDING` — le MÊME tableau s'il n'y avait rien à retirer — ou `null` s'il ne se lit pas. */
    fun scrub(src: ByteArray): ByteArray? {
        val blocks = blocks(src) ?: return null
        val audioAt = blocks.last().end
        if (audioAt + 2 > src.size || (src[audioAt].toInt() and 0xFF) != 0xFF || (src[audioAt + 1].toInt() and 0xFE) != 0xF8) return null
        val replaced = blocks.filter { it.type !in KEPT || (it.type == PADDING && !isZero(src, it)) }
        val keepsTrailer = hasId3v1(src, audioAt)
        if (replaced.isEmpty() && !keepsTrailer) return src
        val out = if (keepsTrailer) src.copyOf(src.size - ID3V1_SIZE) else src.copyOf()
        replaced.forEach { block ->
            out[block.headerAt] = ((out[block.headerAt].toInt() and 0x80) or PADDING).toByte()
            out.fill(0, block.headerAt + 4, block.end)
        }
        return out
    }

    private fun blocks(src: ByteArray): List<Block>? {
        if (!looksLikeFlac(src)) return null
        val found = mutableListOf<Block>()
        var at = 4
        while (true) {
            if (at + 4 > src.size) return null
            val header = src[at].toInt() and 0xFF
            val type = header and 0x7F
            val length = ((src[at + 1].toInt() and 0xFF) shl 16) or ((src[at + 2].toInt() and 0xFF) shl 8) or (src[at + 3].toInt() and 0xFF)
            val end = at + 4 + length
            if (type == INVALID || end > src.size) return null
            if (found.isEmpty() && (type != STREAMINFO || length != STREAMINFO_LENGTH)) return null
            if (found.isNotEmpty() && type == STREAMINFO) return null
            found += Block(type, at, end)
            at = end
            if (header and 0x80 != 0) return found
        }
    }

    private fun isZero(src: ByteArray, block: Block): Boolean = (block.headerAt + 4 until block.end).all { src[it].toInt() == 0 }

    private fun hasId3v1(src: ByteArray, audioAt: Int): Boolean {
        val at = src.size - ID3V1_SIZE
        return at > audioAt && src[at] == 'T'.code.toByte() && src[at + 1] == 'A'.code.toByte() && src[at + 2] == 'G'.code.toByte()
    }
}
