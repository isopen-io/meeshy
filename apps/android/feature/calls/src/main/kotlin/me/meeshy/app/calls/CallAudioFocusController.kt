package me.meeshy.app.calls

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager

/**
 * Le focus audio de l'appel : un appel GSM, une alarme ou l'assistant le prennent
 * ([AudioManager.AUDIOFOCUS_LOSS] / `LOSS_TRANSIENT`) puis le rendent (`GAIN`). [onFocusChanged]
 * reçoit `false` à la perte et `true` au regain, pour suspendre puis reprendre l'audio WebRTC.
 * Un simple « baisse le volume » (`CAN_DUCK`) ne coupe rien : la voix d'un appel ne se baisse pas.
 */
internal class CallAudioFocusController(
    private val audioManager: AudioManager,
    private val onFocusChanged: (hasFocus: Boolean) -> Unit,
) {
    private var request: AudioFocusRequest? = null

    /** Rend vrai si le focus est accordé. Idempotent. */
    fun request(): Boolean {
        if (request != null) return true
        val built = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setOnAudioFocusChangeListener(::onFocusChange)
            .build()
        val granted = audioManager.requestAudioFocus(built) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (granted) request = built
        return granted
    }

    fun abandon() {
        val held = request ?: return
        request = null
        audioManager.abandonAudioFocusRequest(held)
    }

    internal fun onFocusChange(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            -> onFocusChanged(false)
            AudioManager.AUDIOFOCUS_GAIN -> onFocusChanged(true)
        }
    }
}
