package me.meeshy.app.feed

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import me.meeshy.sdk.model.composer.look.ComposerPhotoRecipe
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import me.meeshy.ui.component.retouch.ComposerRetouchResult
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Ce que « Terminé » téléverse d'une photo prise pour un commentaire (#12735), et ce qu'il garde pour la rouvrir (#14844). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class FeedRetouchDeliveryTest {

    private fun jpeg(): ByteArray {
        val bitmap = Bitmap.createBitmap(40, 30, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.RED) }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    }

    private val author = ComposerLookAuthor("self", "", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "3 Nov 2026", "10:42"), "3 Nov 2026")
    private val warm = ComposerPhotoRecipe(look = ComposerPhotoLook(filter = VideoFilterPreset.Warm))
    private fun blue() = Bitmap.createBitmap(20, 20, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.BLUE) }

    private fun pending(previous: CommentPieceRetouch? = null) =
        FeedRetouchPending.of(MediaUploadItem(jpeg(), "feed_capture_1.jpg", "image/jpeg"), previous)!!

    @Test
    fun `une prise intouchee ne change rien`() {
        assertThat(FeedRetouchDelivery.delivered(pending(), ComposerRetouchResult.Original, author)).isNull()
        assertThat(FeedRetouchPending.of(MediaUploadItem(byteArrayOf(1, 2), "x.jpg", "image/jpeg"))).isNull()
    }

    @Test
    fun `une prise retouchee se televerse en JPEG sous un nom de retouche, et garde son original et sa recette`() {
        val waiting = pending()
        val delivered = checkNotNull(FeedRetouchDelivery.delivered(waiting, ComposerRetouchResult.Rendered(blue(), warm), author))
        assertThat(delivered.item.fileName).isEqualTo("feed_capture_1_retouche.jpg")
        assertThat(delivered.item.mimeType).isEqualTo(FeedRetouchDelivery.JPEG_MIME)
        assertThat(BitmapFactory.decodeByteArray(delivered.item.bytes, 0, delivered.item.bytes.size).width).isEqualTo(20)
        assertThat(delivered.retouch).isEqualTo(CommentPieceRetouch(waiting.item, warm, author))
    }

    @Test
    fun `rouverte, une piece remise a zero repart avec son original, et une recette inchangee ne change rien`() {
        val original = MediaUploadItem(jpeg(), "feed_capture_1.jpg", "image/jpeg")
        val reopened = FeedRetouchPending.of(original, CommentPieceRetouch(original, warm, author))!!
        assertThat(FeedRetouchDelivery.delivered(reopened, ComposerRetouchResult.Rendered(blue(), warm), author)).isNull()
        val reset = checkNotNull(FeedRetouchDelivery.delivered(reopened, ComposerRetouchResult.Original, author))
        assertThat(reset.item).isSameInstanceAs(original)
        assertThat(reset.retouch).isNull()
    }
}
