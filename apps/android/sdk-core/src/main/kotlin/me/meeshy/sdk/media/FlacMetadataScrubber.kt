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
 *
 * Le flux se parcourt par position ([MediaBytes], #13551) et le plan ([MediaPlan]) s'applique en flux : un FLAC de 200 Mo se
 * nettoie sans qu'aucun tableau de sa taille n'existe.
 */
internal object FlacMetadataScrubber {
    private const val STREAMINFO = 0
    private const val PADDING = 1
    private const val SEEKTABLE = 3
    private const val INVALID = 127
    private const val STREAMINFO_LENGTH = 34
    private val KEPT = setOf(STREAMINFO, PADDING, SEEKTABLE)
    private val MAGIC = "fLaC".toByteArray(Charsets.ISO_8859_1)

    private class Block(val type: Int, val header: Int, val headerAt: Long, val end: Long)

    fun looksLikeFlac(media: MediaBytes): Boolean = media.startsWithAt(0, MAGIC)

    /** Les blocs étiquettes devenus `PADDING`, la traîne coupée — l'identité s'il n'y avait rien à retirer — ou `null`. */
    fun plan(media: MediaBytes): MediaPlan? {
        val blocks = blocks(media) ?: return null
        val streamEnd = streamEnd(media, blocks.last().end) ?: return null
        val replaced = blocks.filter { it.type !in KEPT || (it.type == PADDING && !media.isZero(it.headerAt + 4, it.end)) }
        val edits = replaced.flatMap { block ->
            listOf(
                MediaEdit.Overwrite(block.headerAt, byteArrayOf(((block.header and 0x80) or PADDING).toByte())),
                MediaEdit.Zero(block.headerAt + 4, block.end),
            )
        }
        return MediaPlan.edited(streamEnd, edits)
    }

    /** La fin de la dernière trame : chaque trame se clôt là où son CRC-16 s'annule ET qu'une trame, la fin ou des étiquettes suivent. */
    private fun streamEnd(media: MediaBytes, audioAt: Long): Long? {
        var frame = audioAt
        while (true) {
            val headerLength = headerLength(media, frame) ?: return null
            var crc = (frame until frame + headerLength).fold(0) { acc, i -> crc16(acc, media.byteAt(i)) }
            var at = frame + headerLength
            var next: Long? = null
            while (at < media.size && next == null) {
                crc = crc16(crc, media.byteAt(at))
                at++
                if (crc != 0) continue
                when {
                    at == media.size || AudioTrailingTags.coverRest(media, at) -> return at
                    headerLength(media, at) != null -> next = at
                }
            }
            frame = next ?: return null
        }
    }

    /** La longueur de l'en-tête de trame FLAC qui commence à [at], CRC-8 compris et vérifié, ou `null`. */
    private fun headerLength(media: MediaBytes, at: Long): Int? {
        if (at + 6 > media.size) return null
        if (media.byteAt(at) != 0xFF || (media.byteAt(at + 1) and 0xFE) != 0xF8) return null
        val b2 = media.byteAt(at + 2)
        val b3 = media.byteAt(at + 3)
        val blockSize = (b2 and 0xF0) shr 4
        val sampleRate = b2 and 0x0F
        val channels = (b3 and 0xF0) shr 4
        val sampleSize = (b3 and 0x0E) shr 1
        if (blockSize == 0 || sampleRate == 15 || channels > 10 || sampleSize == 3 || (b3 and 1) != 0) return null
        val numberLength = utf8Length(media, at + 4) ?: return null
        val extra = (if (blockSize == 6) 1 else if (blockSize == 7) 2 else 0) + (if (sampleRate == 12) 1 else if (sampleRate in 13..14) 2 else 0)
        val crcAt = at + 4 + numberLength + extra
        if (crcAt >= media.size) return null
        val crc = (at until crcAt).fold(0) { acc, i -> crc8(acc, media.byteAt(i)) }
        return if (crc == media.byteAt(crcAt)) (crcAt + 1 - at).toInt() else null
    }

    private fun utf8Length(media: MediaBytes, at: Long): Int? {
        val first = media.byteAt(at)
        val length = when {
            first < 0 -> return null
            first < 0x80 -> 1
            first in 0xC0..0xDF -> 2
            first in 0xE0..0xEF -> 3
            first in 0xF0..0xF7 -> 4
            first in 0xF8..0xFB -> 5
            first in 0xFC..0xFD -> 6
            first == 0xFE -> 7
            else -> return null
        }
        if (at + length > media.size || (1 until length).any { (media.byteAt(at + it) and 0xC0) != 0x80 }) return null
        return length
    }

    private fun crc8(crc: Int, byte: Int): Int = (0 until 8).fold(crc xor byte) { acc, _ ->
        if (acc and 0x80 != 0) ((acc shl 1) xor 0x07) and 0xFF else (acc shl 1) and 0xFF
    }

    private fun crc16(crc: Int, byte: Int): Int = CRC16_TABLE[((crc ushr 8) xor byte) and 0xFF] xor ((crc shl 8) and 0xFFFF)

    private val CRC16_TABLE = IntArray(256) { index ->
        (0 until 8).fold(index shl 8) { acc, _ -> if (acc and 0x8000 != 0) ((acc shl 1) xor 0x8005) and 0xFFFF else (acc shl 1) and 0xFFFF }
    }

    private fun blocks(media: MediaBytes): List<Block>? {
        if (!looksLikeFlac(media)) return null
        val found = mutableListOf<Block>()
        var at = 4L
        while (true) {
            if (at + 4 > media.size) return null
            val header = media.byteAt(at)
            val type = header and 0x7F
            val length = media.uintAt(at + 1, 3)
            val end = at + 4 + length
            if (type == INVALID || end > media.size) return null
            if (found.isEmpty() && (type != STREAMINFO || length != STREAMINFO_LENGTH.toLong())) return null
            if (found.isNotEmpty() && type == STREAMINFO) return null
            found += Block(type, header, at, end)
            at = end
            if (header and 0x80 != 0) return found
        }
    }
}
