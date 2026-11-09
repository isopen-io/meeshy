package me.meeshy.app.profile

import android.graphics.Bitmap
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.imageedit.CropRatio
import me.meeshy.sdk.model.imageedit.ImageEditorContext
import me.meeshy.ui.component.imageedit.ProfileImageEditorFlow
import me.meeshy.ui.component.imageedit.editorContext
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ImageEditorEntryPointsTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun source(): MediaUploadItem =
        MediaIntake.copy(byteArrayOf(1, 2, 3).inputStream(), context.cacheDir, "pick.png", "image/png")!!

    private fun edited(): Bitmap = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)

    @Test
    fun `l'avatar s'ouvre dans l'editeur en carre et la banniere en 16 9`() {
        assertThat(ImageUploadTarget.AVATAR.editorContext()).isEqualTo(ImageEditorContext.AVATAR)
        assertThat(ImageUploadTarget.AVATAR.editorContext().initialCropRatio).isEqualTo(CropRatio.SQUARE)
        assertThat(ImageUploadTarget.BANNER.editorContext().initialCropRatio).isEqualTo(CropRatio.RATIO_16_9)
    }

    @Test
    fun `une photo choisie attend sa retouche au lieu de partir`() {
        val sent = mutableListOf<ImageUploadTarget>()
        val flow = ProfileImageEditorFlow(context) { target, _ -> sent += target }
        flow.offer(ImageUploadTarget.AVATAR, source())
        assertThat(flow.pending?.target).isEqualTo(ImageUploadTarget.AVATAR)
        assertThat(sent).isEmpty()
    }

    @Test
    fun `Termine envoie le rendu final en JPEG et libere la photo d'origine`() {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = ProfileImageEditorFlow(context) { _, item -> sent += item }
        val original = source()
        flow.offer(ImageUploadTarget.AVATAR, original)
        flow.accept(ImageUploadTarget.AVATAR, original, edited())
        assertThat(flow.pending).isNull()
        assertThat(sent).hasSize(1)
        assertThat(sent.single().mimeType).isEqualTo("image/jpeg")
        assertThat(sent.single().fileName).isEqualTo("avatar.jpg")
        assertThat(sent.single().sizeBytes).isGreaterThan(0L)
    }

    @Test
    fun `Annuler n'envoie rien et efface la copie`() {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = ProfileImageEditorFlow(context) { _, item -> sent += item }
        val original = source()
        val file = (original.source as MediaUploadSource.OnDisk).file
        flow.offer(ImageUploadTarget.BANNER, original)
        flow.cancel()
        assertThat(flow.pending).isNull()
        assertThat(sent).isEmpty()
        assertThat(File(file.path).exists()).isFalse()
    }

    @Test
    fun `une photo illisible repart telle quelle`() {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = ProfileImageEditorFlow(context) { _, item -> sent += item }
        val original = source()
        flow.offer(ImageUploadTarget.AVATAR, original)
        flow.passthrough()
        assertThat(sent).containsExactly(original)
        assertThat(flow.pending).isNull()
    }

    @Test
    fun `Termine compresse le rendu sous le budget de l'avatar et libere la photo d'origine`() = runBlocking {
        val sent = mutableListOf<MediaUploadItem>()
        val flow = ProfileImageEditorFlow(context) { _, item -> sent += item }
        val original = source()
        flow.offer(ImageUploadTarget.AVATAR, original)
        flow.acceptCompressed(ImageUploadTarget.AVATAR, original, edited())
        assertThat(flow.pending).isNull()
        assertThat(flow.compressing).isFalse()
        assertThat(sent).hasSize(1)
        assertThat(sent.single().mimeType).isEqualTo("image/jpeg")
        assertThat(sent.single().sizeBytes).isAtMost(500L * 1024)
    }
}
