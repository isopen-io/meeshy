package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.StoryTextBackground
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Les fonds des textes cuits : le plein couvre sa boîte, le verre floute la prise dessous (iOS #12602). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RetouchGlassPainterTest {

    private val size = 400

    /** Rouge à gauche, bleu à droite : la frontière verticale est ce qu'un flou adoucit. */
    private fun split(): Bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).also { bitmap ->
        for (x in 0 until size) for (y in 0 until size) bitmap.setPixel(x, y, if (x < size / 2) Color.RED else Color.BLUE)
    }

    private fun text(background: StoryTextBackground) = StoryTextObject(
        id = "t", text = "I", x = 0.5, y = 0.5, fontSize = 96.0, textColor = "#FFFFFF", backgroundStyle = background.toStyleWire(),
    )

    @Test
    fun `sous un texte Verre la prise est floutee, ailleurs elle ne bouge pas`() {
        val out = RetouchTextPainter.composited(split(), listOf(text(StoryTextBackground.Glass(24.0))))
        val inside = out.getPixel(192, 185)
        assertThat(Color.red(inside)).isIn(com.google.common.collect.Range.open(20, 235))
        assertThat(Color.blue(inside)).isGreaterThan(20)
        assertThat(out.getPixel(192, 40)).isEqualTo(Color.RED)
        assertThat(out.getPixel(208, 360)).isEqualTo(Color.BLUE)
    }

    @Test
    fun `un fond plein couvre la boite du texte et laisse le reste de la prise`() {
        val out = RetouchTextPainter.composited(split(), listOf(text(StoryTextBackground.Solid("00FF00"))))
        assertThat(out.getPixel(192, 185)).isEqualTo(Color.GREEN)
        assertThat(out.getPixel(192, 40)).isEqualTo(Color.RED)
    }

    @Test
    fun `un texte sans fond ne change rien autour de ses glyphes`() {
        val out = RetouchTextPainter.composited(split(), listOf(text(StoryTextBackground.None)))
        assertThat(out.getPixel(192, 185)).isEqualTo(Color.RED)
    }

    @Test
    fun `la prise d origine n est jamais modifiee par la cuisson`() {
        val base = split()
        RetouchTextPainter.composited(base, listOf(text(StoryTextBackground.Glass(24.0))))
        assertThat(base.getPixel(192, 185)).isEqualTo(Color.RED)
    }

    @Test
    fun `les vitres de l apercu ne portent que le verre, vide sans verre`() {
        val glass = RetouchGlassPainter.panes(split(), listOf(text(StoryTextBackground.Glass(24.0))))!!
        assertThat(Color.alpha(glass.getPixel(192, 185))).isEqualTo(255)
        assertThat(Color.alpha(glass.getPixel(192, 40))).isEqualTo(0)
        assertThat(RetouchGlassPainter.panes(split(), listOf(text(StoryTextBackground.Solid("00FF00"))))).isNull()
    }

    @Test
    fun `l apercu ne prepare de vitre que pour un texte Verre ecrit`() {
        assertThat(RetouchGlassPainter.hasGlass(listOf(text(StoryTextBackground.Glass(24.0))))).isTrue()
        assertThat(RetouchGlassPainter.hasGlass(listOf(text(StoryTextBackground.Glass(24.0)).copy(text = "  ")))).isFalse()
        assertThat(RetouchGlassPainter.hasGlass(listOf(text(StoryTextBackground.Solid("00FF00")), text(StoryTextBackground.None)))).isFalse()
    }
}
