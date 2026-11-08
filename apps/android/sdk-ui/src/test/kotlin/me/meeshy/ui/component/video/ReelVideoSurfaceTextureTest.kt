package me.meeshy.ui.component.video

import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.media3.ui.PlayerView
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14624 — une surface [textured] dessine par une `TextureView` : elle se compose dans la hiérarchie (au-dessus d'une
 * autre vidéo, sous la rotation et le découpage de son objet). Sans elle, la `SurfaceView` du défaut reste celle des réels.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelVideoSurfaceTextureTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun playerSurface(view: View): View? = when (view) {
        is PlayerView -> view.videoSurfaceView
        is ViewGroup -> (0 until view.childCount).firstNotNullOfOrNull { playerSurface(view.getChildAt(it)) }
        else -> null
    }

    private fun surfaceOf(textured: Boolean): View? {
        compose.setContent { ReelVideoSurface(mediaUrl = "file:///sdcard/clip.mp4", isActive = true, textured = textured) }
        compose.waitForIdle()
        return playerSurface(compose.activity.window.decorView)
    }

    @Test
    fun `a textured surface draws through a TextureView`() {
        assertThat(surfaceOf(textured = true)).isInstanceOf(TextureView::class.java)
    }

    @Test
    fun `the default surface keeps the SurfaceView of the reels`() {
        assertThat(surfaceOf(textured = false)).isInstanceOf(SurfaceView::class.java)
    }
}
