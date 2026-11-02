package me.meeshy.app.chat

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.retouch.ComposerRetouchResult
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Ce que « Terminé » fait partir d'une photo prise depuis le composer (#12614). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChatRetouchDeliveryTest {

    private fun jpegOf(color: Int): ByteArray {
        val bitmap = Bitmap.createBitmap(40, 30, Bitmap.Config.ARGB_8888).also { it.eraseColor(color) }
        return java.io.ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    }

    private fun pending(): ChatRetouchPending = ChatRetouchPending.of(jpegOf(Color.RED), "chat_capture_1.jpg", "image/jpeg")!!

    @Test
    fun `une prise qui se decode attend sa retouche, debout`() {
        val waiting = pending()
        assertThat(waiting.bitmap.width).isEqualTo(40)
        assertThat(waiting.bitmap.height).isEqualTo(30)
        assertThat(ChatRetouchPending.of(byteArrayOf(1, 2, 3), "x.jpg", "image/jpeg")).isNull()
    }

    @Test
    fun `une prise intouchee part avec ses octets d origine, son nom et son type`() {
        val waiting = pending()
        val file = ChatRetouchDelivery.file(waiting, ComposerRetouchResult.Original, nowMillis = 7L)
        assertThat(file.bytes).isEqualTo(waiting.bytes)
        assertThat(file.fileName).isEqualTo("chat_capture_1.jpg")
        assertThat(file.mimeType).isEqualTo("image/jpeg")
    }

    @Test
    fun `une prise retouchee part en JPEG sous un nom de retouche`() {
        val rendered = Bitmap.createBitmap(20, 20, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.BLUE) }
        val file = ChatRetouchDelivery.file(pending(), ComposerRetouchResult.Rendered(rendered), nowMillis = 7L)
        assertThat(file.fileName).isEqualTo("chat_retouch_7.jpg")
        assertThat(file.mimeType).isEqualTo(ChatRetouchDelivery.JPEG_MIME)
        val decoded = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size)
        assertThat(decoded.width).isEqualTo(20)
        assertThat(Color.blue(decoded.getPixel(10, 10))).isGreaterThan(200)
    }
}
