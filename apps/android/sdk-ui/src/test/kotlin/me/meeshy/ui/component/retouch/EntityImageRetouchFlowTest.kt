package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.EntityImageFormat
import me.meeshy.sdk.model.ImageUploadTarget
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Le trajet « choisir → retoucher → envoyer » d'un avatar ou d'une bannière (#17257). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class EntityImageRetouchFlowTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun source(): MediaUploadItem =
        MediaIntake.copy(byteArrayOf(1, 2, 3).inputStream(), context.cacheDir, "pick.png", "image/png")!!

    private fun picture(width: Int, height: Int): Bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

    private fun decodedSize(item: MediaUploadItem): Pair<Int, Int> {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(item.bytes, 0, item.bytes.size, options)
        return options.outWidth to options.outHeight
    }

    @Test
    fun `une photo choisie attend sa retouche au format de sa cible, et l avatar n ouvre jamais la banniere`() {
        val sent = mutableListOf<ImageUploadTarget>()
        val flow = EntityImageRetouchFlow(context) { target, _ -> sent += target }
        flow.offer(ImageUploadTarget.AVATAR, source())
        assertThat(flow.pending?.target).isEqualTo(ImageUploadTarget.AVATAR)
        assertThat(flow.pending?.format).isEqualTo(EntityImageFormat.AVATAR)
        assertThat(sent).isEmpty()
    }

    @Test
    fun `Annuler n envoie rien et efface la copie`() {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = EntityImageRetouchFlow(context) { _, item -> sent += item }
        val original = source()
        val file = (original.source as MediaUploadSource.OnDisk).file
        flow.offer(ImageUploadTarget.BANNER, original)
        flow.cancel()
        assertThat(flow.pending).isNull()
        assertThat(sent).isEmpty()
        assertThat(File(file.path).exists()).isFalse()
    }

    @Test
    fun `l avatar retouche part carre, en JPEG sous son budget, et la photo d origine est liberee`() = runBlocking {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = EntityImageRetouchFlow(context) { _, item -> sent += item }
        val original = source()
        flow.offer(ImageUploadTarget.AVATAR, original)
        flow.deliver(flow.pending!!, picture(400, 300))
        assertThat(flow.pending).isNull()
        assertThat(flow.compressing).isFalse()
        val item = sent.single()
        assertThat(item.mimeType).isEqualTo("image/jpeg")
        assertThat(item.fileName).isEqualTo("avatar.jpg")
        assertThat(item.sizeBytes).isAtMost(500L * 1024)
        val (width, height) = decodedSize(item)
        assertThat(width).isEqualTo(height)
    }

    @Test
    fun `la banniere part recadree en 3 1 quoi que la retouche ait rendu`() = runBlocking {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = EntityImageRetouchFlow(context) { _, item -> sent += item }
        flow.offer(ImageUploadTarget.BANNER, source())
        flow.deliver(flow.pending!!, picture(300, 300))
        val (width, height) = decodedSize(sent.single())
        assertThat(width).isEqualTo(300)
        assertThat(height).isEqualTo(100)
        assertThat(sent.single().fileName).isEqualTo("banner.jpg")
    }

    @Test
    fun `une photo illisible repart telle quelle`() {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = EntityImageRetouchFlow(context) { _, item -> sent += item }
        val original = source()
        flow.offer(ImageUploadTarget.AVATAR, original)
        flow.passthrough()
        assertThat(sent).containsExactly(original)
        assertThat(flow.pending).isNull()
    }

    @Test
    fun `le recadrage au format garde une image deja au format intacte`() {
        val square = picture(64, 64)
        assertThat(EntityImageCrop.cropped(square, EntityImageFormat.AVATAR)).isSameInstanceAs(square)
        val cropped = EntityImageCrop.cropped(picture(90, 60), EntityImageFormat.AVATAR)
        assertThat(cropped.width).isEqualTo(60)
        assertThat(cropped.height).isEqualTo(60)
    }
}
