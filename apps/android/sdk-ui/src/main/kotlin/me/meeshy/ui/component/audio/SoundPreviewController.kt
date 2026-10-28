package me.meeshy.ui.component.audio

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.SoundPreviewCommand
import me.meeshy.sdk.model.composer.sound.SoundPreviewLaw
import me.meeshy.sdk.model.composer.sound.SoundPreviewState
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.MeeshyMediaCache

/**
 * L'aperçu d'un son de l'étagère — un seul à la fois ([SoundPreviewLaw]). Le lecteur n'existe QUE pendant l'écoute :
 * il est créé au premier toucher, relâché dès l'arrêt, la fin, l'échec, la mise en arrière-plan ou la sortie de la
 * feuille (aucune fuite d'ExoPlayer). Il demande le FOCUS AUDIO : un vocal de conversation ou la musique d'une autre
 * application se met en pause tant que l'aperçu joue — c'est ainsi qu'il se coordonne avec la session de lecture
 * vocale sans la connaître. Les fichiers passent par le cache disque de l'application : marteler lecture/arrêt ne
 * coûte jamais un second passage réseau.
 */
@Stable
@OptIn(UnstableApi::class)
class SoundPreviewController internal constructor(private val context: android.content.Context) {
    var state: SoundPreviewState by mutableStateOf(SoundPreviewState.Idle)
        private set

    private var player: ExoPlayer? = null

    /** [url] est l'adresse CHARGEABLE du son (`resolveMediaUrl`) : la passerelle sert un chemin relatif. */
    fun toggle(sound: ApiSound, url: String) {
        val outcome = SoundPreviewLaw.toggle(state, sound.id, instant = false)
        state = outcome.state
        when (val command = outcome.command) {
            is SoundPreviewCommand.Start -> start(url, command.id)
            SoundPreviewCommand.Stop -> releasePlayer()
            SoundPreviewCommand.None -> Unit
        }
    }

    /** Le son vient d'être retiré de la bibliothèque : s'il jouait, il s'arrête. */
    fun onRemoved(id: String) {
        val outcome = SoundPreviewLaw.removing(state, id)
        state = outcome.state
        if (outcome.command == SoundPreviewCommand.Stop) releasePlayer()
    }

    fun stop() {
        state = SoundPreviewState.Idle
        releasePlayer()
    }

    private fun start(url: String, id: String) {
        releasePlayer()
        val cache = MeeshyMediaCache.get(context)
        player = ExoPlayer.Builder(context)
            .setMediaSourceFactory(cache.mediaSourceFactory(MediaCacheCategory.AUDIO, url))
            .build().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(C.USAGE_MEDIA)
                        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                        .build(),
                    true,
                )
                addListener(
                    object : Player.Listener {
                        override fun onPlaybackStateChanged(playbackState: Int) {
                            when (playbackState) {
                                Player.STATE_READY -> state = SoundPreviewLaw.ready(state, id)
                                Player.STATE_ENDED -> end(id)
                            }
                        }

                        override fun onPlayerError(error: PlaybackException) = end(id)
                    },
                )
                setMediaItem(MediaItem.fromUri(url))
                playWhenReady = true
                prepare()
            }
    }

    /** Fin naturelle ou échec : la ligne repasse en « lecture » toute seule, et le lecteur est rendu. */
    private fun end(id: String) {
        state = SoundPreviewLaw.finished(state, id)
        releasePlayer()
    }

    private fun releasePlayer() {
        player?.release()
        player = null
    }

    internal fun release() = stop()
}

/** Le contrôleur d'aperçu d'une feuille : libéré en la quittant et dès que l'application passe en arrière-plan. */
@Composable
fun rememberSoundPreviewController(): SoundPreviewController {
    val context = LocalContext.current
    val controller = remember(context) { SoundPreviewController(context.applicationContext) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(controller, lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) controller.stop() }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            controller.release()
        }
    }
    return controller
}
