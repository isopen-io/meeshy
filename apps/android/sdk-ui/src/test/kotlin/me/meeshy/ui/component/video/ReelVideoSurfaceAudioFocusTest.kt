package me.meeshy.ui.component.video

import android.content.Context
import android.media.AudioManager
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * #13399 — une seule lecture à la fois : une vidéo AUDIBLE prend le focus audio (un vocal du fil le perd donc et se met
 * en pause, et inversement), une vidéo muette ou préchargée n'y touche jamais.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelVideoSurfaceAudioFocusTest {

    @get:Rule
    val compose = createComposeRule()

    private val audioManager get() =
        shadowOf(ApplicationProvider.getApplicationContext<Context>().getSystemService(Context.AUDIO_SERVICE) as AudioManager)

    private fun show(isActive: Boolean, muted: Boolean, onAudioFocusLost: () -> Unit = {}) {
        compose.setContent {
            ReelVideoSurface(
                mediaUrl = "file:///sdcard/clip.mp4",
                isActive = isActive,
                muted = muted,
                onAudioFocusLost = onAudioFocusLost,
            )
        }
        compose.waitForIdle()
    }

    @Test
    fun `une video audible qui joue prend le focus audio`() {
        show(isActive = true, muted = false)
        assertThat(audioManager.lastAudioFocusRequest).isNotNull()
    }

    @Test
    fun `une video muette qui joue ne prend aucun focus`() {
        show(isActive = true, muted = true)
        assertThat(audioManager.lastAudioFocusRequest).isNull()
    }

    @Test
    fun `une video audible mais en attente (page suivante prechargee) ne prend aucun focus`() {
        show(isActive = false, muted = false)
        assertThat(audioManager.lastAudioFocusRequest).isNull()
    }

    @Test
    fun `couper le son rend le focus`() {
        var muted by mutableStateOf(false)
        compose.setContent { ReelVideoSurface(mediaUrl = "file:///sdcard/clip.mp4", isActive = true, muted = muted) }
        compose.waitForIdle()
        assertThat(audioManager.lastAudioFocusRequest).isNotNull()
        muted = true
        compose.waitForIdle()
        assertThat(audioManager.lastAbandonedAudioFocusRequest).isNotNull()
    }

    @Test
    fun `un vocal qui prend le focus met la video en pause et l'hote le sait`() {
        var lost = 0
        show(isActive = true, muted = false, onAudioFocusLost = { lost++ })
        val request = audioManager.lastAudioFocusRequest
        val listener = request.listener
            ?: request.audioFocusRequest.javaClass.getMethod("getOnAudioFocusChangeListener")
                .invoke(request.audioFocusRequest) as AudioManager.OnAudioFocusChangeListener
        listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS)
        shadowOf(Looper.getMainLooper()).idle()
        compose.waitForIdle()
        assertThat(lost).isEqualTo(1)
    }
}
