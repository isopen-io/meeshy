package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import android.media.ExifInterface
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Une photo retouchée garde la date et l'appareil de la prise, jamais son lieu, debout et aux dimensions du rendu (#12606, #11247). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RetouchExifTest {

    private fun bitmap(width: Int, height: Int) = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.RED) }

    /** Une prise EXIF : couchée (orientation 6), datée, géolocalisée, d'un appareil nommé. */
    private fun take(): ByteArray {
        val file = File.createTempFile("take", ".jpg")
        try {
            file.writeBytes(ByteArrayOutputStream().also { bitmap(40, 20).compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray())
            ExifInterface(file.absolutePath).apply {
                setAttribute(ExifInterface.TAG_MAKE, "Samsung")
                setAttribute(ExifInterface.TAG_MODEL, "SM-G950F")
                setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2026:10:24 10:42:00")
                setAttribute(ExifInterface.TAG_GPS_LATITUDE, "48/1,51/1,0/1")
                setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF, "N")
                setAttribute(ExifInterface.TAG_GPS_LONGITUDE, "2/1,21/1,0/1")
                setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF, "E")
                setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString())
                saveAttributes()
            }
            return file.readBytes()
        } finally {
            file.delete()
        }
    }

    private fun exif(bytes: ByteArray) = ExifInterface(ByteArrayInputStream(bytes))

    @Test
    fun `le rendu garde l appareil et la date de la prise`() {
        val out = exif(RetouchExif.jpeg(bitmap(20, 40), like = take()))
        assertThat(out.getAttribute(ExifInterface.TAG_MAKE)).isEqualTo("Samsung")
        assertThat(out.getAttribute(ExifInterface.TAG_MODEL)).isEqualTo("SM-G950F")
        assertThat(out.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)).isEqualTo("2026:10:24 10:42:00")
    }

    @Test
    fun `le lieu de la prise ne part jamais avec la photo retouchee (iOS retire le GPS par defaut)`() {
        val take = take()
        assertThat(exif(take).getLatLong(FloatArray(2))).isTrue()
        val out = exif(RetouchExif.jpeg(bitmap(20, 40), like = take))
        assertThat(out.getAttribute(ExifInterface.TAG_GPS_LATITUDE)).isNull()
        assertThat(out.getAttribute(ExifInterface.TAG_GPS_LATITUDE_REF)).isNull()
        assertThat(out.getLatLong(FloatArray(2))).isFalse()
    }

    @Test
    fun `la vignette de la prise non retouchee ne voyage pas`() {
        val out = exif(RetouchExif.jpeg(bitmap(20, 40), like = take()))
        assertThat(out.hasThumbnail()).isFalse()
    }

    @Test
    fun `les pixels sont debout donc l orientation est 1, et les dimensions sont celles du rendu`() {
        val out = exif(RetouchExif.jpeg(bitmap(20, 40), like = take()))
        assertThat(out.getAttributeInt(ExifInterface.TAG_ORIENTATION, -1)).isEqualTo(ExifInterface.ORIENTATION_NORMAL)
        assertThat(out.getAttributeInt(ExifInterface.TAG_PIXEL_X_DIMENSION, -1)).isEqualTo(20)
        assertThat(out.getAttributeInt(ExifInterface.TAG_PIXEL_Y_DIMENSION, -1)).isEqualTo(40)
    }

    @Test
    fun `sans prise lisible le rendu part en JPEG sans metadonnees plutot que de ne pas partir`() {
        val plain = RetouchExif.jpeg(bitmap(20, 40), like = null)
        assertThat(exif(plain).getAttribute(ExifInterface.TAG_MAKE)).isNull()
        val broken = RetouchExif.jpeg(bitmap(20, 40), like = byteArrayOf(1, 2, 3))
        assertThat(broken.size).isGreaterThan(100)
        assertThat(exif(broken).getAttribute(ExifInterface.TAG_MAKE)).isNull()
    }
}
