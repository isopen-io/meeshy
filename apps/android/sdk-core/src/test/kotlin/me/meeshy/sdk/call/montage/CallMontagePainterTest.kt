package me.meeshy.sdk.call.montage

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.call.montage.CallMontageCanvas
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageSoloLayout
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Le peintre des classiques (miroir de `CallMontageLayersTests` / `ComposerLookPainterTests` iOS, #12589). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallMontagePainterTest {

    private val width = 216
    private val height = 384
    private val caption = CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 oct. 2026", "10:42")

    private fun solid(color: Int, w: Int = 64, h: Int = 64): Bitmap =
        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { it.eraseColor(color) }

    private fun photo(id: String = "self", color: Int = Color.RED) = CallMontagePhoto(id, "Ana", solid(color))

    private fun render(style: CallMontageStyle, photos: List<CallMontagePhoto> = listOf(photo())): Bitmap =
        requireNotNull(CallMontagePainter.render(style, photos, width, height, caption)) { "rendu nul pour $style" }

    private fun isRed(pixel: Int) = Color.red(pixel) > 180 && Color.green(pixel) < 80 && Color.blue(pixel) < 80
    private fun isDark(pixel: Int) = Color.red(pixel) < 40 && Color.green(pixel) < 40 && Color.blue(pixel) < 40
    private fun isLight(pixel: Int) = Color.red(pixel) > 170 && Color.green(pixel) > 170 && Color.blue(pixel) > 170

    @Test
    fun `chaque classique peint toute la toile, pour une personne comme pour trois`() {
        CallMontageStyle.entries.forEach { style ->
            listOf(1, 3).forEach { count ->
                val bitmap = render(style, (1..count).map { photo("p$it") })
                assertWithMessage("$style × $count").that(bitmap.width).isEqualTo(width)
                assertWithMessage("$style × $count").that(bitmap.height).isEqualTo(height)
            }
        }
        assertThat(CallMontagePainter.render(CallMontageStyle.GRID, listOf(photo()), 0, 10, caption)).isNull()
    }

    @Test
    fun `l Ecran d une photo seule est un appareil - bord noir, photo a l ecran`() {
        val screen = render(CallMontageStyle.SCREEN)
        val solo = CallMontageSoloLayout.screen(CallMontageCanvas(width.toDouble(), height.toDouble()).bounds)
        assertThat(isDark(screen.getPixel(width / 2, 3))).isTrue()
        assertThat(isDark(screen.getPixel(3, height / 2))).isTrue()
        assertThat(isRed(screen.getPixel(width / 2, height / 2))).isTrue()
        val bandBottom = (solo.statusBand.maxY + 2).toInt()
        assertWithMessage("sous la barre d'état, la photo reste lisible").that(Color.red(screen.getPixel(width / 2, bandBottom))).isGreaterThan(120)
    }

    @Test
    fun `la Mosaique d une photo seule pose des joints blancs a travers la photo`() {
        val mosaic = render(CallMontageStyle.GRID)
        val layout = CallMontageSoloLayout.mosaic(CallMontageCanvas(width.toDouble(), height.toDouble()).bounds)
        val jointX = (layout.tiles[0].maxX + layout.joint / 2).toInt()
        val tileY = layout.tiles[0].midY.toInt()
        assertThat(isLight(mosaic.getPixel(jointX, tileY))).isTrue()
        assertThat(isRed(mosaic.getPixel(layout.tiles[0].midX.toInt(), tileY))).isTrue()
    }

    @Test
    fun `le Noir desature la photo`() {
        val noir = render(CallMontageStyle.NOIR)
        val center = noir.getPixel(width / 2, height / 2)
        assertThat(kotlin.math.abs(Color.red(center) - Color.green(center))).isLessThan(30)
    }

    @Test
    fun `une personne sans image se peint en degrade, jamais en case vide`() {
        val bitmap = render(CallMontageStyle.SCREEN, listOf(CallMontagePhoto("bo", "Bo", null)))
        assertThat(isDark(bitmap.getPixel(width / 2, height / 2))).isFalse()
    }
}
