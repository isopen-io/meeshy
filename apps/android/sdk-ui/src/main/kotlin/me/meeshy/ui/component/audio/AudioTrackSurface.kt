package me.meeshy.ui.component.audio

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer

/**
 * SDK-pure headless audio track: an [ExoPlayer] instance with no visual surface,
 * playing [mediaUrl] while [isActive] is true. Mirrors
 * [me.meeshy.ui.component.video.ReelVideoSurface]'s lifecycle (player created
 * per URL, released on dispose) but for audio-only sources — background music,
 * voice narration, or any layered audio a caller composes on top of visual
 * content. Renders no UI; it is a pure side-effect atom. Opaque params only —
 * the caller decides which URL plays, when, and at what volume.
 */
@OptIn(UnstableApi::class)
@Composable
fun AudioTrackSurface(
    mediaUrl: String,
    isActive: Boolean,
    loop: Boolean = true,
    volume: Float = 1f,
    /**
     * Fenêtre de lecture DANS la source, en millisecondes (#5129) — `null` quand
     * la source joue en entier. Les deux ou aucune : l'appelant a déjà tranché
     * (`StorySourceWindow.clippingMs`), cette surface ne redécide rien.
     *
     * **Un vocal rogné compte autant qu'une vidéo rognée** : iOS écrit les deux
     * bornes sur les deux familles, et les servir pour la seule image laisserait
     * un son coupé jouer en entier.
     */
    sourceStartMs: Long? = null,
    sourceEndMs: Long? = null,
) {
    val context = LocalContext.current
    val player = remember(mediaUrl, sourceStartMs, sourceEndMs) {
        ExoPlayer.Builder(context).build().apply {
            // La fenêtre est portée par le MediaItem, jamais par un `seekTo`
            // suivi d'une surveillance : ExoPlayer coupe la source lui-même, la
            // position 0 EST le début de la fenêtre, et la boucle reboucle
            // dessus sans qu'aucun code n'observe la tête de lecture.
            setMediaItem(
                MediaItem.Builder()
                    .setUri(mediaUrl)
                    .apply {
                        if (sourceStartMs != null && sourceEndMs != null) {
                            setClippingConfiguration(
                                MediaItem.ClippingConfiguration.Builder()
                                    .setStartPositionMs(sourceStartMs)
                                    .setEndPositionMs(sourceEndMs)
                                    .build(),
                            )
                        }
                    }
                    .build(),
            )
            repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            this.volume = volume
            playWhenReady = false
            prepare()
        }
    }

    // Le volume suit la valeur courante a chaud, meme motif que ReelVideoSurface :
    // le player est memoize par URL donc la valeur du constructeur ne refleterait
    // jamais un changement ulterieur.
    LaunchedEffect(player, volume) {
        player.volume = volume
    }

    LaunchedEffect(player, isActive) {
        player.playWhenReady = isActive
        if (!isActive) player.seekTo(0)
    }

    DisposableEffect(player) {
        onDispose { player.release() }
    }
}
