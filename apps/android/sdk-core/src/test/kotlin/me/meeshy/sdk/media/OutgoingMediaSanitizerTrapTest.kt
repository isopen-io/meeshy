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

/** Les fichiers piégés de l'audit #13450 : ce qui partait À CÔTÉ des blocs que le retrait nommait. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OutgoingMediaSanitizerTrapTest {

    private val sanitizer = OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(), Dispatchers.Unconfined)

    private suspend fun sent(bytes: ByteArray, name: String = "photo.jpg", mime: String = "image/jpeg") =
        (sanitizer.sanitizeOnBothPaths(bytes, name, mime) as NetworkResult.Success).data.bytes

    private fun ascii(text: String) = text.toByteArray(Charsets.ISO_8859_1)

    private fun String.occursIn(bytes: ByteArray) = String(bytes, Charsets.ISO_8859_1).contains(this)

    private fun u16(value: Int) = byteArrayOf((value shr 8).toByte(), value.toByte())

    private fun segment(marker: Int, payload: ByteArray) = byteArrayOf(0xFF.toByte(), marker.toByte()) + u16(payload.size + 2) + payload

    private fun pixels(): ByteArray {
        val bitmap = Bitmap.createBitmap(40, 20, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.BLUE) }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    }

    private fun withSegments(vararg segments: ByteArray): ByteArray {
        val image = pixels()
        return image.copyOfRange(0, 2) + segments.fold(ByteArray(0)) { acc, s -> acc + s } + image.copyOfRange(2, image.size)
    }

    private fun decodesAt40x20(bytes: ByteArray) {
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        assertThat(decoded.width).isEqualTo(40)
        assertThat(decoded.height).isEqualTo(20)
    }

    @Test
    fun `une vignette JFXX qui embarque un JPEG avec son lieu ne part pas`() = runTest {
        val embedded = byteArrayOf(0xFF.toByte(), 0xD8.toByte()) + segment(0xE1, ascii("Exif\u0000\u0000GPSSECRET-THUMB")) + byteArrayOf(0xFF.toByte(), 0xD9.toByte())
        val jfxx = segment(0xE0, ascii("JFXX\u0000") + byteArrayOf(0x10) + embedded)

        val out = sent(withSegments(jfxx))

        assertThat("GPSSECRET".occursIn(out)).isFalse()
        assertThat("JFXX".occursIn(out)).isFalse()
        decodesAt40x20(out)
    }

    @Test
    fun `la vignette RVB d un en-tête JFIF ne part pas mais l en-tête reste`() = runTest {
        val thumbnail = ByteArray(2 * 2 * 3) { 0x5A }
        val jfif = segment(0xE0, ascii("JFIF\u0000") + byteArrayOf(1, 1, 0, 0, 1, 0, 1, 2, 2) + thumbnail)
        val source = withSegments(jfif)

        val out = sent(source)

        assertThat("JFIF".occursIn(out)).isTrue()
        assertThat(String(thumbnail, Charsets.ISO_8859_1).occursIn(out)).isFalse()
        decodesAt40x20(out)
    }

    @Test
    fun `un APP2 qui n est pas un profil couleur ne part pas, le profil couleur reste`() = runTest {
        val flashpix = segment(0xE2, ascii("FPXR\u0000GPSSECRET-FLASHPIX"))
        val icc = segment(0xE2, ascii("ICC_PROFILE\u0000") + byteArrayOf(1, 1) + ascii("display-profile"))

        val out = sent(withSegments(flashpix, icc))

        assertThat("GPSSECRET".occursIn(out)).isFalse()
        assertThat("display-profile".occursIn(out)).isTrue()
        decodesAt40x20(out)
    }

    @Test
    fun `un APP14 qui n est pas Adobe et un APP0 inconnu ne partent pas`() = runTest {
        val app14 = segment(0xEE, ascii("Ducky\u0000GPSSECRET-APP14"))
        val app0 = segment(0xE0, ascii("AVI1\u0000GPSSECRET-APP0"))

        val out = sent(withSegments(app0, app14))

        assertThat("GPSSECRET".occursIn(out)).isFalse()
        decodesAt40x20(out)
    }

    /** Quatre champs autorisés qui pointent la MÊME zone de 20 Ko : réécrits un par un, ils dépassent les 64 Ko d'un segment. */
    private fun aliasedTiff(): ByteArray {
        val region = 20_000
        val tags = listOf(0x010F, 0x0110, 0x0131, 0x0132)
        val buf = ByteBuffer.allocate(8 + 2 + 12 * tags.size + 4 + region).order(ByteOrder.LITTLE_ENDIAN)
        buf.put(ascii("II")).putShort(0x2A).putInt(8)
        buf.putShort(tags.size.toShort())
        val dataAt = 8 + 2 + 12 * tags.size + 4
        tags.forEach { tag -> buf.putShort(tag.toShort()).putShort(2).putInt(region).putInt(dataAt) }
        buf.putInt(0)
        repeat(region) { buf.put('A'.code.toByte()) }
        return buf.array()
    }

    @Test
    fun `un EXIF dont la réécriture dépasserait un segment ne corrompt pas le fichier`() = runTest {
        val exif = segment(0xE1, ascii("Exif\u0000\u0000") + aliasedTiff())

        val out = sent(withSegments(exif))

        decodesAt40x20(out)
        assertThat(ImageMetadataScrubber.jpeg(out)).isEqualTo(out)
        ExifInterface(ByteArrayInputStream(out)).getAttribute(ExifInterface.TAG_GPS_LATITUDE).let { assertThat(it).isNull() }
    }

    private fun box(type: String, body: ByteArray) = ByteBuffer.allocate(8 + body.size).putInt(8 + body.size).put(ascii(type)).put(body).array()

    @Test
    fun `une vidéo déclarée comme telle dont la marque est inconnue part inchangée`() = runTest {
        val xavc = box("ftyp", ascii("XAVC") + ByteArray(4) + ascii("XAVCmp42iso2")) + box("mdat", ascii("frames"))

        assertThat(sent(xavc, name = "clip.mp4", mime = "video/mp4")).isEqualTo(xavc)
    }

    @Test
    fun `une vidéo déclarée dont une marque compatible est une image ne part toujours pas`() = runTest {
        val disguised = box("ftyp", ascii("XAVC") + ByteArray(4) + ascii("mif1heic")) + box("mdat", ascii("GPSSECRET"))

        assertThat(sanitizer.sanitize(MediaUploadItem(disguised, "clip.mp4", "video/mp4"))).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
