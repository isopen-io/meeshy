package me.meeshy.app.feed

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.ui.component.retouch.ComposerRetouchResult
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Ce que « Terminé » téléverse d'une photo prise pour un post (#12735). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class FeedRetouchDeliveryTest {

    private fun jpeg(): ByteArray {
        val bitmap = Bitmap.createBitmap(40, 30, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.RED) }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    }

    private fun pending() = FeedRetouchPending.of(MediaUploadItem(jpeg(), "feed_capture_1.jpg", "image/jpeg"))!!

    @Test
    fun `une prise intouchee se televerse telle quelle`() {
        val waiting = pending()
        assertThat(FeedRetouchDelivery.item(waiting, ComposerRetouchResult.Original)).isSameInstanceAs(waiting.item)
        assertThat(FeedRetouchPending.of(MediaUploadItem(byteArrayOf(1, 2), "x.jpg", "image/jpeg"))).isNull()
    }

    @Test
    fun `une prise retouchee se televerse en JPEG sous un nom de retouche`() {
        val rendered = Bitmap.createBitmap(20, 20, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.BLUE) }
        val item = FeedRetouchDelivery.item(pending(), ComposerRetouchResult.Rendered(rendered))
        assertThat(item.fileName).isEqualTo("feed_capture_1_retouche.jpg")
        assertThat(item.mimeType).isEqualTo(FeedRetouchDelivery.JPEG_MIME)
        assertThat(BitmapFactory.decodeByteArray(item.bytes, 0, item.bytes.size).width).isEqualTo(20)
    }
}
