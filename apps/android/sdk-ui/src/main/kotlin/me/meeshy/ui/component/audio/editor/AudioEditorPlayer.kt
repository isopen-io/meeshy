package me.meeshy.ui.component.audio.editor

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import me.meeshy.sdk.model.audioedit.AudioEditorPlaybackLaw

/**
 * Le lecteur d'aperçu de l'éditeur audio — miroir du lecteur de `MeeshyAudioEditorView` (iOS) : il ne joue que
 * la version ACTIVE, boucle la tranche en rognant, applique la vitesse armée sans changer la hauteur et demande
 * le FOCUS AUDIO (un vocal ou la musique d'une autre application se met en pause tant qu'il joue). Le lecteur est
 * libéré en quittant l'écran et dès que l'application passe en arrière-plan.
 *
 * [position] se lit dans la phase de DESSIN (lambda) : elle change à chaque image sans recomposer l'écran.
 */
@Stable
class AudioEditorPlayer internal constructor(private val context: Context) {
    var isPlaying: Boolean by mutableStateOf(false)
        private set

    /** Secondes depuis le début de la version active. */
    private val positionState = mutableDoubleStateOf(0.0)
    val position: Double get() = positionState.doubleValue

    private var player: ExoPlayer? = null
    private var loadedPath: String? = null

    /** Charge [file] (sans effet si c'est déjà le fichier chargé) ; la position repart de zéro. */
    fun load(file: File) {
        if (loadedPath == file.absolutePath) return
        release()
        loadedPath = file.absolutePath
        positionState.doubleValue = 0.0
        player = ExoPlayer.Builder(context).build().apply {
            setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            addListener(
                object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_ENDED) rewind()
                    }

                    override fun onIsPlayingChanged(playing: Boolean) {
                        this@AudioEditorPlayer.isPlaying = playing
                    }
                },
            )
            setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))
            prepare()
        }
    }

    /** Joue (depuis le début de la tranche si l'on en est hors) ou met en pause. */
    fun toggle(region: ClosedFloatingPointRange<Double>?, rate: Float) {
        val exo = player ?: return
        if (exo.isPlaying) {
            exo.pause()
            return
        }
        seek(AudioEditorPlaybackLaw.startPosition(position, region))
        setRate(rate)
        exo.play()
    }

    fun seek(seconds: Double) {
        positionState.doubleValue = seconds
        player?.seekTo((seconds * MILLIS).toLong())
    }

    fun setRate(rate: Float) {
        player?.playbackParameters = PlaybackParameters(rate, 1f)
    }

    fun pause() {
        player?.pause()
    }

    /** Une image de lecture : relit la position et fait rebondir la boucle de rognage. */
    internal fun sync(region: ClosedFloatingPointRange<Double>?) {
        val exo = player ?: return
        val now = exo.currentPosition / MILLIS
        positionState.doubleValue = now
        if (exo.isPlaying && AudioEditorPlaybackLaw.shouldLoop(now, region)) seek(region!!.start)
    }

    private fun rewind() {
        player?.seekTo(0)
        player?.pause()
        positionState.doubleValue = 0.0
    }

    fun release() {
        player?.release()
        player = null
        loadedPath = null
        isPlaying = false
    }

    private companion object {
        const val MILLIS = 1000.0
    }
}

/**
 * Le lecteur d'un écran d'édition : libéré à la sortie et en arrière-plan ; tant qu'il joue, la position est
 * relue à CHAQUE image (60 i/s), jamais par une minuterie.
 */
@Composable
fun rememberAudioEditorPlayer(region: () -> ClosedFloatingPointRange<Double>?): AudioEditorPlayer {
    val context = LocalContext.current
    val player = remember(context) { AudioEditorPlayer(context.applicationContext) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(player, lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) player.pause() }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            player.release()
        }
    }
    val currentRegion by rememberUpdatedState(region)
    LaunchedEffect(player, player.isPlaying) {
        while (player.isPlaying) {
            withFrameNanos { player.sync(currentRegion()) }
        }
    }
    return player
}
