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
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAudioManager
import java.net.InetAddress
import java.net.ServerSocket
import java.time.Duration

/**
 * #13399 — une seule lecture à la fois : une vidéo AUDIBLE prend le focus audio (un vocal du fil le perd donc et se met
 * en pause, et inversement), une vidéo muette ou préchargée n'y touche jamais.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelVideoSurfaceAudioFocusTest {

    @get:Rule
    val compose = createComposeRule()

    // Une origine qui accepte la connexion et ne répond JAMAIS : le lecteur reste en BUFFERING. Sur un fichier absent, il
    // tombait en IDLE avant que playWhenReady n'arrive au fil de lecture, et Media3 1.10 ne demandait alors aucun focus.
    private val stalledOrigin = ServerSocket(0, 8, InetAddress.getLoopbackAddress())
    private val clipUrl get() = "http://${stalledOrigin.inetAddress.hostAddress}:${stalledOrigin.localPort}/clip.mp4"

    @After
    fun closeOrigin() = stalledOrigin.close()

    private val audioManager get() =
        shadowOf(ApplicationProvider.getApplicationContext<Context>().getSystemService(Context.AUDIO_SERVICE) as AudioManager)

    // Media3 1.10 tient le focus audio sur le fil de LECTURE (ExoPlayerImplInternal) : la perte y transite avant de revenir
    // à l'écouteur du fil principal. On fait tourner la boucle principale jusqu'à ce retour, comme runMainLooperUntil de Media3.
    // La recomposition (donc l'effet qui suit `muted`) n'avance que par l'horloge du test : sans `waitForIdle` DANS la boucle,
    // un changement d'état posé par le test n'atteignait jamais le lecteur et la condition attendue ne venait jamais.
    private fun idleUntil(condition: () -> Boolean) {
        val deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos()
        while (!condition() && System.nanoTime() < deadline) {
            compose.waitForIdle()
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(10))
            Thread.sleep(1)
        }
        compose.waitForIdle()
    }

    // La demande de focus part, elle aussi, du fil de lecture : on l'attend avant de la lire.
    private fun takenFocus(): ShadowAudioManager.AudioFocusRequest {
        idleUntil { audioManager.lastAudioFocusRequest != null }
        return checkNotNull(audioManager.lastAudioFocusRequest) { "aucune demande de focus audio" }
    }

    private fun show(isActive: Boolean, muted: Boolean, onAudioFocusLost: () -> Unit = {}) {
        compose.setContent {
            ReelVideoSurface(
                mediaUrl = clipUrl,
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
        assertThat(takenFocus()).isNotNull()
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
    fun `une video audible dont la scene confie le focus a une autre joue sans le prendre`() {
        compose.setContent { ReelVideoSurface(mediaUrl = clipUrl, isActive = true, muted = false, holdsAudioFocus = false) }
        idleUntil { audioManager.lastAudioFocusRequest != null }
        assertThat(audioManager.lastAudioFocusRequest).isNull()
    }

    @Test
    fun `couper le son rend le focus`() {
        var muted by mutableStateOf(false)
        compose.setContent { ReelVideoSurface(mediaUrl = clipUrl, isActive = true, muted = muted) }
        compose.waitForIdle()
        assertThat(takenFocus()).isNotNull()
        muted = true
        idleUntil { audioManager.lastAbandonedAudioFocusRequest != null }
        assertThat(audioManager.lastAbandonedAudioFocusRequest).isNotNull()
    }

    @Test
    fun `un vocal qui prend le focus met la video en pause et l'hote le sait`() {
        var lost = 0
        show(isActive = true, muted = false, onAudioFocusLost = { lost++ })
        val request = takenFocus()
        val listener = request.listener
            ?: request.audioFocusRequest.javaClass.getMethod("getOnAudioFocusChangeListener")
                .invoke(request.audioFocusRequest) as AudioManager.OnAudioFocusChangeListener
        listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS)
        idleUntil { lost > 0 }
        assertThat(lost).isEqualTo(1)
    }

    @Test
    fun `un appel qui sonne (perte passagere) fige aussi la lecture chez l'hote`() {
        var lost = 0
        show(isActive = true, muted = false, onAudioFocusLost = { lost++ })
        val request = takenFocus()
        val listener = request.listener
            ?: request.audioFocusRequest.javaClass.getMethod("getOnAudioFocusChangeListener")
                .invoke(request.audioFocusRequest) as AudioManager.OnAudioFocusChangeListener
        listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
        idleUntil { lost > 0 }
        assertThat(lost).isEqualTo(1)
    }
}
