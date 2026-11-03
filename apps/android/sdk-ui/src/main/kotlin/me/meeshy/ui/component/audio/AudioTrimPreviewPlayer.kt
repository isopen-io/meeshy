package me.meeshy.ui.component.audio

import android.content.Context
import android.net.Uri
import android.view.Choreographer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.audioedit.AudioTrimPlaybackStep

/** Le lecteur matériel derrière l'aperçu : une couture qui garde Media3 hors de la loi (et la rend testable). */
internal interface TrimClipPort {
    /** Prépare [uri] limité à `[startMs, endMs]` (ClippingConfiguration) ; les positions sont relatives au segment. */
    fun load(uri: String, startMs: Long, endMs: Long)
    fun play()
    fun pause()
    fun seekToSegmentStart()
    val segmentPositionMs: Long
    val isPlaying: Boolean
    fun release()
}

/** L'horloge d'affichage : un battement par image, sur le fil principal. */
internal interface TrimFrameClock {
    fun start(onFrame: () -> Unit)
    fun stop()
}

/**
 * **La lecture d'un SEGMENT, pour le rognage** — miroir d'`AudioTrimPreviewPlayer` (iOS).
 *
 * - elle lit le segment par une `ClippingConfiguration`, et la borne HAUTE est en plus tenue par
 *   l'horloge d'affichage (la seule qui observe déjà la position : pas de minuteur concurrent) ;
 * - elle reprend TOUJOURS au début du segment (relâchement d'une poignée, fin naturelle) ;
 * - elle ne tient AUCUNE session audio : pas de prise de focus, pas de MediaSession — l'hôte gère déjà la sienne.
 */
public class AudioTrimPreviewPlayer internal constructor(
    private val port: TrimClipPort,
    private val clock: TrimFrameClock,
) {
    private val _playhead = MutableStateFlow(0.0)
    private val _isPlaying = MutableStateFlow(false)
    private var uri: String? = null
    private var lower = 0.0
    private var upper = Double.POSITIVE_INFINITY

    /** La tête de lecture, en secondes depuis le début du FICHIER. */
    public val playhead: StateFlow<Double> = _playhead.asStateFlow()
    public val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    /** Fixe la source (sans la jouer). */
    public fun load(uri: String) {
        stop()
        this.uri = uri
        _playhead.value = 0.0
    }

    /** Joue `[from, to]`, toujours DEPUIS [from]. */
    public fun play(from: Double, to: Double) {
        val source = uri ?: return
        lower = maxOf(0.0, from)
        upper = to
        if (upper <= lower) return
        port.load(source, (lower * 1000).toLong(), (upper * 1000).toLong())
        port.play()
        _playhead.value = lower
        _isPlaying.value = true
        clock.start(::onFrame)
    }

    /** Suspend sans oublier les bornes : le déplacement d'une poignée passe par ici. */
    public fun pause() {
        port.pause()
        if (_isPlaying.value) _isPlaying.value = false
        clock.stop()
    }

    public fun stop(): Unit = pause()

    /** Pose la tête de lecture sans jouer (le défilement au doigt). */
    public fun seek(time: Double) {
        _playhead.value = maxOf(0.0, time)
    }

    public fun release() {
        stop()
        port.release()
    }

    internal fun onFrame() {
        if (!_isPlaying.value) return
        val position = lower + port.segmentPositionMs / 1000.0
        when (val step = AudioTrimPlaybackStep.next(position, port.isPlaying, lower, upper)) {
            is AudioTrimPlaybackStep.Playing -> _playhead.value = step.at
            is AudioTrimPlaybackStep.Finished -> {
                port.pause()
                port.seekToSegmentStart()
                _playhead.value = step.restingAt
                _isPlaying.value = false
                clock.stop()
            }
        }
    }
}

private class ExoTrimPort(private val context: Context) : TrimClipPort {
    private var player: ExoPlayer? = null

    private fun ensure(): ExoPlayer = player ?: ExoPlayer.Builder(context).build().also {
        // handleAudioFocus = false : aucune session audio tenue ici.
        it.setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
            false,
        )
        it.repeatMode = Player.REPEAT_MODE_OFF
        player = it
    }

    override fun load(uri: String, startMs: Long, endMs: Long) {
        val item = MediaItem.Builder()
            .setUri(Uri.parse(uri))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(startMs)
                    .setEndPositionMs(endMs)
                    .build(),
            )
            .build()
        ensure().apply {
            setMediaItem(item)
            prepare()
        }
    }

    override fun play() { player?.play() }
    override fun pause() { player?.pause() }
    override fun seekToSegmentStart() { player?.seekTo(0) }
    override val segmentPositionMs: Long get() = player?.currentPosition ?: 0L
    override val isPlaying: Boolean
        get() = player?.let { it.playWhenReady && it.playbackState != Player.STATE_ENDED } ?: false

    override fun release() {
        player?.release()
        player = null
    }
}

private class ChoreographerTrimClock : TrimFrameClock {
    private var callback: Choreographer.FrameCallback? = null

    override fun start(onFrame: () -> Unit) {
        stop()
        val c = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (callback !== this) return
                onFrame()
                if (callback === this) Choreographer.getInstance().postFrameCallback(this)
            }
        }
        callback = c
        Choreographer.getInstance().postFrameCallback(c)
    }

    override fun stop() {
        callback?.let { Choreographer.getInstance().removeFrameCallback(it) }
        callback = null
    }
}

/** Le lecteur d'aperçu d'un rogneur : libéré en quittant la composition. */
@Composable
public fun rememberAudioTrimPreviewPlayer(): AudioTrimPreviewPlayer {
    val context = LocalContext.current.applicationContext
    val player = remember(context) { AudioTrimPreviewPlayer(ExoTrimPort(context), ChoreographerTrimClock()) }
    DisposableEffect(player) { onDispose { player.release() } }
    return player
}
