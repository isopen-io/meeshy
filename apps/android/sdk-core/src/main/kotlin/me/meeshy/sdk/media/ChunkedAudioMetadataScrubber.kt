package me.meeshy.sdk.media

import java.io.ByteArrayOutputStream

/**
 * **Le retrait des étiquettes d'un son WAV, AIFF ou CAF, SANS réencodage** (#13550, #13543).
 *
 * Ces trois conteneurs sont des suites de chunks qu'aucun autre chunk ne référence par position : on ne garde que ceux qui
 * DÉCRIVENT et PORTENT le son, en liste BLANCHE, et l'on recalcule la taille de l'enveloppe. Tout le reste tombe — WAV :
 * `LIST/INFO`, `bext` (Broadcast WAV : description, auteur, date, lieu), `iXML`, `id3 `, `_PMX` (XMP), `cart`, `cue `…
 * ; AIFF : `NAME`, `AUTH`, `(c) `, `ANNO`, `COMT`, `MARK`, `ID3 `, `APPL`… ; CAF : `info`, `uuid`, `strg`, `mark`, `regn`…
 * Une traîne après l'enveloppe est coupée. Un chunk qui déborde, une enveloppe tronquée, un chunk obligatoire absent rendent
 * `null` : l'appelant refuse l'envoi. RF64, BW64 et RIFX ne sont pas lus — refusés.
 */
internal object ChunkedAudioMetadataScrubber {

    private class Unreadable : Exception()

    private class Chunk(val id: String, val start: Int, val end: Int)

    private val WAV_KEPT = listOf("fmt ", "fact", "data")
    private val AIFF_KEPT = listOf("FVER", "COMM", "SSND")
    private val CAF_KEPT = listOf("desc", "chan", "kuki", "pakt", "data")

    fun looksLikeWave(src: ByteArray): Boolean = src.size >= 12 && src.ascii(0) == "RIFF" && src.ascii(8) == "WAVE"

    fun looksLikeAiff(src: ByteArray): Boolean = src.size >= 12 && src.ascii(0) == "FORM" && src.ascii(8) in setOf("AIFF", "AIFC")

    fun looksLikeCaf(src: ByteArray): Boolean = src.size >= 8 && src.ascii(0) == "caff"

    /** Le WAV réduit à `fmt `, `fact` et `data` — le MÊME tableau s'il n'y avait rien à retirer — ou `null`. */
    fun wave(src: ByteArray): ByteArray? = runCatching { iff(src, littleEndian = true, kept = WAV_KEPT, required = listOf("fmt ", "data")) }.getOrNull()

    /** L'AIFF réduit à `FVER`, `COMM` et `SSND` — le MÊME tableau s'il n'y avait rien à retirer — ou `null`. */
    fun aiff(src: ByteArray): ByteArray? = runCatching { iff(src, littleEndian = false, kept = AIFF_KEPT, required = listOf("COMM", "SSND")) }.getOrNull()

    /** Le CAF réduit à `desc`, `chan`, `kuki`, `pakt` et `data` — le MÊME tableau s'il n'y avait rien à retirer — ou `null`. */
    fun caf(src: ByteArray): ByteArray? = runCatching { cafChunks(src) }.getOrNull()

    private fun iff(src: ByteArray, littleEndian: Boolean, kept: List<String>, required: List<String>): ByteArray {
        val envelopeEnd = 8L + u32(src, 4, littleEndian)
        if (envelopeEnd > src.size || envelopeEnd < 12) throw Unreadable()
        val chunks = mutableListOf<Chunk>()
        var at = 12
        while (at < envelopeEnd) {
            if (at + 8 > envelopeEnd) throw Unreadable()
            val size = u32(src, at + 4, littleEndian)
            val end = at + 8L + size + (size and 1L)
            val lastPadMissing = end == envelopeEnd + 1 && size % 2 == 1L
            if (end > envelopeEnd && !lastPadMissing) throw Unreadable()
            chunks += Chunk(src.ascii(at), at, minOf(end, envelopeEnd).toInt())
            at = end.toInt()
        }
        val keptChunks = chunks.filter { it.id in kept }
        if (required.any { id -> keptChunks.count { it.id == id } != 1 }) throw Unreadable()
        if (keptChunks.indexOfFirst { it.id == required[0] } > keptChunks.indexOfFirst { it.id == required[1] }) throw Unreadable()
        if (keptChunks.size == chunks.size && envelopeEnd == src.size.toLong()) return src
        val body = ByteArrayOutputStream()
        keptChunks.forEach { body.write(src, it.start, it.end - it.start) }
        val out = ByteArrayOutputStream()
        out.write(src, 0, 4)
        out.write(u32Bytes(4L + body.size(), littleEndian))
        out.write(src, 8, 4)
        body.writeTo(out)
        return out.toByteArray()
    }

    private fun cafChunks(src: ByteArray): ByteArray {
        if (!looksLikeCaf(src) || u16(src, 4) != 1) throw Unreadable()
        val chunks = mutableListOf<Chunk>()
        var at = 8
        while (at < src.size) {
            if (at + 12 > src.size) throw Unreadable()
            val id = src.ascii(at)
            val size = (0 until 8).fold(0L) { acc, i -> (acc shl 8) or (src[at + 4 + i].toLong() and 0xFF) }
            val end = when {
                size == -1L && id == "data" -> src.size.toLong()
                size < 0 -> throw Unreadable()
                else -> at + 12L + size
            }
            if (end > src.size) throw Unreadable()
            chunks += Chunk(id, at, end.toInt())
            at = end.toInt()
        }
        if (chunks.firstOrNull()?.id != "desc" || chunks.count { it.id == "data" } != 1) throw Unreadable()
        val keptChunks = chunks.filter { it.id in CAF_KEPT }
        if (keptChunks.size == chunks.size) return src
        val out = ByteArrayOutputStream()
        out.write(src, 0, 8)
        keptChunks.forEach { out.write(src, it.start, it.end - it.start) }
        return out.toByteArray()
    }

    private fun ByteArray.ascii(at: Int): String = String(this, at, 4, Charsets.ISO_8859_1)

    private fun u16(src: ByteArray, at: Int): Int = ((src[at].toInt() and 0xFF) shl 8) or (src[at + 1].toInt() and 0xFF)

    private fun u32(src: ByteArray, at: Int, littleEndian: Boolean): Long = (0 until 4).fold(0L) { acc, i ->
        val byte = src[at + if (littleEndian) 3 - i else i].toLong() and 0xFF
        (acc shl 8) or byte
    }

    private fun u32Bytes(value: Long, littleEndian: Boolean): ByteArray {
        val big = ByteArray(4) { i -> (value ushr (8 * (3 - i))).toByte() }
        return if (littleEndian) big.reversedArray() else big
    }
}
