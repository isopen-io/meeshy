package me.meeshy.app.chat

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import me.meeshy.sdk.model.playback.MediaSessionEvent

/**
 * Le focus audio du lecteur de vocaux : un vocal qui joue le prend, un appel ou la musique d'une
 * autre application le lui reprend, et chaque changement est traduit en [MediaSessionEvent] — la
 * décision (pause, reprise, rien) appartient à `InterruptionResumeLedger`, pas à cette glue.
 */
internal class ChatAudioFocus(
    private val audioManager: AudioManager,
    private val onEvent: (MediaSessionEvent) -> Unit,
) {
    private val request: AudioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener { change -> events(change).forEach(onEvent) }
        .build()

    private var held = false

    /** `false` quand le système refuse (un appel en cours) : le vocal ne démarre pas. */
    fun acquire(): Boolean {
        if (held) return true
        held = audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return held
    }

    fun abandon() {
        if (!held) return
        held = false
        audioManager.abandonAudioFocusRequest(request)
    }

    /** Une perte définitive n'est jamais reprise d'office : interruption puis fin « sans reprise ». */
    internal companion object {
        fun events(change: Int): List<MediaSessionEvent> = when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> listOf(MediaSessionEvent.InterruptionEndedShouldResume)
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
            -> listOf(MediaSessionEvent.InterruptionBegan)
            AudioManager.AUDIOFOCUS_LOSS -> listOf(
                MediaSessionEvent.InterruptionBegan,
                MediaSessionEvent.InterruptionEndedShouldNotResume,
            )
            else -> emptyList()
        }
    }
}
