package me.meeshy.sdk.media

/**
 * The two structures a video or a sound is made of, read BY THEIR HEADERS over [MediaBytes] (#13551): an ISO box
 * (MP4 / MOV / 3GP / M4A) and an EBML element (WebM / Matroska). Reading a header costs at most 16 octets, whatever the
 * size of what it frames — a 200 MB `mdat` is stepped over, never read. Anything malformed throws
 * [UnreadableMediaException]: a scrubber turns it into a refusal, never into the original leaving.
 */
internal class UnreadableMediaException(message: String) : Exception(message)

internal class IsoBox(val type: String, val offset: Long, val header: Int, val end: Long) {
    val payload: Long get() = offset + header
}

internal object IsoBoxes {
    private const val HEADER = 8
    private const val LARGE_HEADER = 16

    /** The box at [at], which must end at or before [limit]. Size 0 runs to [limit], size 1 reads a 64-bit size. */
    fun read(media: MediaBytes, at: Long, limit: Long): IsoBox {
        if (limit - at < HEADER) throw UnreadableMediaException("box header past $limit at $at")
        val declared = media.u32At(at)
        val type = media.ascii(at + 4, 4)
        val (size, header) = when (declared) {
            0L -> (limit - at) to HEADER
            1L -> {
                if (limit - at < LARGE_HEADER) throw UnreadableMediaException("large box header past $limit at $at")
                media.i64At(at + 8) to LARGE_HEADER
            }
            else -> declared to HEADER
        }
        if (size < header || size > limit - at) throw UnreadableMediaException("box '$type' of $size octets at $at past $limit")
        return IsoBox(type, at, header, at + size)
    }

    /** The boxes inside [parent]'s payload; trailing octets too few for a header must be zero. */
    fun children(media: MediaBytes, parent: IsoBox, payloadOffset: Long = 0): List<IsoBox> {
        val boxes = mutableListOf<IsoBox>()
        var at = parent.payload + payloadOffset
        while (parent.end - at >= HEADER) {
            val box = read(media, at, parent.end)
            boxes += box
            at = box.end
        }
        if (!media.isZero(at, parent.end)) throw UnreadableMediaException("garbage after the last box of '${parent.type}'")
        return boxes
    }
}

internal class EbmlElement(val id: Long, val offset: Long, val dataStart: Long, val end: Long, val unknownSize: Boolean)

internal object EbmlElements {
    private const val MAX_ID_LENGTH = 4

    /** An EBML variable-length integer at [at]: its value (marker kept for an id, dropped for a size) and its length. */
    fun vint(media: MediaBytes, at: Long, keepMarker: Boolean): Pair<Long, Int> {
        val first = media.byteAt(at)
        if (first <= 0) throw UnreadableMediaException("no vint at $at")
        val length = Integer.numberOfLeadingZeros(first) - 23
        if (length > 8 || at + length > media.size) throw UnreadableMediaException("vint of $length octets at $at")
        val raw = (0 until length).fold(0L) { acc, i -> (acc shl 8) or media.byteAt(at + i).toLong() }
        val value = if (keepMarker) raw else raw and ((1L shl (7 * length)) - 1)
        return value to length
    }

    /** The element at [at], ending at or before [limit]; an unknown size (all ones) runs to [limit]. */
    fun read(media: MediaBytes, at: Long, limit: Long): EbmlElement {
        val (id, idLength) = vint(media, at, keepMarker = true)
        if (idLength > MAX_ID_LENGTH) throw UnreadableMediaException("id of $idLength octets at $at")
        val (size, sizeLength) = vint(media, at + idLength, keepMarker = false)
        val dataStart = at + idLength + sizeLength
        val unknown = size == (1L shl (7 * sizeLength)) - 1
        val end = if (unknown) limit else dataStart + size
        if (dataStart > limit || end > limit || end < dataStart) throw UnreadableMediaException("element ${id.toString(16)} at $at past $limit")
        return EbmlElement(id, at, dataStart, end, unknown)
    }

    /** The elements inside [parent]; a child of unknown size is unreadable here. */
    fun children(media: MediaBytes, parent: EbmlElement): List<EbmlElement> {
        val found = mutableListOf<EbmlElement>()
        var at = parent.dataStart
        while (at < parent.end) {
            val element = read(media, at, parent.end)
            if (element.unknownSize) throw UnreadableMediaException("unknown-size child at $at")
            found += element
            at = element.end
        }
        return found
    }

    /** An unsigned integer element of at most eight octets. */
    fun uint(media: MediaBytes, element: EbmlElement): Long {
        if (element.end - element.dataStart > 8) throw UnreadableMediaException("uint of ${element.end - element.dataStart} octets")
        return (element.dataStart until element.end).fold(0L) { acc, i -> (acc shl 8) or media.byteAt(i).toLong() }
    }
}
