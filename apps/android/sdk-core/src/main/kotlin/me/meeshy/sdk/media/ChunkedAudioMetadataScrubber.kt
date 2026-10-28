package me.meeshy.sdk.media

/**
 * **Le retrait des étiquettes d'un son WAV, AIFF ou CAF, SANS réencodage** (#13550, #13543).
 *
 * Ces trois conteneurs sont des suites de chunks qu'aucun autre chunk ne référence par position : on ne garde que ceux qui
 * DÉCRIVENT et PORTENT le son, en liste BLANCHE, et l'on recalcule la taille de l'enveloppe. Tout le reste tombe — WAV :
 * `LIST/INFO`, `bext` (Broadcast WAV : description, auteur, date, lieu), `iXML`, `id3 `, `_PMX` (XMP), `cart`, `cue `…
 * ; AIFF : `NAME`, `AUTH`, `(c) `, `ANNO`, `COMT`, `MARK`, `ID3 `, `APPL`… ; CAF : `info`, `uuid`, `strg`, `mark`, `regn`…
 * Une traîne après l'enveloppe est coupée. Un chunk qui déborde, une enveloppe tronquée, un chunk obligatoire absent rendent
 * `null` : l'appelant refuse l'envoi. RF64, BW64 et RIFX ne sont pas lus — refusés.
 *
 * Les chunks se lisent par leurs en-têtes ([MediaBytes], #13551) ; le plan ([MediaPlan]) est l'en-tête réécrit suivi des plages
 * gardées : un WAV de 200 Mo se nettoie sans qu'aucun tableau de sa taille n'existe.
 */
internal object ChunkedAudioMetadataScrubber {

    private class Chunk(val id: String, val start: Long, val end: Long)

    private val WAV_KEPT = listOf("fmt ", "fact", "data")
    private val AIFF_KEPT = listOf("FVER", "COMM", "SSND")
    private val CAF_KEPT = listOf("desc", "chan", "kuki", "pakt", "data")

    fun looksLikeWave(media: MediaBytes): Boolean = media.size >= 12 && media.ascii(0, 4) == "RIFF" && media.ascii(8, 4) == "WAVE"

    fun looksLikeAiff(media: MediaBytes): Boolean = media.size >= 12 && media.ascii(0, 4) == "FORM" && media.ascii(8, 4) in setOf("AIFF", "AIFC")

    fun looksLikeCaf(media: MediaBytes): Boolean = media.size >= 8 && media.ascii(0, 4) == "caff"

    /** Le WAV réduit à `fmt `, `fact` et `data` — l'identité s'il n'y avait rien à retirer — ou `null`. */
    fun wave(media: MediaBytes): MediaPlan? = runCatching { iff(media, littleEndian = true, kept = WAV_KEPT, required = listOf("fmt ", "data")) }.getOrNull()

    /** L'AIFF réduit à `FVER`, `COMM` et `SSND` — l'identité s'il n'y avait rien à retirer — ou `null`. */
    fun aiff(media: MediaBytes): MediaPlan? = runCatching { iff(media, littleEndian = false, kept = AIFF_KEPT, required = listOf("COMM", "SSND")) }.getOrNull()

    /** Le CAF réduit à `desc`, `chan`, `kuki`, `pakt` et `data` — l'identité s'il n'y avait rien à retirer — ou `null`. */
    fun caf(media: MediaBytes): MediaPlan? = runCatching { cafChunks(media) }.getOrNull()

    private fun iff(media: MediaBytes, littleEndian: Boolean, kept: List<String>, required: List<String>): MediaPlan {
        val envelopeEnd = 8L + u32(media, 4, littleEndian)
        if (envelopeEnd > media.size || envelopeEnd < 12) throw UnreadableMediaException("envelope")
        val chunks = mutableListOf<Chunk>()
        var at = 12L
        while (at < envelopeEnd) {
            if (at + 8 > envelopeEnd) throw UnreadableMediaException("chunk header")
            val size = u32(media, at + 4, littleEndian)
            val end = at + 8L + size + (size and 1L)
            val lastPadMissing = end == envelopeEnd + 1 && size % 2 == 1L
            if (end > envelopeEnd && !lastPadMissing) throw UnreadableMediaException("chunk past the envelope")
            chunks += Chunk(media.ascii(at, 4), at, minOf(end, envelopeEnd))
            at = end
        }
        val keptChunks = chunks.filter { it.id in kept }
        if (required.any { id -> keptChunks.count { it.id == id } != 1 }) throw UnreadableMediaException("required chunk")
        if (keptChunks.indexOfFirst { it.id == required[0] } > keptChunks.indexOfFirst { it.id == required[1] }) throw UnreadableMediaException("chunk order")
        if (keptChunks.size == chunks.size && envelopeEnd == media.size) return MediaPlan.identity(media.size)
        val body = keptChunks.sumOf { it.end - it.start }
        val header = media.bytes(0, 4) + u32Bytes(4L + body, littleEndian) + media.bytes(8, 4)
        return MediaPlan(listOf(MediaPlan.Piece.Literal(header)) + keptChunks.map { MediaPlan.Piece.Source(it.start, it.end) })
    }

    private fun cafChunks(media: MediaBytes): MediaPlan {
        if (!looksLikeCaf(media) || media.uintAt(4, 2) != 1L) throw UnreadableMediaException("caf version")
        val chunks = mutableListOf<Chunk>()
        var at = 8L
        while (at < media.size) {
            if (at + 12 > media.size) throw UnreadableMediaException("caf chunk header")
            val id = media.ascii(at, 4)
            val size = media.i64At(at + 4)
            val end = when {
                size == -1L && id == "data" -> media.size
                size < 0 -> throw UnreadableMediaException("caf chunk size")
                else -> at + 12L + size
            }
            if (end > media.size || end < at) throw UnreadableMediaException("caf chunk past the end")
            chunks += Chunk(id, at, end)
            at = end
        }
        if (chunks.firstOrNull()?.id != "desc" || chunks.count { it.id == "data" } != 1) throw UnreadableMediaException("caf chunks")
        val keptChunks = chunks.filter { it.id in CAF_KEPT }
        if (keptChunks.size == chunks.size) return MediaPlan.identity(media.size)
        return MediaPlan(listOf(MediaPlan.Piece.Source(0, 8)) + keptChunks.map { MediaPlan.Piece.Source(it.start, it.end) })
    }

    private fun u32(media: MediaBytes, at: Long, littleEndian: Boolean): Long = if (littleEndian) media.u32LeAt(at) else media.u32At(at)

    private fun u32Bytes(value: Long, littleEndian: Boolean): ByteArray {
        val big = ByteArray(4) { i -> (value ushr (8 * (3 - i))).toByte() }
        return if (littleEndian) big.reversedArray() else big
    }
}
