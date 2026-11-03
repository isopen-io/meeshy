package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaFraming
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13841 — le look d'une vidéo de la story prêt pour le GPU : le même pour le lecteur vivant de la scène et pour la
 * cuisson de la publication. Le cadrage recadre, le filtre colore, le cadre se pose en calque ; l'effet de visage, qu'une
 * vidéo ne peint pas, ne pose rien.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryVideoLookTest {

    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "3 Nov 2026", "10:42"), "3 Nov 2026")

    @Test
    fun `un filtre seul ne pose que sa matrice de couleur, sans recadrage ni calque`() {
        val painted = StoryVideoLook.painted(StoryMediaLook(filterPreset = "warm"), author, 90, 160, still = null)!!

        assertThat(painted.look.rgbMatrix).isNotNull()
        assertThat(painted.look.frame).isNull()
        assertThat(painted.cropNdc).isNull()
    }

    @Test
    fun `un cadrage recadre la video au centre, en bornes du GPU`() {
        val painted = StoryVideoLook.painted(StoryMediaLook(framing = StoryMediaFraming(0.5, 0.5, 2.0)), author, 90, 160, still = null)!!

        assertThat(painted.cropNdc!!.toList()).containsExactly(-0.5f, 0.5f, -0.5f, 0.5f).inOrder()
    }

    @Test
    fun `un cadre se peint a la taille de la video recadree, en calque`() {
        val still = Bitmap.createBitmap(90, 160, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.GREEN) }

        val painted = StoryVideoLook.painted(
            StoryMediaLook(frameId = "classic:polaroid", framing = StoryMediaFraming(0.5, 0.5, 2.0)),
            author,
            90,
            160,
            still,
        )!!

        assertThat(painted.look.frame!!.width).isEqualTo(45)
        assertThat(painted.look.frame!!.height).isEqualTo(80)
        assertThat(painted.look.placement).isNotNull()
    }

    @Test
    fun `une video lue image par image recoit un cadre peint a la taille de ses images decodees`() {
        val still = Bitmap.createBitmap(90, 160, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.GREEN) }

        val painted = StoryVideoLook.painted(StoryMediaLook(frameId = "classic:polaroid"), author, 900, 1600, still, maxLongSide = 160)!!

        assertThat(painted.look.frame!!.width).isEqualTo(90)
        assertThat(painted.look.frame!!.height).isEqualTo(160)
        assertThat(StoryVideoLook.painted(StoryMediaLook(frameId = "classic:polaroid"), author, 90, 160, still, maxLongSide = 1_080)!!.look.frame!!.height)
            .isEqualTo(160)
    }

    @Test
    fun `un effet de visage seul, ou aucun look, ne pose rien`() {
        assertThat(StoryVideoLook.painted(StoryMediaLook(faceEffect = "angel"), author, 90, 160, still = null)).isNull()
        assertThat(StoryVideoLook.effects(null, author, 90, 160, still = null)).isNull()
    }
}
