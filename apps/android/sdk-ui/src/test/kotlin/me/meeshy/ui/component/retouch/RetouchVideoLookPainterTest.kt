package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Le look d'une vidéo prêt pour le GPU (#12736) : la couleur du filtre, et le cadre en calque troué. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RetouchVideoLookPainterTest {

    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 Oct 2026", "10:42"), "24 Oct 2026")

    @Test
    fun `un filtre seul ne pose qu une matrice de couleur, sans calque`() {
        val look = RetouchVideoLookPainter.paint(ComposerPhotoLook(filter = VideoFilterPreset.Warm), author, 90, 160, still = null)!!
        assertThat(look.rgbMatrix).isNotNull()
        assertThat(look.frame).isNull()
        assertThat(look.placement).isNull()
    }

    @Test
    fun `un cadre a la taille de la video se troue la ou la prise se voit, et la case dit ou la poser`() {
        val still = Bitmap.createBitmap(90, 160, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.GREEN) }
        val polaroid = ComposerPhotoLook(frame = ComposerPhotoFrame.Montage(CallMontageChoice.Classic(CallMontageStyle.POLAROID)))
        val look = RetouchVideoLookPainter.paint(polaroid, author, 90, 160, still)!!
        val frame = look.frame!!
        assertThat(frame.width).isEqualTo(90)
        assertThat(frame.height).isEqualTo(160)
        assertThat(Color.alpha(frame.getPixel(45, 70))).isLessThan(40)
        assertThat(Color.alpha(frame.getPixel(1, 158))).isEqualTo(255)
        assertThat(look.placement!!.scale).isLessThan(1f)
    }
}
