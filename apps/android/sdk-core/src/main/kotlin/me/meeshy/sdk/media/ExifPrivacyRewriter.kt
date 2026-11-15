package me.meeshy.sdk.media

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * **L'EXIF d'une photo qui part ne garde que ce qui décrit la PRISE, jamais ce qui dit OÙ** (#13450).
 *
 * Le bloc TIFF d'un JPEG est reconstruit depuis une liste BLANCHE : appareil, date, exposition, objectif,
 * orientation — les mêmes champs que `RetouchExif` porte à une photo retouchée. Tout le reste disparaît sans
 * qu'il faille le nommer : le sous-IFD GPS (`0x8825`), la vignette (IFD1), la note du fabricant (qui peut
 * porter un lieu), le numéro de série, le nom du propriétaire, la description. Une liste blanche ne laisse
 * pas passer le champ qu'un fabricant ajoutera demain.
 */
internal object ExifPrivacyRewriter {
    private const val EXIF_POINTER = 0x8769
    private const val GPS_POINTER = 0x8825
    private const val TIFF_MAGIC = 0x2A
    private const val HEADER = 8
    private const val ENTRY = 12
    private val TYPE_SIZES = intArrayOf(0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8)

    private val IFD0_TAGS = setOf(0x010F, 0x0110, 0x0112, 0x011A, 0x011B, 0x0128, 0x0131, 0x0132, 0x0213)
    private val EXIF_TAGS = setOf(
        0x829A, 0x829D, 0x8822, 0x8827, 0x9000, 0x9003, 0x9004, 0x9101, 0x9201, 0x9202, 0x9203, 0x9204,
        0x9207, 0x9209, 0x920A, 0x9290, 0x9291, 0x9292, 0xA000, 0xA001, 0xA002, 0xA003, 0xA403, 0xA405,
        0xA406, 0xA432, 0xA433, 0xA434,
    )

    private class Entry(val tag: Int, val type: Int, val count: Int, val value: ByteArray)

    /** Le bloc TIFF sans lieu ni vignette ; `null` quand rien de la prise ne mérite de partir, ou si le bloc est illisible. */
    fun rewrite(tiff: ByteArray): ByteArray? = runCatching { build(tiff) }.getOrNull()

    /** Vrai quand le bloc ne contient QUE des champs de la liste blanche, sans suivant (vignette) ni lieu. */
    fun isClean(tiff: ByteArray): Boolean = runCatching {
        val reader = Reader(tiff)
        val ifd0 = reader.entries(reader.u32(4))
        val exif = ifd0.firstOrNull { it.tag == EXIF_POINTER }?.let { reader.entries(reader.u32(it.value, 0)) }.orEmpty()
        ifd0.all { it.tag in IFD0_TAGS || it.tag == EXIF_POINTER } && exif.all { it.tag in EXIF_TAGS } &&
            reader.u32(reader.ifdEnd(reader.u32(4))) == 0 &&
            ifd0.none { it.tag == GPS_POINTER }
    }.getOrDefault(false)

    private class Reader(val bytes: ByteArray) {
        val order: ByteOrder = when {
            bytes.size >= HEADER && bytes[0] == 'I'.code.toByte() && bytes[1] == 'I'.code.toByte() -> ByteOrder.LITTLE_ENDIAN
            bytes.size >= HEADER && bytes[0] == 'M'.code.toByte() && bytes[1] == 'M'.code.toByte() -> ByteOrder.BIG_ENDIAN
            else -> throw IllegalArgumentException("not TIFF")
        }
        private val buffer = ByteBuffer.wrap(bytes).order(order)

        init { require(buffer.getShort(2).toInt() and 0xFFFF == TIFF_MAGIC) }

        fun u16(at: Int): Int = buffer.getShort(at).toInt() and 0xFFFF
        fun u32(at: Int): Int = buffer.getInt(at)
        fun u32(raw: ByteArray, at: Int): Int = ByteBuffer.wrap(raw).order(order).getInt(at)
        fun ifdEnd(offset: Int): Int = offset + 2 + ENTRY * u16(offset)

        fun entries(offset: Int): List<Entry> {
            require(offset in HEADER until bytes.size)
            return (0 until u16(offset)).map { index ->
                val at = offset + 2 + index * ENTRY
                val type = u16(at + 2)
                val count = u32(at + 4)
                val size = if (type in 1..12) TYPE_SIZES[type].toLong() * (count.toLong() and 0xFFFFFFFFL) else 0L
                val value = when {
                    size == 0L -> ByteArray(0)
                    size <= 4 -> bytes.copyOfRange(at + 8, at + 8 + size.toInt())
                    else -> u32(at + 8).let { start ->
                        require(start >= 0 && start + size <= bytes.size)
                        bytes.copyOfRange(start, start + size.toInt())
                    }
                }
                Entry(u16(at), type, count, value)
            }
        }
    }

    private fun build(tiff: ByteArray): ByteArray? {
        val reader = Reader(tiff)
        val all0 = reader.entries(reader.u32(4))
        val exifEntries = all0.firstOrNull { it.tag == EXIF_POINTER }
            ?.let { reader.entries(reader.u32(it.value, 0)) }
            .orEmpty()
            .filter { it.tag in EXIF_TAGS && it.value.isNotEmpty() }
        val kept0 = all0.filter { it.tag in IFD0_TAGS && it.value.isNotEmpty() }
        if (kept0.isEmpty() && exifEntries.isEmpty()) return null
        return Writer(reader.order).write(kept0, exifEntries)
    }

    private class Writer(private val order: ByteOrder) {
        fun write(ifd0: List<Entry>, exif: List<Entry>): ByteArray {
            val ifd0Count = ifd0.size + if (exif.isEmpty()) 0 else 1
            val ifd0Length = 2 + ENTRY * ifd0Count + 4
            val exifOffset = HEADER + ifd0Length
            val exifLength = if (exif.isEmpty()) 0 else 2 + ENTRY * exif.size + 4
            var dataOffset = exifOffset + exifLength
            val spills = (ifd0 + exif).filter { it.value.size > 4 }
            val offsets = HashMap<Entry, Int>()
            spills.forEach { entry ->
                offsets[entry] = dataOffset
                dataOffset += entry.value.size + (entry.value.size and 1)
            }
            val out = ByteBuffer.allocate(dataOffset).order(order)
            out.put(if (order == ByteOrder.LITTLE_ENDIAN) byteArrayOf(0x49, 0x49) else byteArrayOf(0x4D, 0x4D))
            out.putShort(TIFF_MAGIC.toShort()).putInt(HEADER)
            writeIfd(out, ifd0, offsets, exifPointer = if (exif.isEmpty()) null else exifOffset)
            if (exif.isNotEmpty()) writeIfd(out, exif, offsets, exifPointer = null)
            spills.forEach { entry ->
                out.position(offsets.getValue(entry))
                out.put(entry.value)
            }
            return out.array()
        }

        private fun writeIfd(out: ByteBuffer, entries: List<Entry>, offsets: Map<Entry, Int>, exifPointer: Int?) {
            val start = out.position()
            val count = entries.size + if (exifPointer == null) 0 else 1
            out.position(start)
            out.putShort(count.toShort())
            val sorted = entries.map { it.tag to it } + listOfNotNull(exifPointer?.let { EXIF_POINTER to null })
            sorted.sortedBy { it.first }.forEach { (tag, entry) ->
                out.putShort(tag.toShort())
                if (entry == null) {
                    out.putShort(4).putInt(1).putInt(exifPointer ?: 0)
                    return@forEach
                }
                out.putShort(entry.type.toShort()).putInt(entry.count)
                val spill = offsets[entry]
                if (spill != null) out.putInt(spill) else out.put(entry.value).also { repeat(4 - entry.value.size) { out.put(0) } }
            }
            out.putInt(0)
        }
    }
}
