package me.meeshy.app.calls

import android.content.Context
import android.media.AudioManager
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class CallAudioFocusControllerTest {
    private val changes = mutableListOf<Boolean>()

    private fun controller(): CallAudioFocusController {
        val manager = RuntimeEnvironment.getApplication().getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return CallAudioFocusController(manager) { changes += it }
    }

    @Test
    fun `le focus est accordé puis rendu`() {
        val c = controller()
        assertThat(c.request()).isTrue()
        c.abandon()
    }

    @Test
    fun `une perte suspend et un regain reprend`() {
        val c = controller()
        c.onFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
        c.onFocusChange(AudioManager.AUDIOFOCUS_GAIN)
        assertThat(changes).containsExactly(false, true).inOrder()
    }

    @Test
    fun `baisser le volume ne coupe pas l'appel`() {
        controller().onFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)
        assertThat(changes).isEmpty()
    }
}
