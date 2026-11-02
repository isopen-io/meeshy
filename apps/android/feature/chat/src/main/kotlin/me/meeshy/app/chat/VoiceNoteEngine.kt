package me.meeshy.app.chat

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

/**
 * The platform player under [ChatAudioPlayer] and the message menu's [OverlayAudioPreview], reduced
 * to what a voice note needs. Audio focus is the caller's business, never the engine's.
 */
internal interface VoiceNoteEngine {
    val positionMs: Long
    val durationMs: Long

    fun listen(onPrepared: () -> Unit, onCompleted: () -> Unit, onError: () -> Unit)
    fun load(url: String)
    fun start()
    fun pause()
    fun seekTo(positionMs: Long)
    fun setSpeed(rate: Float)
    fun reset()
    fun release()
}

/**
 * Media3 rather than `MediaPlayer` (#13674): translated voice notes are Ogg Opus, and the platform
 * player only opens the Ogg container from Android 10 — below it, the note played in silence.
 * ExoPlayer ships its own Ogg extractor.
 */
internal class ExoVoiceNoteEngine(context: Context) : VoiceNoteEngine {

    private val player = ExoPlayer.Builder(context).build().apply {
        setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(),
            false,
        )
        setWakeMode(C.WAKE_MODE_NETWORK)
    }
    private var awaitingReady = false

    override val positionMs: Long get() = player.currentPosition.coerceAtLeast(0L)
    override val durationMs: Long get() = player.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0L) ?: 0L
    val speed: Float get() = player.playbackParameters.speed

    override fun listen(onPrepared: () -> Unit, onCompleted: () -> Unit, onError: () -> Unit) {
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when {
                    state == Player.STATE_READY && awaitingReady -> {
                        awaitingReady = false
                        onPrepared()
                    }
                    state == Player.STATE_ENDED -> onCompleted()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                awaitingReady = false
                onError()
            }
        })
    }

    override fun load(url: String) {
        awaitingReady = true
        player.playWhenReady = false
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
    }

    override fun start() {
        if (player.playbackState == Player.STATE_ENDED) player.seekTo(0L)
        player.play()
    }

    override fun pause() {
        player.pause()
    }

    override fun seekTo(positionMs: Long) {
        player.seekTo(positionMs)
    }

    override fun setSpeed(rate: Float) {
        player.setPlaybackSpeed(rate)
    }

    override fun reset() {
        awaitingReady = false
        player.stop()
        player.clearMediaItems()
    }

    override fun release() {
        player.release()
    }
}
