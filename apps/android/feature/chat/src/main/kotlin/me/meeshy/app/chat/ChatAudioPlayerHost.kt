package me.meeshy.app.chat

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleAudioPlayback

/**
 * The screen-scoped voice-note player of the thread: ONE [MediaPlayer] for every bubble,
 * released when the thread leaves composition. It mirrors the pure [ChatAudioPlayback] onto
 * the platform player and back — coverage-exempt glue, like [OverlayMediaPreview].
 */
@Stable
internal class ChatAudioPlayer internal constructor(private val player: MediaPlayer) {

    var playback: ChatAudioPlayback by mutableStateOf(ChatAudioPlayback.Idle)
        private set

    init {
        player.setOnPreparedListener { onPrepared() }
        player.setOnCompletionListener { onCompleted() }
        player.setOnErrorListener { _, _, _ ->
            onError()
            true
        }
    }

    /** Touch on a bubble's voice note: load it, pause it, resume it, or switch to it. */
    fun toggle(audio: BubbleAudio) {
        val next = playback.toggle(audio)
        val prev = playback
        val url = next.transport.currentUrl
        when {
            next.transport.isLoading && url != null &&
                (url != prev.transport.currentUrl || next.attachmentId != prev.attachmentId) ->
                runCatching {
                    player.reset()
                    player.setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build(),
                    )
                    player.setDataSource(url)
                    player.prepareAsync()
                }.onFailure { playback = next.failed(); return }
            next.transport.isPlaying && !prev.transport.isPlaying -> runCatching { player.start() }
            !next.transport.isPlaying && prev.transport.isPlaying -> runCatching { player.pause() }
        }
        playback = next
    }

    /** What the bubble owning [audio] shows, or `null` when another voice note is loaded. */
    fun bubbleFor(audio: BubbleAudio): BubbleAudioPlayback? =
        playback.bubbleFor(audio.attachmentId, audio.durationSeconds)

    internal fun onPrepared() {
        runCatching { player.start() }
        playback = playback.ready()
    }

    internal fun onCompleted() {
        playback = playback.ended()
    }

    internal fun onError() {
        playback = playback.failed()
    }

    internal fun tick() {
        val duration = runCatching { player.duration }.getOrDefault(0)
        val position = runCatching { player.currentPosition }.getOrDefault(0)
        if (duration > 0) playback = playback.tick(position / 1000.0, duration / 1000.0)
    }

    internal fun release() {
        runCatching { player.release() }
    }
}

@Composable
internal fun rememberChatAudioPlayer(): ChatAudioPlayer {
    val audioPlayer = remember { ChatAudioPlayer(MediaPlayer()) }
    DisposableEffect(audioPlayer) {
        onDispose { audioPlayer.release() }
    }
    val isPlaying = audioPlayer.playback.transport.isPlaying
    LaunchedEffect(isPlaying) {
        while (isPlaying) {
            audioPlayer.tick()
            delay(TICK_MILLIS)
        }
    }
    return audioPlayer
}

private const val TICK_MILLIS = 200L
