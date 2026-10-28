package me.meeshy.sdk.media

/**
 * **Le retrait des métadonnées d'une vidéo ou d'un son WebM / Matroska, SANS réencodage ni déplacement d'octet** (#13543).
 *
 * Même principe que [IsoMediaMetadataScrubber] : un élément retiré devient un élément `Void` (0xEC) de MÊME taille, contenu
 * mis à zéro — aucune position (SeekHead, Cues) ne bouge. Tombent : `Tags` (où un enregistreur pose `LOCATION`),
 * `Attachments` (fichiers joints, vignettes) et le `Title` de `Info`. Les `Void` existants sont vidés. Un `Cluster` de taille
 * inconnue (enregistrement en direct) se parcourt jusqu'au prochain élément de premier niveau. Tout ce qui ne se lit pas
 * rend `null` : l'appelant refuse l'envoi.
 */
internal object MatroskaMetadataScrubber {
    private const val EBML = 0x1A45DFA3L
    private const val SEGMENT = 0x18538067L
    private const val CLUSTER = 0x1F43B675L
    private const val INFO = 0x1549A966L
    private const val TITLE = 0x7BA9L
    private const val VOID = 0xECL
    private val DROPPED = setOf(0x1254C367L, 0x1941A469L)
    private val LEVEL_ONE = setOf(0x114D9B74L, INFO, 0x1654AE6BL, 0x1C53BB6BL, 0x1043A770L, CLUSTER, VOID, 0xBFL) + DROPPED

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
        val voids = mutableListOf<Element>()
        var at = segment.dataStart
        while (at < segment.end) {
            val element = read(src, at, segment.end)
            val end = if (element.unknownSize) unknownClusterEnd(src, element, segment.end) else element.end
            when {
                element.id in DROPPED || element.id == VOID -> voids += element
                element.id == INFO -> voids += children(src, element).filter { it.id == TITLE || it.id == VOID }
            }
            at = end
        }
        return voids
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
