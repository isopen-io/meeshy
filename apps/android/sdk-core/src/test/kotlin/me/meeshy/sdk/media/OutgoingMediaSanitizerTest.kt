package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.ExifInterface
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Une photo ne part jamais avec son lieu, sa vignette ni son XMP, y compris quand ses octets partaient tels quels (#13450). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OutgoingMediaSanitizerTest {

    private fun sanitizer(keepsLocation: Boolean = false) =
        OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(keepsLocation), Dispatchers.Unconfined)

    private fun item(bytes: ByteArray, name: String = "photo.jpg", mime: String = "image/jpeg") = MediaUploadItem(bytes, name, mime)

    private suspend fun clean(bytes: ByteArray, keepsLocation: Boolean = false, name: String = "photo.jpg", mime: String = "image/jpeg") =
        (sanitizer(keepsLocation).sanitize(item(bytes, name, mime)) as NetworkResult.Success).data

    private fun pixels(): ByteArray {
        val bitmap = Bitmap.createBitmap(40, 20, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.RED) }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    }

    private fun u16(value: Int) = byteArrayOf((value shr 8).toByte(), value.toByte())

    private fun segment(marker: Int, payload: ByteArray) = byteArrayOf(0xFF.toByte(), marker.toByte()) + u16(payload.size + 2) + payload

    private fun ascii(text: String) = text.toByteArray(Charsets.ISO_8859_1)

    /** Un bloc TIFF d'appareil : marque, date, orientation 6, note du fabricant, GPS et vignette (IFD1). */
    private fun tiffWithEverything(): ByteArray {
        val buf = ByteBuffer.allocate(512).order(ByteOrder.LITTLE_ENDIAN)
        fun entry(tag: Int, type: Int, count: Int, value: Int) { buf.putShort(tag.toShort()).putShort(type.toShort()).putInt(count).putInt(value) }
        buf.put(ascii("II")).putShort(0x2A).putInt(8)
        // IFD0 @8: Make, Orientation, ExifPtr, GPSPtr — 4 entrées, suivant = IFD1 @0xA0
        buf.putShort(4)
        entry(0x010F, 2, 5, 0x60)
        entry(0x0112, 3, 1, 6)
        entry(0x8769, 4, 1, 0x70)
        entry(0x8825, 4, 1, 0xC0)
        buf.putInt(0xA0)
        buf.position(0x60); buf.put(ascii("Acme\u0000"))
        // ExifIFD @0x70: DateTimeOriginal, MakerNote
        buf.position(0x70); buf.putShort(2)
        entry(0x9003, 2, 20, 0xE0)
        entry(0x927C, 7, 7, 0xF8)
        buf.putInt(0)
        // IFD1 @0xA0: vignette
        buf.position(0xA0); buf.putShort(2)
        entry(0x0201, 4, 1, 0x100)
        entry(0x0202, 4, 1, 4)
        buf.putInt(0)
        // GPS IFD @0xC0: latitude ref
        buf.position(0xC0); buf.putShort(1)
        entry(0x0001, 2, 2, 'N'.code)
        buf.putInt(0)
        buf.position(0xE0); buf.put(ascii("2026:10:24 10:42:00\u0000"))
        buf.position(0xF8); buf.put(ascii("SECRET\u0000"))
        buf.position(0x100); buf.put(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2))
        return buf.array().copyOf(0x108)
    }

    private fun photoWithMetadata(): ByteArray {
        val image = pixels()
        val exif = segment(0xE1, ascii("Exif\u0000\u0000") + tiffWithEverything())
        val xmp = segment(0xE1, ascii("http://ns.adobe.com/xap/1.0/\u0000<x:xmpmeta>exif:GPSLatitude=48,51N</x:xmpmeta>"))
        val iptc = segment(0xED, ascii("Photoshop 3.0\u00008BIM Paris"))
        val comment = segment(0xFE, ascii("taken in Paris"))
        val trailer = ascii("MOTIONPHOTO-VIDEO-WITH-LOCATION")
        return image.copyOfRange(0, 2) + exif + xmp + iptc + comment + image.copyOfRange(2, image.size) + trailer
    }

    private fun String.occursIn(bytes: ByteArray) = String(bytes, Charsets.ISO_8859_1).contains(this)

    @Test
    fun `un JPEG avec lieu vignette et XMP part sans aucun des trois`() = runTest {
        val sent = clean(photoWithMetadata()).bytes
        val exif = ExifInterface(ByteArrayInputStream(sent))

        assertThat(exif.getLatLong(FloatArray(2))).isFalse()
        assertThat(exif.hasThumbnail()).isFalse()
        assertThat(exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE_REF)).isNull()
        listOf("ns.adobe.com", "GPSLatitude", "Paris", "SECRET", "MOTIONPHOTO").forEach { assertThat(it.occursIn(sent)).isFalse() }
    }

    @Test
    fun `la prise garde son appareil sa date et son orientation`() = runTest {
        val exif = ExifInterface(ByteArrayInputStream(clean(photoWithMetadata()).bytes))

        assertThat(exif.getAttribute(ExifInterface.TAG_MAKE)).isEqualTo("Acme")
        assertThat(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)).isEqualTo("2026:10:24 10:42:00")
        assertThat(exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, 0)).isEqualTo(6)
    }

    @Test
    fun `les pixels ne sont pas ré-encodés et l image reste lisible`() = runTest {
        val sent = clean(photoWithMetadata()).bytes
        val original = pixels()
        val scan = original.copyOfRange(original.size - 64, original.size - 2)

        assertThat(String(sent, Charsets.ISO_8859_1)).contains(String(scan, Charsets.ISO_8859_1))
        val decoded = BitmapFactory.decodeByteArray(sent, 0, sent.size)
        assertThat(decoded.width).isEqualTo(40)
        assertThat(decoded.height).isEqualTo(20)
    }

    @Test
    fun `une photo sans métadonnées part octet pour octet`() = runTest {
        val plain = pixels()
        assertThat(clean(plain).bytes).isEqualTo(plain)
    }

    @Test
    fun `le réglage conserver le lieu laisse partir les octets d origine`() = runTest {
        val original = photoWithMetadata()
        assertThat(clean(original, keepsLocation = true).bytes).isEqualTo(original)
    }

    @Test
    fun `le réglage est désactivé par défaut`() {
        assertThat(InMemoryOutgoingPhotoLocationStore().keepsLocation.value).isFalse()
        assertThat(OutgoingPhotoLocationStore.KEY).isEqualTo("media.outgoing.keepsPhotoLocation")
    }

    @Test
    fun `un PNG perd ses blocs EXIF et XMP`() = runTest {
        fun chunk(type: String, data: ByteArray) = ByteBuffer.allocate(12 + data.size).putInt(data.size).put(ascii(type)).put(data).putInt(0).array()
        val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        val png = signature + chunk("IHDR", ByteArray(13)) + chunk("eXIf", ascii("GPSSECRET")) +
            chunk("iTXt", ascii("XML:com.adobe.xmp\u0000GPSXMP")) + chunk("IDAT", ascii("pixels")) + chunk("IEND", ByteArray(0))

        val sent = clean(png, name = "p.png", mime = "image/png").bytes

        assertThat("GPS".occursIn(sent)).isFalse()
        assertThat("pixels".occursIn(sent)).isTrue()
    }

    @Test
    fun `un WebP perd ses blocs EXIF et XMP et ses drapeaux`() = runTest {
        fun chunk(type: String, data: ByteArray): ByteArray {
            val padded = if (data.size % 2 == 1) data + 0 else data
            return ByteBuffer.allocate(8 + padded.size).order(ByteOrder.LITTLE_ENDIAN).put(ascii(type)).putInt(data.size).put(padded).array()
        }
        val flags = ByteArray(10).also { it[0] = 0x2C }
        val body = ascii("WEBP") + chunk("VP8X", flags) + chunk("VP8 ", ascii("pixels")) + chunk("EXIF", ascii("GPSSECRET")) + chunk("XMP ", ascii("GPSXMP"))
        val webp = ByteBuffer.allocate(8 + body.size).order(ByteOrder.LITTLE_ENDIAN).put(ascii("RIFF")).putInt(body.size).put(body).array()

        val sent = clean(webp, name = "p.webp", mime = "image/webp").bytes

        assertThat("GPS".occursIn(sent)).isFalse()
        assertThat("pixels".occursIn(sent)).isTrue()
        assertThat(sent[20].toInt()).isEqualTo(0x20)
        assertThat(ByteBuffer.wrap(sent, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int).isEqualTo(sent.size - 8)
    }

    @Test
    fun `un JPEG illisible ne part jamais tel quel`() = runTest {
        val broken = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE1.toByte(), 0x7F, 0x00) + ascii("Exif GPS truncated")

        val result = sanitizer().sanitize(item(broken))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(OutgoingMediaSanitizer.REFUSED_CODE)
    }

    private fun pngChunk(type: String, data: ByteArray) = ByteBuffer.allocate(12 + data.size).putInt(data.size).put(ascii(type)).put(data).putInt(0).array()

    private fun riffChunk(type: String, data: ByteArray): ByteArray {
        val padded = if (data.size % 2 == 1) data + 0 else data
        return ByteBuffer.allocate(8 + padded.size).order(ByteOrder.LITTLE_ENDIAN).put(ascii(type)).putInt(data.size).put(padded).array()
    }

    private fun webp(vararg chunks: ByteArray): ByteArray {
        val body = ascii("WEBP") + chunks.fold(ByteArray(0)) { acc, c -> acc + c }
        return ByteBuffer.allocate(8 + body.size).order(ByteOrder.LITTLE_ENDIAN).put(ascii("RIFF")).putInt(body.size).put(body).array()
    }

    private val pngSignature = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    @Test
    fun `un PNG avec un bloc privé inconnu ne le transporte pas`() = runTest {
        val png = pngSignature + pngChunk("IHDR", ByteArray(13)) + pngChunk("pHYs", ByteArray(9)) + pngChunk("prVt", ascii("GPSPRIVATE")) +
            pngChunk("IDAT", ascii("pixels")) + pngChunk("IEND", ByteArray(0))

        val sent = clean(png, name = "p.png", mime = "image/png").bytes

        assertThat("GPSPRIVATE".occursIn(sent)).isFalse()
        assertThat("pHYs".occursIn(sent)).isTrue()
        assertThat("pixels".occursIn(sent)).isTrue()
    }

    @Test
    fun `un WebP avec un bloc inconnu ne le transporte pas et garde son animation`() = runTest {
        val flags = ByteArray(10).also { it[0] = 0x32 }
        val webp = webp(riffChunk("VP8X", flags), riffChunk("ANIM", ByteArray(6)), riffChunk("ANMF", ascii("frames")), riffChunk("zzzz", ascii("GPSPRIVATE")))

        val sent = clean(webp, name = "p.webp", mime = "image/webp").bytes

        assertThat("GPSPRIVATE".occursIn(sent)).isFalse()
        assertThat("frames".occursIn(sent)).isTrue()
        assertThat(sent[20].toInt()).isEqualTo(0x32)
        assertThat(ByteBuffer.wrap(sent, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int).isEqualTo(sent.size - 8)
    }

    private fun box(type: String, body: ByteArray) = ByteBuffer.allocate(8 + body.size).putInt(8 + body.size).put(ascii(type)).put(body).array()

    private fun ftyp(major: String, vararg compatible: String) =
        box("ftyp", ascii(major) + ByteArray(4) + compatible.fold(ByteArray(0)) { acc, b -> acc + ascii(b) }) + box("mdat", ascii("GPSPRIVATE"))

    @Test
    fun `un conteneur dont une marque secondaire est une image n est pas pris pour une vidéo`() = runTest {
        val disguised = ftyp("isom", "mp42", "heic")

        val result = sanitizer().sanitize(item(disguised, "p.mp4", "video/mp4"))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `une vidéo et un son restent inchangés`() = runTest {
        val video = ftyp("isom", "iso2", "avc1", "mp41")
        val qt = ftyp("qt  ")
        val audio = ftyp("M4A ", "mp42", "isom")

        listOf(video to "video/mp4", qt to "video/quicktime", audio to "audio/mp4").forEach { (bytes, mime) ->
            assertThat(clean(bytes, name = "m", mime = mime).bytes).isEqualTo(bytes)
        }
    }

    @Test
    fun `des octets inconnus déclarés image ne partent jamais tels quels`() = runTest {
        val tiff = byteArrayOf(0x49, 0x49, 0x2A, 0x00) + ascii("GPSPRIVATE-IFD")
        val dng = byteArrayOf(0x4D, 0x4D, 0x00, 0x2A) + ascii("GPSPRIVATE-IFD")
        val mystery = ascii("XXXXXXXXXXXXXXXXGPSPRIVATE")

        listOf(tiff, dng, mystery).forEach { bytes ->
            assertThat(sanitizer().sanitize(item(bytes, "p.tiff", "image/tiff"))).isInstanceOf(NetworkResult.Failure::class.java)
        }
    }

    private fun gif(vararg blocks: ByteArray) =
        ascii("GIF89a") + byteArrayOf(1, 0, 1, 0, 0x80.toByte(), 0, 0) + ByteArray(6) + blocks.fold(ByteArray(0)) { acc, b -> acc + b } + byteArrayOf(0x3B)

    private fun ext(label: Int, vararg subs: ByteArray) =
        byteArrayOf(0x21, label.toByte()) + subs.fold(ByteArray(0)) { acc, b -> acc + byteArrayOf(b.size.toByte()) + b } + byteArrayOf(0)

    private val frame = byteArrayOf(0x2C, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0)

    @Test
    fun `un GIF perd ses extensions XMP et commentaire mais reste animé`() = runTest {
        val loop = ext(0xFF, ascii("NETSCAPE2.0"), byteArrayOf(1, 0, 0))
        val xmp = ext(0xFF, ascii("XMP DataXMP"), ascii("GPSPRIVATE"))
        val comment = ext(0xFE, ascii("taken in Paris"))
        val control = ext(0xF9, byteArrayOf(4, 10, 0, 0))
        val gif = gif(loop, xmp, comment, control, frame, control, frame)

        val sent = clean(gif, name = "a.gif", mime = "image/gif").bytes

        assertThat("GPSPRIVATE".occursIn(sent)).isFalse()
        assertThat("Paris".occursIn(sent)).isFalse()
        assertThat("NETSCAPE2.0".occursIn(sent)).isTrue()
        assertThat(sent.toList().windowed(4).count { it == listOf<Byte>(0x21, 0xF9.toByte(), 4, 4) }).isEqualTo(2)
    }

    @Test
    fun `des octets sans rapport avec une image passent inchangés`() = runTest {
        val blob = byteArrayOf(1, 2, 3)
        assertThat(clean(blob, name = "a.bin", mime = "application/octet-stream").bytes).isEqualTo(blob)
    }
}
