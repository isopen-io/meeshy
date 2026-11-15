package me.meeshy.app.calls

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.CaptureGallery
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.RobolectricTestRunner

/**
 * Une capture d'appel part dans la galerie par [CaptureGallery] (MediaStore, stockage cloisonné, aucune
 * permission dès l'API 29) : l'image y arrive encodée sous le nom demandé, la vidéo telle quelle, et un
 * refus de la galerie se dit par `false`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GalleryCallCaptureSaverTest {

    private class Gallery(private val accepts: Boolean = true) : CaptureGallery {
        val images = mutableListOf<Pair<ByteArray, String>>()
        val videos = mutableListOf<Pair<File, String>>()
        override suspend fun saveImage(jpeg: ByteArray, displayName: String): Boolean {
            images += jpeg to displayName
            return accepts
        }

        override suspend fun saveVideo(file: File, displayName: String): Boolean {
            videos += file to displayName
            return accepts
        }
    }

    private fun bitmap(): Bitmap = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)

    @Test
    fun `une photo part en JPEG sous son nom`() = runTest {
        val gallery = Gallery()

        val saved = GalleryCallCaptureSaver(gallery).saveImage(bitmap(), "meeshy-call-1.jpg")

        assertThat(saved).isTrue()
        val (bytes, name) = gallery.images.single()
        assertThat(name).isEqualTo("meeshy-call-1.jpg")
        assertThat(bytes).isNotEmpty()
    }

    @Test
    fun `un refus de la galerie est dit`() = runTest {
        assertThat(GalleryCallCaptureSaver(Gallery(accepts = false)).saveImage(bitmap(), "x.jpg")).isFalse()
    }

    @Test
    fun `une video est confiee a la galerie telle quelle`() = runTest {
        val gallery = Gallery()
        val file = File("montage.mp4")

        val saved = GalleryCallCaptureSaver(gallery).saveVideo(file, "meeshy-call-1.mp4")

        assertThat(saved).isTrue()
        assertThat(gallery.videos.single()).isEqualTo(file to "meeshy-call-1.mp4")
    }
}
