package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.ExifInterface
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import me.meeshy.sdk.model.media.ImageByteBudget
import me.meeshy.sdk.model.media.ImageUploadContext
import kotlin.random.Random
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ImageCompressorTest {

    private fun compressor() = ImageCompressor(UnconfinedTestDispatcher())

    private fun encode(width: Int, height: Int, format: Bitmap.CompressFormat): ByteArray {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
        return ByteArrayOutputStream().also { bitmap.compress(format, 90, it) }.toByteArray()
    }

    private fun jpegWithOrientation(width: Int, height: Int, orientation: Int): ByteArray {
        val file = File.createTempFile("exif", ".jpg")
        file.writeBytes(encode(width, height, Bitmap.CompressFormat.JPEG))
        ExifInterface(file.absolutePath).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
            saveAttributes()
        }
        return file.readBytes().also { file.delete() }
    }

    private fun dimensions(bytes: ByteArray): Pair<Int, Int> {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        return options.outWidth to options.outHeight
    }

    @Test
    fun `un jpeg au dessus du plafond du message est réduit à 1200`() = runTest {
        val result = compressor().compress(encode(3000, 2000, Bitmap.CompressFormat.JPEG), ImageUploadContext.MESSAGE)
        assertThat(dimensions(result.bytes)).isEqualTo(1200 to 800)
        assertThat(result.mimeType).isEqualTo("image/jpeg")
        assertThat(result.fileExtension).isEqualTo("jpg")
        assertThat(result.recompressed).isTrue()
    }

    @Test
    fun `chaque contexte applique son plafond`() = runTest {
        val source = encode(4000, 4000, Bitmap.CompressFormat.JPEG)
        mapOf(
            ImageUploadContext.STORY to 1080,
            ImageUploadContext.FEED_POST to 1600,
            ImageUploadContext.AVATAR to 512,
            ImageUploadContext.FULLSCREEN to 2048,
        ).forEach { (context, ceiling) ->
            assertThat(dimensions(compressor().compress(source, context).bytes)).isEqualTo(ceiling to ceiling)
        }
    }

    @Test
    fun `l'orientation exif est appliquée aux pixels`() = runTest {
        val source = jpegWithOrientation(3000, 2000, ExifInterface.ORIENTATION_ROTATE_90)
        val result = compressor().compress(source, ImageUploadContext.MESSAGE)
        assertThat(dimensions(result.bytes)).isEqualTo(800 to 1200)
    }

    @Test
    fun `un png trop grand reste un png`() = runTest {
        val result = compressor().compress(encode(3000, 1500, Bitmap.CompressFormat.PNG), ImageUploadContext.MESSAGE)
        assertThat(result.mimeType).isEqualTo("image/png")
        assertThat(result.fileExtension).isEqualTo("png")
        assertThat(dimensions(result.bytes)).isEqualTo(1200 to 600)
    }

    @Test
    fun `un png sous le plafond part intact`() = runTest {
        val source = encode(400, 300, Bitmap.CompressFormat.PNG)
        val result = compressor().compress(source, ImageUploadContext.MESSAGE)
        assertThat(result.bytes).isEqualTo(source)
        assertThat(result.recompressed).isFalse()
        assertThat(result.mimeType).isEqualTo("image/png")
    }

    @Test
    fun `un gif passe tel quel avec son type`() = runTest {
        val gif = byteArrayOf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3B)
        val result = compressor().compress(gif, ImageUploadContext.AVATAR)
        assertThat(result.bytes).isEqualTo(gif)
        assertThat(result.mimeType).isEqualTo("image/gif")
        assertThat(result.fileExtension).isEqualTo("gif")
    }

    @Test
    fun `des octets illisibles reviennent tels quels`() = runTest {
        val junk = ByteArray(64) { 7 }
        val result = compressor().compress(junk, ImageUploadContext.MESSAGE)
        assertThat(result.bytes).isEqualTo(junk)
        assertThat(result.recompressed).isFalse()
    }

    private fun noisy(width: Int, height: Int): ByteArray {
        val random = Random(42)
        val pixels = IntArray(width * height) { Color.rgb(random.nextInt(256), random.nextInt(256), random.nextInt(256)) }
        val bitmap = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
    }

    @Test
    fun `l'avatar converge sous 500 Ko et sous 512 px`() = runTest {
        val result = compressor().compressToBudget(noisy(1400, 1400), ImageByteBudget.AVATAR)
        assertThat(result.bytes.size.toLong()).isAtMost(ImageByteBudget.AVATAR.maxBytes)
        val (w, h) = dimensions(result.bytes)
        assertThat(maxOf(w, h)).isAtMost(512)
        assertThat(result.mimeType).isEqualTo("image/jpeg")
    }

    @Test
    fun `la banniere reste sous 800 Ko et sous 1600 px`() = runTest {
        val result = compressor().compressToBudget(noisy(2400, 1000), ImageByteBudget.BANNER)
        assertThat(result.bytes.size.toLong()).isAtMost(ImageByteBudget.BANNER.maxBytes)
        assertThat(dimensions(result.bytes).first).isAtMost(1600)
    }

    @Test
    fun `une image sous le budget part en une passe a la qualite de depart`() = runTest {
        val small = encode(200, 200, Bitmap.CompressFormat.JPEG)
        val result = compressor().compressToBudget(small, ImageByteBudget.AVATAR)
        assertThat(result.bytes.size.toLong()).isAtMost(ImageByteBudget.AVATAR.maxBytes)
        assertThat(dimensions(result.bytes)).isEqualTo(200 to 200)
    }

    @Test
    fun `l'orientation exif est cuite dans le rendu du budget`() = runTest {
        val source = jpegWithOrientation(3000, 2000, ExifInterface.ORIENTATION_ROTATE_90)
        val result = compressor().compressToBudget(source, ImageByteBudget.BANNER)
        val (w, h) = dimensions(result.bytes)
        assertThat(h).isGreaterThan(w)
    }

    @Test
    fun `une grande image est decodee sans exploser`() = runTest {
        val big = encode(5000, 4000, Bitmap.CompressFormat.JPEG)
        val result = compressor().compressToBudget(big, ImageByteBudget.AVATAR)
        assertThat(maxOf(dimensions(result.bytes).first, dimensions(result.bytes).second)).isAtMost(512)
    }

    @Test
    fun `des octets illisibles reviennent tels quels au budget`() = runTest {
        val junk = ByteArray(64) { 7 }
        assertThat(compressor().compressToBudget(junk, ImageByteBudget.AVATAR).bytes).isEqualTo(junk)
    }

    @Test
    fun `l'annulation de la coroutine interrompt la compression`() = runTest {
        var cancelled = false
        val job = launch {
            try {
                compressor().compressToBudget(noisy(1400, 1400), ImageByteBudget.AVATAR)
            } catch (e: CancellationException) {
                cancelled = true
                throw e
            }
        }
        job.cancel()
        advanceUntilIdle()
        assertThat(cancelled || job.isCancelled).isTrue()
    }
}
