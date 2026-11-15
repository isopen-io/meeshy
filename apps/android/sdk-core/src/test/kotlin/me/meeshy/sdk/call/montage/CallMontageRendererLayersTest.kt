package me.meeshy.sdk.call.montage

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameTone
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Le rendu en couches des classiques (miroir de `CallMontageLayersTests` iOS, #9348). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallMontageRendererLayersTest {

    private val width = 216
    private val height = 384
    private val caption = CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 oct. 2026", "10:42")
    private val person = CallFramePerson("self", "Ana", null, true)

    private fun scene(style: CallMontageStyle) =
        requireNotNull(CallMontageRenderer.layers(style, person, caption, width, height)) { "pas de couches pour $style" }

    @Test
    fun `chaque classique se peint en couches avec un trou transparent a la place du portrait`() {
        CallMontageStyle.entries.forEach { style ->
            val scene = scene(style)
            val frame = scene.hole.photoFrame
            val inside = scene.overlay.getPixel(frame.midX.toInt().coerceIn(0, width - 1), frame.midY.toInt().coerceIn(0, height - 1))
            assertWithMessage("$style : le trou est transparent (grain du noir toléré)").that(Color.alpha(inside)).isAtMost(40)
            assertThat(scene.frameId).isEqualTo("classic-${style.raw}")
        }
    }

    @Test
    fun `le decor et le dessus restent peints autour du trou`() {
        val scene = scene(CallMontageStyle.STRIP)
        val opaqueOutside = (0 until width).any { x -> Color.alpha(scene.overlay.getPixel(x, 2)) > 200 }
        assertThat(opaqueOutside).isTrue()
    }

    @Test
    fun `la decoupe couvre le trou et deborde de deux pixels`() {
        val scene = scene(CallMontageStyle.GRID)
        val hole = scene.hole
        val cx = hole.photoFrame.midX.toInt() - hole.maskOriginX
        val cy = hole.photoFrame.midY.toInt() - hole.maskOriginY
        assertThat(Color.alpha(hole.mask.getPixel(cx, cy))).isEqualTo(255)
        assertThat(hole.mask.width).isAtMost(width)
        assertThat(hole.mask.height).isAtMost(height)
    }

    @Test
    fun `le ton noir applique la luminance seule les autres restent en couleur`() {
        assertThat(scene(CallMontageStyle.NOIR).tone).isEqualTo(CallFrameTone.LUMINOSITY)
        CallMontageStyle.entries.filter { it != CallMontageStyle.NOIR }.forEach {
            assertThat(CallMontageRenderer.tone(it)).isEqualTo(CallFrameTone.COLOR)
        }
    }

    @Test
    fun `le trou du premier relevé gagne et une taille nulle ne donne rien`() {
        val hole = CallMontageHole()
        val a = android.graphics.Path().apply { addRect(0f, 0f, 1f, 1f, android.graphics.Path.Direction.CW) }
        val b = android.graphics.Path().apply { addRect(0f, 0f, 9f, 9f, android.graphics.Path.Direction.CW) }
        hole.record(a, me.meeshy.sdk.model.call.frames.CallFrameRect(0.0, 0.0, 1.0, 1.0), android.graphics.Matrix())
        hole.record(b, me.meeshy.sdk.model.call.frames.CallFrameRect(0.0, 0.0, 9.0, 9.0), android.graphics.Matrix())
        assertThat(hole.frame.width).isEqualTo(1.0)
        assertThat(CallMontageRenderer.layers(CallMontageStyle.GRID, person, caption, 0, 10)).isNull()
    }

    @Test
    fun `le rendu plein sait peindre en Display P3`() {
        val p3 = CallMontageRenderer.displayP3()
        val bitmap = CallMontageRenderer.render(
            CallMontageStyle.GRID, listOf(CallMontagePhoto("a", "Ana", Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888))), width, height, caption, p3,
        )
        assertThat(bitmap).isNotNull()
        assertThat(bitmap!!.width).isEqualTo(width)
    }
}
