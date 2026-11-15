package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.ExifInterface
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #15970 — la copie nette d'une photo en attente : ses pixels, debout et bornés, et rien d'autre de l'original. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SanitizedImageEncoderTest {
    @get:Rule val folder = TemporaryFolder()

    /** Une prise couchée (orientation 6), géolocalisée, datée, d'un appareil nommé. */
    private fun take(width: Int, height: Int, orientation: Int = ExifInterface.ORIENTATION_ROTATE_90): ByteArray {
        val file = folder.newFile()
        val pixels = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.BLUE) }
        file.writeBytes(ByteArrayOutputStream().also { pixels.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray())
        ExifInterface(file.absolutePath).apply {
            setAttribute(ExifInterface.TAG_MAKE, "Samsung")
            setAttribute(ExifInterface.TAG_MODEL, "SM-G950F")
            setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2026:11:04 10:42:00")
            setAttribute(ExifInterface.TAG_GPS_LATITUDE, "48/1,51/1,0/1")
            setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF, "N")
            setAttribute(ExifInterface.TAG_GPS_LONGITUDE, "2/1,21/1,0/1")
            setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF, "E")
            setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
            saveAttributes()
        }
        return file.readBytes()
    }

    private fun encoded(bytes: ByteArray): File {
        val target = File(folder.root, "out/cmid_1.sharp.jpg")
        assertThat(SanitizedImageEncoder.encode({ ByteArrayInputStream(bytes) }, target)).isTrue()
        return target
    }

    private fun boundsOf(file: File): Pair<Int, Int> {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, options)
        return options.outWidth to options.outHeight
    }

    @Test
    fun `the sharp copy carries no location, no device and no date of the original`() {
        val original = take(400, 300)
        assertThat(ExifInterface(ByteArrayInputStream(original)).getLatLong(FloatArray(2))).isTrue()

        val exif = ExifInterface(encoded(original).path)

        assertThat(exif.getLatLong(FloatArray(2))).isFalse()
        assertThat(exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE)).isNull()
        assertThat(exif.getAttribute(ExifInterface.TAG_MAKE)).isNull()
        assertThat(exif.getAttribute(ExifInterface.TAG_MODEL)).isNull()
        assertThat(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)).isNull()
    }

    @Test
    fun `a lying photo is stood up in its pixels, the copy declaring no orientation`() {
        val copy = encoded(take(400, 300))

        assertThat(boundsOf(copy)).isEqualTo(300 to 400)
        assertThat(ExifInterface(copy.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, 0))
            .isAnyOf(0, ExifInterface.ORIENTATION_NORMAL, ExifInterface.ORIENTATION_UNDEFINED)
    }

    @Test
    fun `a photo larger than the bound is scaled down to it, sharp enough to zoom`() {
        val copy = encoded(take(4000, 3000, ExifInterface.ORIENTATION_NORMAL))

        val (width, height) = boundsOf(copy)
        assertThat(maxOf(width, height)).isEqualTo(SanitizedImageEncoder.MAX_EDGE_PX)
        assertThat(width.toDouble() / height).isWithin(0.01).of(4.0 / 3.0)
    }

    @Test
    fun `octets that are not an image write nothing`() {
        val target = File(folder.root, "out/cmid_2.sharp.jpg")

        assertThat(SanitizedImageEncoder.encode({ ByteArrayInputStream(byteArrayOf(1, 2, 3)) }, target)).isFalse()
        assertThat(target.exists()).isFalse()
    }
}
