package me.meeshy.app.stories

import android.content.Context
import android.media.AudioManager
import android.os.Looper
import androidx.compose.animation.core.Animatable
import androidx.compose.runtime.remember
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.net.InetAddress
import java.net.ServerSocket
import java.time.Duration

/**
 * #14611 — recette S8 : une story dont la scène porte une vidéo de fond ET une vidéo posée se figeait dans le lecteur, sans
 * en-tête ni barre. Chaque vidéo audible demandait le focus audio ; la seconde le retirait à la première, qui se mettait en
 * pause et prévenait l'hôte comme pour un appel. Une scène tient le focus UNE fois, comme la session audio unique d'iOS :
 * par son fond vidéo, sinon par sa première vidéo posée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StorySceneAudioFocusTest {

    @get:Rule
    val compose = createComposeRule()

    // Une origine qui accepte la connexion et ne répond jamais : la vidéo reste en BUFFERING, et Media3 1.10 demande son
    // focus depuis le fil de lecture (même harnais que ReelVideoSurfaceAudioFocusTest).
    private val stalledOrigin = ServerSocket(0, 8, InetAddress.getLoopbackAddress())
    private fun clipUrl(id: String) = "http://${stalledOrigin.inetAddress.hostAddress}:${stalledOrigin.localPort}/$id.mp4"

    @After
    fun closeOrigin() = stalledOrigin.close()

    private fun idleUntilFocusRequested() {
        val deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos()
        while (audioManager.lastAudioFocusRequest == null && System.nanoTime() < deadline) {
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(10))
            Thread.sleep(1)
        }
        compose.waitForIdle()
    }

    private val audioManager get() =
        shadowOf(ApplicationProvider.getApplicationContext<Context>().getSystemService(Context.AUDIO_SERVICE) as AudioManager)

    private fun placed(id: String, isVideo: Boolean = true) = StoryForegroundMediaView(
        id = id, url = clipUrl(id), isVideo = isVideo, x = 0.5, y = 0.5, scale = 1.0, aspectRatio = 9.0 / 16.0, rotation = 0.0,
    )

    private fun scene(backgroundVideo: Boolean, vararg media: StoryForegroundMediaView) = StorySlideView(
        id = "s", text = "", isTranslated = false, imageUrl = null, accentHex = "1A1A2E",
        backgroundVideoUrl = clipUrl("fond").takeIf { backgroundVideo },
        foregroundMedia = media.toList(),
    )

    @Test
    fun `a background video holds the focus of its scene, never a placed video`() {
        val slide = scene(backgroundVideo = true, placed("a"), placed("b"))
        assertThat(StorySceneAudioFocus.holder(slide)).isEqualTo(StorySceneAudioFocus.Holder.Background)
    }

    @Test
    fun `without a background video the first placed video holds the focus`() {
        val slide = scene(backgroundVideo = false, placed("photo", isVideo = false), placed("a"), placed("b"))
        assertThat(StorySceneAudioFocus.holder(slide)).isEqualTo(StorySceneAudioFocus.Holder.Placed("a"))
    }

    @Test
    fun `a scene without any video has no focus holder`() {
        assertThat(StorySceneAudioFocus.holder(scene(backgroundVideo = false, placed("photo", isVideo = false)))).isNull()
    }

    private fun showOverlays(slide: StorySlideView) {
        compose.setContent {
            val progress = remember { Animatable(0f) }
            StorySceneOverlays(slide = slide, progress = progress, slideDurationMs = 8_000, playing = true, muted = false)
        }
        idleUntilFocusRequested()
    }

    @Test
    fun `a placed video on a scene with a background video plays without taking the focus`() {
        showOverlays(scene(backgroundVideo = true, placed("a")))
        assertThat(audioManager.lastAudioFocusRequest).isNull()
    }

    @Test
    fun `the placed video that holds the focus of its scene takes it`() {
        showOverlays(scene(backgroundVideo = false, placed("a")))
        assertThat(audioManager.lastAudioFocusRequest).isNotNull()
    }
}
