package me.meeshy.ui.component.video

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.MeeshyMediaCache
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/**
 * SDK-pure vertical-reel video surface: an [ExoPlayer]-backed [PlayerView] that plays
 * [mediaUrl] looping and (by default) muted, cropped to fill the surface. It plays only
 * while [isActive] is true — the caller (the reels pager) sets exactly one page active
 * so the others stay paused and rewound. Opaque params only; the atom owns just the
 * player lifecycle (created for the current [mediaUrl], released on dispose).
 */
@OptIn(UnstableApi::class)
@Composable
fun ReelVideoSurface(
    mediaUrl: String,
    isActive: Boolean,
    /**
     * `false` : l'inactivité est une PAUSE qui garde la position (story retenue, app en
     * arrière-plan) ; `true` (défaut) : rembobine, comme une page de réel quittée.
     */
    rewindWhenInactive: Boolean = true,
    modifier: Modifier = Modifier,
    muted: Boolean = true,
    /**
     * Fenêtre de lecture DANS la source, en millisecondes (#5129) — `null` quand
     * la source joue en entier. Les deux ou aucune : l'appelant a déjà tranché
     * (`StorySourceWindow.clippingMs`), cette surface ne redécide rien.
     *
     * Opaques à dessein : elle n'a pas à savoir ce qu'est une borne de source,
     * ni d'où elle vient. Un réel, qui joue toujours sa vidéo entière, ne passe
     * rien et rien ne change pour lui.
     */
    sourceStartMs: Long? = null,
    sourceEndMs: Long? = null,
) {
    val context = LocalContext.current
    val mediaCache = remember(context) { MeeshyMediaCache.get(context) }
    val player = remember(mediaUrl, sourceStartMs, sourceEndMs) {
        // Lecture par le cache disque (clé canonique) : un média déjà vu se rouvre sans réseau.
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaCache.mediaSourceFactory(MediaCacheCategory.VIDEO, mediaUrl))
            .build().apply {
            // **La fenêtre est portée par le MediaItem, jamais par un `seekTo`
            // suivi d'une surveillance.** ExoPlayer coupe alors la source
            // lui-même : la position 0 du player EST le début de la fenêtre, la
            // boucle reboucle sur elle, et aucun code n'a à observer la tête de
            // lecture pour arrêter à temps.
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
            repeatMode = Player.REPEAT_MODE_ONE
            volume = if (muted) 0f else 1f
            playWhenReady = false
            prepare()
        }
    }

    // Le volume suit [muted] a chaud : le player est memoize par URL, donc la
    // valeur passee au constructeur ne refleterait jamais un toggle ulterieur.
    LaunchedEffect(player, muted) {
        player.volume = if (muted) 0f else 1f
    }

    // Hors premier plan (ON_STOP : touche Accueil, autre app), la lecture se suspend et
    // reprend au retour, sans rembobiner : sans cela le réel visible jouait — audible si
    // le son était réactivé — derrière une autre application.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val isForeground = lifecycleState.isAtLeast(Lifecycle.State.STARTED)
    LaunchedEffect(player, isActive, isForeground) {
        val command = ReelPlaybackGate.command(isActive, isForeground, rewindWhenInactive)
        player.playWhenReady = command.playWhenReady
        if (command.rewind) player.seekTo(0)
    }

    // Bail de lecture : la ressource jouée est à l'abri de l'éviction LRU tant que le player vit.
    DisposableEffect(player) {
        val releaseLease = mediaCache.lease(mediaUrl)
        onDispose {
            releaseLease()
            player.release()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PlayerView(ctx).apply {
                useController = false
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            }
        },
        update = { view -> view.player = player },
        onRelease = { view -> view.player = null },
    )
}
