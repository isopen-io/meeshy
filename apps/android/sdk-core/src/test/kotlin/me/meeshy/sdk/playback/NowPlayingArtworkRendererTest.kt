package me.meeshy.sdk.playback

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NowPlayingArtworkRendererTest {

    private fun solid(color: Int, width: Int = 100, height: Int = 50): Bitmap =
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(color) }

    @Test
    fun `nothing to draw gives no artwork`() {
        assertThat(NowPlayingArtworkRenderer.compose(null, null)).isNull()
    }

    @Test
    fun `the artwork is a 600 px square`() {
        val artwork = NowPlayingArtworkRenderer.compose(solid(Color.RED), solid(Color.BLUE))!!
        assertThat(artwork.width).isEqualTo(600)
        assertThat(artwork.height).isEqualTo(600)
    }

    @Test
    fun `without an avatar the app icon fills the frame`() {
        val artwork = NowPlayingArtworkRenderer.compose(null, solid(Color.BLUE))!!
        assertThat(artwork.getPixel(300, 300)).isEqualTo(Color.BLUE)
        assertThat(artwork.getPixel(10, 590)).isEqualTo(Color.BLUE)
    }

    @Test
    fun `with an avatar the icon is only a badge at the bottom left`() {
        val artwork = NowPlayingArtworkRenderer.compose(solid(Color.RED), solid(Color.BLUE))!!
        assertThat(artwork.getPixel(300, 300)).isEqualTo(Color.RED)
        assertThat(artwork.getPixel(100, 600 - 24 - 78)).isEqualTo(Color.BLUE)
        assertThat(artwork.getPixel(580, 20)).isEqualTo(Color.RED)
    }

    @Test
    fun `an avatar alone has no badge`() {
        val artwork = NowPlayingArtworkRenderer.compose(solid(Color.RED), null)!!
        assertThat(artwork.getPixel(100, 600 - 24 - 78)).isEqualTo(Color.RED)
    }
}
