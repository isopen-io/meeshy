package me.meeshy.sdk.media

/**
 * **Le retrait des métadonnées d'une vidéo ou d'un son WebM / Matroska, SANS réencodage ni déplacement d'octet** (#13543).
 *
 * Même principe que [IsoMediaMetadataScrubber] : un élément retiré devient un élément `Void` (0xEC) de MÊME taille, contenu
 * mis à zéro — aucune position (SeekHead, Cues) ne bouge. Liste BLANCHE au niveau du segment : `SeekHead`, `Info`, `Tracks`,
 * `Cues`, `Cluster`, `Void`, `CRC-32` restent ; `Tags` (où un enregistreur pose `LOCATION`), `Attachments`, `Chapters` (texte
 * libre) deviennent `Void` ; un élément de premier niveau INCONNU fait refuser le fichier. Dans `Info` ne restent que
 * l'échelle de temps, la durée et l'identifiant du segment (titre, nom de fichier, date, applications : `Void`) ; seules
 * les pistes vidéo et audio sont admises, réduites à leurs champs techniques (nom, langue, nom de codec, `BlockAdditionMapping`
 * : `Void`) ; toute AUTRE piste (sous-titres, métadonnées, complex, boutons — #13543, revue de sécurité) devient `Void`, et
 * tout bloc dont la piste n'est pas admise — déclarée ou non — aussi, comme chaque `BlockAdditions`. Un `Cluster` de taille inconnue (enregistrement en direct) se
 * parcourt jusqu'au prochain élément de premier niveau. Tout ce qui ne se lit pas rend `null` : l'appelant refuse l'envoi.
 */
internal object MatroskaMetadataScrubber {
    private const val EBML = 0x1A45DFA3L
    private const val SEGMENT = 0x18538067L
    private const val CLUSTER = 0x1F43B675L
    private const val INFO = 0x1549A966L
    private const val TRACKS = 0x1654AE6BL
    private const val TRACK_ENTRY = 0xAEL
    private const val VOID = 0xECL
    private const val CRC32 = 0xBFL
    private val SEGMENT_KEPT = setOf(0x114D9B74L, 0x1C53BB6BL, CLUSTER, VOID, CRC32)
    private val DROPPED = setOf(0x1254C367L, 0x1941A469L, 0x1043A770L)
    private val LEVEL_ONE = SEGMENT_KEPT + DROPPED + setOf(INFO, TRACKS)
    private val INFO_KEPT = setOf(0x2AD7B1L, 0x4489L, 0x73A4L, CRC32)
    private const val TRACK_NUMBER = 0xD7L
    private const val TRACK_TYPE = 0x83L
    private const val CODEC_ID = 0x86L
    private const val CONTENT_ENCODINGS = 0x6D80L
    private val TRACK_KEPT = setOf(
        0xD7L, 0x73C5L, 0x83L, 0xB9L, 0x88L, 0x55AAL, 0x9CL, 0x6DE7L, 0x6DF8L, 0x23E383L, 0x234E7AL, 0x23314FL, 0x55EEL,
        0x86L, 0x63A2L, 0x56AAL, 0x56BBL, 0xAAL, 0xE0L, 0xE1L, CRC32,
    )
    private const val TYPE_VIDEO = 1L
    private const val TYPE_AUDIO = 2L
    private const val SIMPLE_BLOCK = 0xA3L
    private const val BLOCK_GROUP = 0xA0L
    private const val BLOCK = 0xA1L
    private val CLUSTER_KEPT = setOf(0xE7L, 0x5854L, 0xA7L, 0xABL, CRC32)
    private val BLOCK_GROUP_KEPT = setOf(BLOCK, 0x9BL, 0xFAL, 0xFBL, 0xA4L, 0x75A2L, 0x8EL, CRC32)

    private class Element(val id: Long, val offset: Int, val dataStart: Int, val end: Int, val unknownSize: Boolean)

    private class Unreadable : Exception()

    fun looksLikeMatroska(src: ByteArray): Boolean =
        src.size >= 4 && (src[0].toInt() and 0xFF) == 0x1A && (src[1].toInt() and 0xFF) == 0x45 &&
            (src[2].toInt() and 0xFF) == 0xDF && (src[3].toInt() and 0xFF) == 0xA3

    /** Les octets sans `Tags`, `Attachments` ni titre — le MÊME tableau s'il n'y avait rien à retirer — ou `null` s'ils sont illisibles. */
    fun scrub(src: ByteArray): ByteArray? {
        val voids = runCatching { plan(src) }.getOrNull() ?: return null
        val changes = voids.filter { !it.isVoidOf(src) }
        if (changes.isEmpty()) return src
        val out = src.copyOf()
        changes.forEach { it.writeVoidInto(out) }
        return out
    }

    private fun plan(src: ByteArray): List<Element> {
        val first = read(src, 0, src.size)
        if (first.id != EBML || first.unknownSize) throw Unreadable()
        val voids = mutableListOf<Element>()
        var at = first.end
        while (at < src.size) {
            val element = read(src, at, src.size)
            when (element.id) {
                SEGMENT -> voids += segment(src, element)
                VOID -> voids += element
                else -> throw Unreadable()
            }
            at = element.end
        }
        return voids
    }

    private fun segment(src: ByteArray, segment: Element): List<Element> {
        val elements = mutableListOf<Element>()
        var at = segment.dataStart
        while (at < segment.end) {
            val element = read(src, at, segment.end)
            val end = if (element.unknownSize) unknownClusterEnd(src, element, segment.end) else element.end
            if (element.id !in SEGMENT_KEPT && element.id !in DROPPED && element.id != INFO && element.id != TRACKS) throw Unreadable()
            elements += if (element.unknownSize) Element(element.id, element.offset, element.dataStart, end, unknownSize = true) else element
            at = end
        }
        val tracks = elements.filter { it.id == TRACKS }.map { tracks(src, it) }
        val numbers = tracks.flatMap { it.declared }
        if (numbers.size != numbers.toSet().size) throw Unreadable()
        val admitted = tracks.flatMap { it.admitted }.toSet()
        return tracks.flatMap { it.voids } + elements.flatMap { element ->
            when (element.id) {
                in DROPPED, VOID -> listOf(element)
                INFO -> children(src, element).filter { it.id !in INFO_KEPT }
                CLUSTER -> cluster(src, element, admitted)
                else -> emptyList()
            }
        }
    }

    private class TrackPlan(val voids: List<Element>, val declared: List<Long>, val admitted: List<Long>)

    /**
     * Seules les pistes VIDÉO (`V_…`) et AUDIO (`A_…`) sont ADMISES, et un bloc ne reste que si sa piste l'est : une piste de
     * sous-titres, de métadonnées, « complex », de boutons ou de logo — du texte libre où une application écrit sa télémétrie —
     * devient `Void`, et tout bloc d'une piste non admise aussi, qu'elle soit déclarée ou non. Un numéro déclaré deux fois fait
     * refuser. Dans une piste admise ne restent que ses champs TECHNIQUES ([TRACK_KEPT]) : tout autre devient `Void`. Une piste
     * dont le contenu est encodé (`ContentEncodings` : compression, chiffrement) ne se vérifie pas : refusée.
     */
    private fun tracks(src: ByteArray, tracks: Element): TrackPlan {
        val voids = mutableListOf<Element>()
        val declared = mutableListOf<Long>()
        val admitted = mutableListOf<Long>()
        children(src, tracks).forEach { entry ->
            when (entry.id) {
                TRACK_ENTRY -> {
                    val fields = children(src, entry)
                    if (fields.any { it.id == CONTENT_ENCODINGS }) throw Unreadable()
                    val number = fields.singleOrNull { it.id == TRACK_NUMBER }?.let { uint(src, it) } ?: throw Unreadable()
                    val type = fields.singleOrNull { it.id == TRACK_TYPE }?.let { uint(src, it) } ?: throw Unreadable()
                    val codec = fields.singleOrNull { it.id == CODEC_ID }?.let { String(src, it.dataStart, it.end - it.dataStart, Charsets.ISO_8859_1) }.orEmpty()
                    declared += number
                    if ((type == TYPE_VIDEO && codec.startsWith("V_")) || (type == TYPE_AUDIO && codec.startsWith("A_"))) {
                        admitted += number
                        voids += fields.filter { it.id !in TRACK_KEPT }
                    } else {
                        voids += entry
                    }
                }
                VOID -> voids += entry
                CRC32 -> Unit
                else -> throw Unreadable()
            }
        }
        return TrackPlan(voids, declared, admitted)
    }

    /** Un bloc d'une piste non admise devient `Void`, un `BlockAdditions` aussi, tout enfant de cluster inconnu aussi. */
    private fun cluster(src: ByteArray, cluster: Element, admitted: Set<Long>): List<Element> = children(src, cluster).flatMap { child ->
        when (child.id) {
            SIMPLE_BLOCK -> if (blockTrack(src, child) in admitted) emptyList() else listOf(child)
            BLOCK_GROUP -> blockGroup(src, child, admitted)
            VOID -> listOf(child)
            in CLUSTER_KEPT -> emptyList()
            else -> listOf(child)
        }
    }

    private fun blockGroup(src: ByteArray, group: Element, admitted: Set<Long>): List<Element> {
        val fields = children(src, group)
        val block = fields.singleOrNull { it.id == BLOCK } ?: throw Unreadable()
        if (blockTrack(src, block) !in admitted) return listOf(group)
        return fields.filter { it.id !in BLOCK_GROUP_KEPT }
    }

    private fun blockTrack(src: ByteArray, block: Element): Long {
        val (track, length) = vint(src, block.dataStart, keepMarker = false)
        if (block.dataStart + length > block.end) throw Unreadable()
        return track
    }

    private fun uint(src: ByteArray, element: Element): Long {
        if (element.end - element.dataStart > 8) throw Unreadable()
        return (element.dataStart until element.end).fold(0L) { acc, i -> (acc shl 8) or (src[i].toLong() and 0xFF) }
    }

    private fun children(src: ByteArray, parent: Element): List<Element> {
        val found = mutableListOf<Element>()
        var at = parent.dataStart
        while (at < parent.end) {
            val element = read(src, at, parent.end)
            if (element.unknownSize) throw Unreadable()
            found += element
            at = element.end
        }
        return found
    }

    private fun unknownClusterEnd(src: ByteArray, cluster: Element, limit: Int): Int {
        if (cluster.id != CLUSTER) throw Unreadable()
        var at = cluster.dataStart
        while (at < limit) {
            val (id, _) = vint(src, at, keepMarker = true)
            if (id in LEVEL_ONE) return at
            val element = read(src, at, limit)
            if (element.unknownSize) throw Unreadable()
            at = element.end
        }
        return limit
    }

    private fun Element.isVoidOf(src: ByteArray): Boolean =
        id == VOID && (dataStart until end).all { src[it].toInt() == 0 }

    /** Réécrit l'élément en `Void` de même longueur totale : 0xEC, une taille sur `L` octets, puis des zéros. */
    private fun Element.writeVoidInto(out: ByteArray) {
        val total = end - offset
        val sizeLength = minOf(8, total - 1)
        val payload = (total - 1 - sizeLength).toLong()
        out[offset] = VOID.toByte()
        (0 until sizeLength).forEach { i -> out[offset + 1 + i] = (payload ushr (8 * (sizeLength - 1 - i))).toByte() }
        out[offset + 1] = (out[offset + 1].toInt() or (0x80 ushr (sizeLength - 1))).toByte()
        out.fill(0, offset + 1 + sizeLength, end)
    }

    private fun read(src: ByteArray, at: Int, limit: Int): Element {
        val (id, idLength) = vint(src, at, keepMarker = true)
        if (idLength > 4) throw Unreadable()
        val (size, sizeLength) = vint(src, at + idLength, keepMarker = false)
        val dataStart = at + idLength + sizeLength
        val unknown = size == (1L shl (7 * sizeLength)) - 1
        val end = if (unknown) limit.toLong() else dataStart + size
        if (dataStart > limit || end > limit) throw Unreadable()
        return Element(id, at, dataStart, end.toInt(), unknown)
    }

    private fun vint(src: ByteArray, at: Int, keepMarker: Boolean): Pair<Long, Int> {
        if (at >= src.size) throw Unreadable()
        val first = src[at].toInt() and 0xFF
        val length = Integer.numberOfLeadingZeros(first) - 23
        if (first == 0 || length > 8 || at + length > src.size) throw Unreadable()
        val raw = (0 until length).fold(0L) { acc, i -> (acc shl 8) or (src[at + i].toLong() and 0xFF) }
        val value = if (keepMarker) raw else raw and ((1L shl (7 * length)) - 1)
        return value to length
    }
}
