package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.EOFException
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import kotlin.random.Random

/**
 * #13551 — les briques d'un nettoyage EN FLUX : lecture positionnée d'un fichier par blocs, parcours des boîtes ISO et des
 * éléments EBML par leurs en-têtes, réécriture en place d'une copie, recherche de signatures à cheval sur deux fenêtres.
 * Chacune est mesurée sur un fichier plus grand que la mémoire qu'elle s'autorise.
 */
class MediaStreamingScrubApiTest {
    @get:Rule val folder = TemporaryFolder()

    private fun fileOf(bytes: ByteArray): File = folder.newFile().also { it.writeBytes(bytes) }

    private fun onDisk(bytes: ByteArray): MediaBytes = SourceMediaBytes(MediaUploadSource.OnDisk(fileOf(bytes)))

    private fun sparse(size: Long): File = folder.newFile().also { RandomAccessFile(it, "rw").use { raf -> raf.setLength(size) } }

    private fun box(type: String, payload: ByteArray): ByteArray =
        ByteBuffer.allocate(8 + payload.size).putInt(8 + payload.size).put(type.toByteArray(Charsets.ISO_8859_1)).put(payload).array()

    // --- lecture positionnée

    @Test
    fun `a file read by blocks gives the same octets as the array, across every block boundary`() {
        val content = Random(7).nextBytes(SourceMediaBytes.BLOCK_BYTES * 6 + 123)
        val array = ArrayMediaBytes(content)
        val file = onDisk(content)
        val probes = (1..6).flatMap { block -> (-9..9).map { block.toLong() * SourceMediaBytes.BLOCK_BYTES + it } } + listOf(0L, content.size - 1L)

        probes.forEach { at ->
            assertThat(file.byteAt(at)).isEqualTo(array.byteAt(at))
            val length = minOf(40L, content.size - at).toInt()
            assertThat(file.bytes(at, length)).isEqualTo(array.bytes(at, length))
        }
        assertThat(file.bytes(10, SourceMediaBytes.BLOCK_BYTES * 5)).isEqualTo(content.copyOfRange(10, 10 + SourceMediaBytes.BLOCK_BYTES * 5))
        assertThat(file.u32At(SourceMediaBytes.BLOCK_BYTES - 2L)).isEqualTo(array.u32At(SourceMediaBytes.BLOCK_BYTES - 2L))
    }

    @Test
    fun `past the end a byte reads as -1 and a read fails`() {
        listOf(ArrayMediaBytes(ByteArray(10)), onDisk(ByteArray(10))).forEach { media ->
            assertThat(media.byteAt(10)).isEqualTo(-1)
            assertThat(media.byteAt(-1)).isEqualTo(-1)
            assertThat(runCatching { media.bytes(8, 4) }.exceptionOrNull()).isInstanceOf(EOFException::class.java)
        }
    }

    // --- boîtes ISO

    @Test
    fun `ISO boxes are walked by their headers, a 64-bit size included`() {
        val mvhd = box("mvhd", ByteArray(12))
        val udta = box("udta", box("©xyz", "+48.8566+002.3522/".toByteArray(Charsets.ISO_8859_1)))
        val large = ByteBuffer.allocate(16 + 20).putInt(1).put("mdat".toByteArray()).putLong(36).put(ByteArray(20)).array()
        val content = box("ftyp", "isom".toByteArray() + ByteArray(4)) + box("moov", mvhd + udta) + large

        listOf(ArrayMediaBytes(content), onDisk(content)).forEach { media ->
            val top = generateSequence(IsoBoxes.read(media, 0, media.size)) { previous ->
                previous.end.takeIf { it < media.size }?.let { IsoBoxes.read(media, it, media.size) }
            }.toList()
            assertThat(top.map { it.type }).containsExactly("ftyp", "moov", "mdat").inOrder()
            assertThat(top[2].header).isEqualTo(16)
            assertThat(top[2].end).isEqualTo(content.size.toLong())
            assertThat(IsoBoxes.children(media, top[1]).map { it.type }).containsExactly("mvhd", "udta").inOrder()
        }
    }

    @Test
    fun `a box that runs past its parent, or garbage after the last child, is unreadable`() {
        val overflowing = ByteBuffer.allocate(16).putInt(4000).put("moov".toByteArray()).putLong(0).array()
        val garbage = box("moov", box("mvhd", ByteArray(4)) + byteArrayOf(0, 0, 9))
        val media = ArrayMediaBytes(garbage)

        assertThat(runCatching { IsoBoxes.read(ArrayMediaBytes(overflowing), 0, 16) }.exceptionOrNull()).isInstanceOf(UnreadableMediaException::class.java)
        assertThat(runCatching { IsoBoxes.children(media, IsoBoxes.read(media, 0, media.size)) }.exceptionOrNull())
            .isInstanceOf(UnreadableMediaException::class.java)
    }

    @Test
    fun `a box neutralized as free keeps its size and reads back as an empty free box`() {
        val udta = box("udta", "SECRET".toByteArray())
        val file = fileOf(box("ftyp", ByteArray(8)) + udta)
        val target = IsoBoxes.read(ArrayMediaBytes(file.readBytes()), 16, file.length())

        MediaRewrite.applyInPlace(file, MediaEdit.isoFree(target.offset, target.payload, target.end))

        val media = ArrayMediaBytes(file.readBytes())
        val free = IsoBoxes.read(media, 16, media.size)
        assertThat(free.type).isEqualTo("free")
        assertThat(free.end - free.offset).isEqualTo(udta.size.toLong())
        assertThat(media.isZero(free.payload, free.end)).isTrue()
    }

    // --- éléments EBML

    @Test
    fun `an EBML element turned Void keeps its exact length, for every length`() {
        (2..300).forEach { total ->
            val file = fileOf(ByteArray(total) { 0x55 })

            MediaRewrite.applyInPlace(file, MediaEdit.ebmlVoid(0, total.toLong()))

            val media = ArrayMediaBytes(file.readBytes())
            val void = EbmlElements.read(media, 0, media.size)
            assertThat(void.id).isEqualTo(0xECL)
            assertThat(void.end).isEqualTo(total.toLong())
            assertThat(media.isZero(void.dataStart, void.end)).isTrue()
        }
    }

    @Test
    fun `EBML elements are walked by their headers, an unknown size runs to the limit`() {
        val tags = byteArrayOf(0x12, 0x54, 0xC3.toByte(), 0x67, 0x83.toByte(), 1, 2, 3)
        val unknownCluster = byteArrayOf(0x1F, 0x43, 0xB6.toByte(), 0x75, 0x01, 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 9, 9)
        val content = tags + unknownCluster

        listOf(ArrayMediaBytes(content), onDisk(content)).forEach { media ->
            val first = EbmlElements.read(media, 0, media.size)
            val second = EbmlElements.read(media, first.end, media.size)
            assertThat(first.id).isEqualTo(0x1254C367L)
            assertThat(first.end).isEqualTo(8L)
            assertThat(second.unknownSize).isTrue()
            assertThat(second.end).isEqualTo(content.size.toLong())
        }
        val number = ArrayMediaBytes(byteArrayOf(0xD7.toByte(), 0x82.toByte(), 1, 2))
        assertThat(EbmlElements.uint(number, EbmlElements.read(number, 0, 4))).isEqualTo(258L)
    }

    // --- réécriture en place

    @Test
    fun `a plan is applied on a copy, cut at its length, the source untouched`() {
        val content = Random(3).nextBytes(300_000)
        val source = fileOf(content)
        val target = folder.newFile()

        MediaRewrite.copyEdited(
            MediaUploadSource.OnDisk(source),
            target,
            listOf(MediaEdit.Zero(70_000, 140_001), MediaEdit.Overwrite(5, "free".toByteArray())),
            length = 250_000,
        )

        val expected = content.copyOf(250_000).also { it.fill(0, 70_000, 140_001); "free".toByteArray().copyInto(it, 5) }
        assertThat(target.readBytes()).isEqualTo(expected)
        assertThat(source.readBytes()).isEqualTo(content)
    }

    @Test
    fun `an edit that changes nothing is known as such`() {
        val media = ArrayMediaBytes(byteArrayOf(0, 0, 0, 'f'.code.toByte(), 'r'.code.toByte(), 'e'.code.toByte(), 'e'.code.toByte()))

        assertThat(MediaEdit.Zero(0, 3).changes(media)).isFalse()
        assertThat(MediaEdit.Overwrite(3, "free".toByteArray()).changes(media)).isFalse()
        assertThat(MediaEdit.Zero(2, 4).changes(media)).isTrue()
    }

    @Test
    fun `a 200 MB copy with its edits is written without any array of its size`() {
        val size = 200L * 1024 * 1024
        val target = folder.newFile()

        val allocated = AllocationMeter.allocatedBy {
            MediaRewrite.copyEdited(MediaUploadSource.OnDisk(sparse(size)), target, listOf(MediaEdit.Zero(10, 150L * 1024 * 1024)), length = size - 7)
        }

        assertThat(target.length()).isEqualTo(size - 7)
        assertThat(allocated).isLessThan(BOUND)
    }

    // --- signatures à cheval sur deux fenêtres

    private object Probe : MediaSignature {
        private val word = "GPSLatitude".toByteArray(Charsets.ISO_8859_1)
        override val firstBytes = BooleanArray(256).also { it['G'.code] = true; it['+'.code] = true }

        override fun matchesAt(media: MediaBytes, at: Long): Boolean =
            word.indices.all { media.byteAt(at + it) == (word[it].toInt() and 0xFF) } || coordinateAt(media, at)

        /** `+DD.d…+DDD.d…` : un nombre de décimales quelconque, donc une longueur sans borne. */
        private fun coordinateAt(media: MediaBytes, at: Long): Boolean {
            fun digits(from: Long, count: Int) = (from until from + count).all { media.byteAt(it) in '0'.code..'9'.code }
            fun part(from: Long, degrees: Int): Long? {
                if (media.byteAt(from) != '+'.code || !digits(from + 1, degrees) || media.byteAt(from + 1 + degrees) != '.'.code) return null
                var end = from + 2 + degrees
                while (media.byteAt(end) in '0'.code..'9'.code) end++
                return end.takeIf { it > from + 2 + degrees }
            }
            val latitudeEnd = part(at, 2) ?: return false
            return part(latitudeEnd, 3) != null
        }
    }

    @Test
    fun `a signature is found wherever it falls, astride two windows included`() {
        val word = "GPSLatitude".toByteArray(Charsets.ISO_8859_1)
        val boundary = MediaSignatureScan.WINDOW_BYTES * 2

        (-word.size..word.size).forEach { shift ->
            val content = ByteArray(MediaSignatureScan.WINDOW_BYTES * 4).also { word.copyInto(it, boundary + shift) }
            assertThat(MediaSignatureScan.foundIn(onDisk(content), Probe)).isTrue()
        }
    }

    @Test
    fun `a coordinate longer than a window is found, and a clean media is not`() {
        val coordinate = ("+48." + "8".repeat(MediaSignatureScan.WINDOW_BYTES + 10) + "+002.35").toByteArray(Charsets.ISO_8859_1)
        val content = ByteArray(MediaSignatureScan.WINDOW_BYTES * 3).also { coordinate.copyInto(it, MediaSignatureScan.WINDOW_BYTES - 3) }
        val clean = Random(11).nextBytes(MediaSignatureScan.WINDOW_BYTES * 3).also { bytes -> bytes.indices.forEach { if (bytes[it] == 'G'.code.toByte() || bytes[it] == '+'.code.toByte()) bytes[it] = 0 } }

        assertThat(MediaSignatureScan.foundIn(onDisk(content), Probe)).isTrue()
        assertThat(MediaSignatureScan.foundIn(onDisk(clean), Probe)).isFalse()
        assertThat(MediaSignatureScan.foundIn(ArrayMediaBytes(coordinate), Probe)).isTrue()
    }

    @Test
    fun `a 200 MB media is scanned whole without any array of its size`() {
        val size = 200L * 1024 * 1024
        val media = SourceMediaBytes(MediaUploadSource.OnDisk(sparse(size)))
        var found = true

        val allocated = AllocationMeter.allocatedBy { found = MediaSignatureScan.foundIn(media, Probe) }

        assertThat(found).isFalse()
        assertThat(allocated).isLessThan(BOUND)
    }

    private companion object {
        const val BOUND = 4L * 1024 * 1024
    }
}
