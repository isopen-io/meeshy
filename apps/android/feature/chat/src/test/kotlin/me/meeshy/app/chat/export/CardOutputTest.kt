package me.meeshy.app.chat.export

import android.content.Context
import android.graphics.Typeface
import android.provider.MediaStore
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class CardOutputTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `android 8 and 9 write the gallery the historical way and android 10 onwards the scoped way`() {
        assertThat(CardGalleryRoute.of(26)).isEqualTo(CardGalleryRoute.LEGACY)
        assertThat(CardGalleryRoute.of(28)).isEqualTo(CardGalleryRoute.LEGACY)
        assertThat(CardGalleryRoute.of(29)).isEqualTo(CardGalleryRoute.SCOPED)
        assertThat(CardGalleryRoute.of(35)).isEqualTo(CardGalleryRoute.SCOPED)
    }

    @Test
    fun `on android 9 the card lands in Pictures Meeshy and is indexed so the gallery shows it`() {
        val pictures = Files.createTempDirectory("pictures").toFile()

        val file = CardOutput.saveLegacy(context, pictures, "meeshy-20261027-210000.png") { it.write(byteArrayOf(1, 2, 3)) }

        assertThat(file).isEqualTo(File(File(pictures, "Meeshy"), "meeshy-20261027-210000.png"))
        assertThat(file.readBytes()).isEqualTo(byteArrayOf(1, 2, 3))
        val inserted = shadowOf(context.contentResolver).insertStatements.single()
        assertThat(inserted.uri).isEqualTo(MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
        assertThat(inserted.contentValues.getAsString(MediaStore.MediaColumns.DATA)).isEqualTo(file.absolutePath)
        assertThat(inserted.contentValues.getAsString(MediaStore.MediaColumns.MIME_TYPE)).isEqualTo("image/png")
    }

    @Test
    fun `a write that fails on android 9 leaves no half file behind`() {
        val pictures = Files.createTempDirectory("pictures").toFile()

        assertThrows(IllegalStateException::class.java) {
            CardOutput.saveLegacy(context, pictures, "broken.png") { it.write(1); error("disk full") }
        }

        assertThat(File(File(pictures, "Meeshy"), "broken.png").exists()).isFalse()
        assertThat(shadowOf(context.contentResolver).insertStatements).isEmpty()
    }

    @Test
    fun `below android 9 the exact weight falls back to bold or normal instead of crashing`() {
        assertThat(CardRenderer.legacyStyle(400, italic = false)).isEqualTo(Typeface.NORMAL)
        assertThat(CardRenderer.legacyStyle(700, italic = false)).isEqualTo(Typeface.BOLD)
        assertThat(CardRenderer.legacyStyle(300, italic = true)).isEqualTo(Typeface.ITALIC)
        assertThat(CardRenderer.legacyStyle(800, italic = true)).isEqualTo(Typeface.BOLD_ITALIC)
    }
}
