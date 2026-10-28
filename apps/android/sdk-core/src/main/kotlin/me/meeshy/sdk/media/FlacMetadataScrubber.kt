package me.meeshy.sdk.media

/**
 * **Le retrait des étiquettes d'un FLAC natif, SANS réencodage ni déplacement d'octet** (#13550, #13543).
 *
 * Après `fLaC` viennent des blocs de métadonnées (en-tête d'un octet — dernier bloc, type — et longueur sur trois). Restent
 * `STREAMINFO` (obligatoire, en premier), `SEEKTABLE` (des positions) et `PADDING` ; tout autre bloc — `VORBIS_COMMENT`
 * (titre, commentaire, lieu), `PICTURE`, `APPLICATION`, `CUESHEET`, type réservé — devient un `PADDING` de MÊME longueur mis
 * à zéro, si bien que les trames audio ne bougent pas. Les trames se PARCOURENT jusqu'à la fin du flux — chacune reconnue à
 * son en-tête (CRC-8) et close par son CRC-16 — et ce qui les suit doit être une suite d'étiquettes connues ([AudioTrailingTags] :
 * APEv2, ID3v2, Lyrics3, ID3v1), coupée ; toute autre traîne, un bloc qui déborde, un `STREAMINFO` absent ou mal dimensionné,
 * un type 127, une trame illisible ou tronquée rendent `null` : l'appelant refuse l'envoi.
 */
internal object FlacMetadataScrubber {
    private const val STREAMINFO = 0
    private const val PADDING = 1
    private const val SEEKTABLE = 3
    private const val INVALID = 127
    private const val STREAMINFO_LENGTH = 34
    private val KEPT = setOf(STREAMINFO, PADDING, SEEKTABLE)

    private class Block(val type: Int, val headerAt: Int, val end: Int)

    fun looksLikeFlac(src: ByteArray): Boolean = src.size >= 4 && String(src, 0, 4, Charsets.ISO_8859_1) == "fLaC"

    /** Les blocs étiquettes devenus `PADDING`, la traîne coupée — le MÊME tableau s'il n'y avait rien à retirer — ou `null`. */
    fun scrub(src: ByteArray): ByteArray? {
        val blocks = blocks(src) ?: return null
        val streamEnd = streamEnd(src, blocks.last().end) ?: return null
        val replaced = blocks.filter { it.type !in KEPT || (it.type == PADDING && !isZero(src, it)) }
        if (replaced.isEmpty() && streamEnd == src.size) return src
        val out = src.copyOf(streamEnd)
        replaced.forEach { block ->
            out[block.headerAt] = ((out[block.headerAt].toInt() and 0x80) or PADDING).toByte()
            out.fill(0, block.headerAt + 4, block.end)
        }
        return out
    }

    /** La fin de la dernière trame : chaque trame se clôt là où son CRC-16 s'annule ET qu'une trame, la fin ou des étiquettes suivent. */
    private fun streamEnd(src: ByteArray, audioAt: Int): Int? {
        var frame = audioAt
        while (true) {
            val headerLength = headerLength(src, frame) ?: return null
            var crc = (frame until frame + headerLength).fold(0) { acc, i -> crc16(acc, src[i]) }
            var at = frame + headerLength
            var next: Int? = null
            while (at < src.size && next == null) {
                crc = crc16(crc, src[at])
                at++
                if (crc != 0) continue
                when {
                    at == src.size || AudioTrailingTags.coverRest(src, at) -> return at
                    headerLength(src, at) != null -> next = at
                }
            }
            frame = next ?: return null
        }
    }

    /** La longueur de l'en-tête de trame FLAC qui commence à [at], CRC-8 compris et vérifié, ou `null`. */
    private fun headerLength(src: ByteArray, at: Int): Int? {
        if (at + 6 > src.size) return null
        if ((src[at].toInt() and 0xFF) != 0xFF || (src[at + 1].toInt() and 0xFE) != 0xF8) return null
        val blockSize = (src[at + 2].toInt() and 0xF0) shr 4
        val sampleRate = src[at + 2].toInt() and 0x0F
        val channels = (src[at + 3].toInt() and 0xF0) shr 4
        val sampleSize = (src[at + 3].toInt() and 0x0E) shr 1
        if (blockSize == 0 || sampleRate == 15 || channels > 10 || sampleSize == 3 || (src[at + 3].toInt() and 1) != 0) return null
        val numberLength = utf8Length(src, at + 4) ?: return null
        val extra = (if (blockSize == 6) 1 else if (blockSize == 7) 2 else 0) + (if (sampleRate == 12) 1 else if (sampleRate in 13..14) 2 else 0)
        val crcAt = at + 4 + numberLength + extra
        if (crcAt >= src.size) return null
        val crc = (at until crcAt).fold(0) { acc, i -> crc8(acc, src[i]) }
        return if (crc == (src[crcAt].toInt() and 0xFF)) crcAt + 1 - at else null
    }

    private fun utf8Length(src: ByteArray, at: Int): Int? {
        val first = src[at].toInt() and 0xFF
        val length = when {
            first < 0x80 -> 1
            first in 0xC0..0xDF -> 2
            first in 0xE0..0xEF -> 3
            first in 0xF0..0xF7 -> 4
            first in 0xF8..0xFB -> 5
            first in 0xFC..0xFD -> 6
            first == 0xFE -> 7
            else -> return null
        }
        if (at + length > src.size || (1 until length).any { (src[at + it].toInt() and 0xC0) != 0x80 }) return null
        return length
    }

    private fun crc8(crc: Int, byte: Byte): Int = (0 until 8).fold(crc xor (byte.toInt() and 0xFF)) { acc, _ ->
        if (acc and 0x80 != 0) ((acc shl 1) xor 0x07) and 0xFF else (acc shl 1) and 0xFF
    }

    private fun crc16(crc: Int, byte: Byte): Int = CRC16_TABLE[((crc ushr 8) xor (byte.toInt() and 0xFF)) and 0xFF] xor ((crc shl 8) and 0xFFFF)

    private val CRC16_TABLE = IntArray(256) { index ->
        (0 until 8).fold(index shl 8) { acc, _ -> if (acc and 0x8000 != 0) ((acc shl 1) xor 0x8005) and 0xFFFF else (acc shl 1) and 0xFFFF }
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
}
