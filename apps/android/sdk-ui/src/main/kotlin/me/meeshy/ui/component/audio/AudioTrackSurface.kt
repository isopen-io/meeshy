package me.meeshy.ui.component.audio

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.exoplayer.ExoPlayer
import me.meeshy.sdk.model.media.AttachmentStatusBody
import me.meeshy.sdk.model.media.PlaybackReportSink
import me.meeshy.sdk.model.media.PlaybackStatusReport
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.MeeshyMediaCache

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
    /**
     * Pièce jointe dont on mesure l'écoute : avec elle, chaque plage continue lue est
     * rapportée à [reportSink] avec la raison de sa fin (pause, curseur, son coupé, fin,
     * écran quitté). `null` = aucune mesure (musique de fond, calques d'une scène).
     */
    attachmentId: String? = null,
    reportSink: PlaybackReportSink = PlaybackReportSink.Inert,
    reportAction: String = AttachmentStatusBody.ACTION_LISTENED,
    reportLanguage: String? = null,
) {
    val context = LocalContext.current
    val mediaCache = remember(context) { MeeshyMediaCache.get(context) }
    val player = remember(mediaUrl, sourceStartMs, sourceEndMs) {
        // Lecture par le cache disque (clé canonique) : un média déjà vu se rouvre sans réseau.
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaCache.mediaSourceFactory(MediaCacheCategory.AUDIO, mediaUrl))
            .build().apply {
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

    // Bail de lecture : la ressource jouée est à l'abri de l'éviction LRU tant que le player vit.
    DisposableEffect(player) {
        val releaseLease = mediaCache.lease(mediaUrl)
        onDispose {
            releaseLease()
            player.release()
        }
    }

    // Déclaré APRÈS la libération : Compose dispose en ordre inverse, la plage ouverte est donc
    // close avant que le lecteur soit relâché.
    val sink by rememberUpdatedState(reportSink)
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(player, attachmentId, lifecycleOwner) {
        val id = attachmentId
        val stretchListener = id?.let { attachment ->
            PlaybackStretchListener(player) { stretches, positionMs, durationMs ->
                PlaybackStatusReport.build(reportAction, stretches, positionMs, durationMs, reportLanguage)
                    ?.let { body -> sink.report(attachment, body) }
            }
        }
        val lifecycleObserver = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) stretchListener?.dismiss()
        }
        stretchListener?.let(player::addListener)
        lifecycleOwner.lifecycle.addObserver(lifecycleObserver)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(lifecycleObserver)
            stretchListener?.dismiss()
            stretchListener?.let(player::removeListener)
        }
    }
}
