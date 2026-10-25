package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.CallFaceEffectGeometry
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Les effets de visage peints sur une photo (#12733), là où iOS les pose. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RetouchFaceEffectsTest {

    private val face = CallFaceLandmarks(FaceBox(120f, 200f, 160f, 208f))

    private fun gray(): Bitmap = Bitmap.createBitmap(400, 600, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.rgb(128, 128, 128)) }

    @Test
    fun `aucun effet rend la prise elle meme`() {
        val photo = gray()
        assertThat(RetouchFaceEffects.apply(CallFaceEffect.NONE, photo, face)).isSameInstanceAs(photo)
    }

    @Test
    fun `le demon pose ses cornes au dessus du front et rougit la prise`() {
        val painted = RetouchFaceEffects.apply(CallFaceEffect.DEMON, gray(), face)
        val horn = CallFaceEffectGeometry.hornRects(face.bounds).first()
        val tip = painted.getPixel((horn.left + horn.width * 0.3f).toInt(), (horn.top + horn.height * 0.6f).toInt())
        assertThat(Color.red(tip)).isGreaterThan(Color.green(tip) + 60)
        val cheek = painted.getPixel(face.bounds.midX.toInt(), (face.bounds.top + face.bounds.height * 0.8f).toInt())
        assertThat(Color.red(cheek)).isGreaterThan(Color.blue(cheek))
    }

    @Test
    fun `l ange pose un halo dore au dessus de la tete`() {
        val painted = RetouchFaceEffects.apply(CallFaceEffect.ANGEL, gray(), face)
        val halo = CallFaceEffectGeometry.haloRect(face.bounds)
        val ring = painted.getPixel(halo.midX.toInt(), (halo.top + halo.height * 0.24f).toInt())
        assertThat(Color.red(ring)).isGreaterThan(Color.blue(ring) + 40)
    }

    @Test
    fun `le crapaud verdit le visage, pas les coins`() {
        val painted = RetouchFaceEffects.apply(CallFaceEffect.TOAD, gray(), face)
        val middle = painted.getPixel(face.bounds.midX.toInt(), face.bounds.midY.toInt())
        assertThat(Color.green(middle)).isGreaterThan(Color.blue(middle) + 30)
        val corner = painted.getPixel(2, 2)
        assertThat(Color.green(corner)).isWithin(4).of(Color.blue(corner))
    }

    @Test
    fun `sans visage, le crapaud teinte la prise entiere et le lissage ne touche a rien`() {
        val toad = RetouchFaceEffects.apply(CallFaceEffect.TOAD, gray(), null).getPixel(2, 2)
        assertThat(Color.green(toad)).isGreaterThan(Color.blue(toad))
        val photo = gray()
        assertThat(RetouchFaceEffects.apply(CallFaceEffect.SMOOTHING, photo, null)).isSameInstanceAs(photo)
    }

    @Test
    fun `l eruption fait monter la lave du bas de l image`() {
        val painted = RetouchFaceEffects.apply(CallFaceEffect.VOLCANO, gray(), null)
        val bottom = painted.getPixel(200, 597)
        val top = painted.getPixel(200, 10)
        assertThat(Color.red(bottom) - Color.blue(bottom)).isGreaterThan(Color.red(top) - Color.blue(top) + 30)
    }
}
