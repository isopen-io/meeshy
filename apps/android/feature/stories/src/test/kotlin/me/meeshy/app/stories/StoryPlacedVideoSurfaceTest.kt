package me.meeshy.app.stories

import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.animation.core.Animatable
import androidx.compose.runtime.remember
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14624 — recette S8 : dans la carte du fil, la vidéo POSÉE d'une scène à fond vidéo n'apparaissait pas, le détail la
 * dessinait. Deux `SurfaceView` superposées n'ont aucun ordre garanti : celle du fond recouvrait l'objet. Une vidéo posée
 * passe par une `TextureView`, dessinée dans la hiérarchie au-dessus du fond — et qui suit la pose de l'objet (rotation,
 * coins arrondis, opacité), comme le compositeur (`ComposerLiveVideo`) et iOS (`StoryMediaLayer`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryPlacedVideoSurfaceTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun videoSurfaces(view: View): List<View> = when (view) {
        is SurfaceView, is TextureView -> listOf(view)
        is ViewGroup -> (0 until view.childCount).flatMap { videoSurfaces(view.getChildAt(it)) }
        else -> emptyList()
    }

    @Test
    fun `a video placed on a scene with a background video draws through a TextureView`() {
        val slide = StorySlideView(
            id = "s", text = "", isTranslated = false, imageUrl = null, accentHex = "1A1A2E",
            backgroundVideoUrl = "file:///sdcard/fond.mp4",
            foregroundMedia = listOf(
                StoryForegroundMediaView(
                    id = "v", url = "file:///sdcard/v.mp4", isVideo = true, x = 0.5, y = 0.5, scale = 1.0,
                    aspectRatio = 9.0 / 16.0, rotation = 0.0,
                ),
            ),
        )
        compose.setContent {
            StorySceneOverlays(slide = slide, progress = remember { Animatable(0f) }, slideDurationMs = 8_000, playing = true, muted = true)
        }
        compose.waitForIdle()

        val surfaces = videoSurfaces(compose.activity.window.decorView)
        assertThat(surfaces).hasSize(1)
        assertThat(surfaces.single()).isInstanceOf(TextureView::class.java)
    }
}
