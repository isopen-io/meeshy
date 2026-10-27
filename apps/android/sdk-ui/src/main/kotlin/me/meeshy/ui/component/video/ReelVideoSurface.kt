package me.meeshy.ui.component.video

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.MeeshyMediaCache
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/** Une vidéo qui parle est un média : même usage que le vocal du fil, contenu « film ». */
private val VIDEO_AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
    .setUsage(C.USAGE_MEDIA)
    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
    .build()

/**
 * SDK-pure vertical-reel video surface: an [ExoPlayer]-backed [PlayerView] that plays
 * [mediaUrl] looping and (by default) muted, cropped to fill the surface. It plays only
 * while [isActive] is true — the caller (the reels pager) sets exactly one page active
 * so the others stay paused and rewound. Opaque params only; the atom owns just the
 * player lifecycle (created for the current [mediaUrl], released on dispose).
 *
 * **Une seule lecture à la fois (#13399).** Une surface AUDIBLE qui joue prend le focus audio : un vocal du fil le
 * perd donc et se met en pause, comme la session audio unique d'iOS ; à l'inverse, un vocal qui démarre le lui
 * reprend, la vidéo se met en pause et [onAudioFocusLost] en prévient l'hôte (la minuterie d'une story se fige).
 * Une perte PASSAGÈRE (appel qui sonne) prévient l'hôte de la même façon : il fige la lecture, qui ne repart qu'au
 * toucher suivant.
 * Une surface MUETTE, ou préchargée en pause, ne touche jamais au focus.
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
    /**
     * `false` : le média se joue sans surface d'image (une piste audio) — un `PlayerView`
     * sans vidéo n'est qu'un rectangle noir posé sur le fond que l'appelant dessine.
     */
    showsPicture: Boolean = true,
    /**
     * `false` : aucun lecteur n'est créé (le décodeur n'est pas payé pour une page que personne
     * ne regarde). `true` sur la page affichée ET sur la suivante, que le lecteur prépare en
     * pause pour que son premier plan soit déjà là au passage — et sur elles seules.
     */
    loads: Boolean = true,
    /** L'utilisateur a mis ce réel en pause (toucher) : il ne joue pas, même actif, et garde sa position. */
    paused: Boolean = false,
    /** Le lecteur vivant de cette surface (ou `null` à sa libération) : la barre de lecture y lit et y cherche. */
    onPlayer: (ReelPlayerHandle?) -> Unit = {},
    /** `true` : le média tient en entier dans la surface (iOS `resizeAspect`) au lieu de la remplir en rognant. */
    fit: Boolean = false,
    /** Un autre son (un vocal, un appel) a pris le focus : la vidéo vient de se mettre en pause d'elle-même. */
    onAudioFocusLost: () -> Unit = {},
) {
    val context = LocalContext.current
    val mediaCache = remember(context) { MeeshyMediaCache.get(context) }
    val player = remember(mediaUrl, sourceStartMs, sourceEndMs, loads) {
        if (!loads) return@remember null
        // Lecture par le cache disque (clé canonique) : un média déjà vu se rouvre sans réseau.
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaCache.mediaSourceFactory(MediaCacheCategory.VIDEO, mediaUrl))
            .build().apply {
            setAudioAttributes(VIDEO_AUDIO_ATTRIBUTES, !muted)
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
        player?.volume = if (muted) 0f else 1f
        // Le focus suit le son : audible, la lecture le prend ; muet, elle le rend et ne le redemande pas.
        player?.setAudioAttributes(VIDEO_AUDIO_ATTRIBUTES, !muted)
    }

    // Hors premier plan (ON_STOP : touche Accueil, autre app), la lecture se suspend et
    // reprend au retour, sans rembobiner : sans cela le réel visible jouait — audible si
    // le son était réactivé — derrière une autre application.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val isForeground = lifecycleState.isAtLeast(Lifecycle.State.STARTED)
    LaunchedEffect(player, isActive, isForeground, paused) {
        val current = player ?: return@LaunchedEffect
        val command = ReelPlaybackGate.command(isActive, isForeground, rewindWhenInactive)
        current.playWhenReady = command.playWhenReady && !paused
        if (command.rewind) current.seekTo(0)
    }

    // Bail de lecture : la ressource jouée est à l'abri de l'éviction LRU tant que le player vit.
    val currentOnPlayer by rememberUpdatedState(onPlayer)
    val currentOnAudioFocusLost by rememberUpdatedState(onAudioFocusLost)
    DisposableEffect(player) {
        val live = player ?: return@DisposableEffect onDispose { }
        val releaseLease = mediaCache.lease(mediaUrl)
        currentOnPlayer(ReelPlayerHandle(live))
        val focusListener = object : Player.Listener {
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (!playWhenReady && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS) {
                    currentOnAudioFocusLost()
                }
            }

            // Perte PASSAGÈRE (un appel qui sonne, une alarme) : ExoPlayer se tait sans toucher à playWhenReady et
            // reprendrait seul au retour du focus, pendant que la minuterie de la story aurait continué. L'hôte
            // fige donc la lecture comme pour une perte définitive : rien ne repart au milieu d'un appel.
            override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
                if (playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS) {
                    currentOnAudioFocusLost()
                }
            }
        }
        live.addListener(focusListener)
        onDispose {
            live.removeListener(focusListener)
            currentOnPlayer(null)
            releaseLease()
            live.release()
        }
    }

    if (!showsPicture || player == null) return

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PlayerView(ctx).apply {
                useController = false
                // Sans obturateur noir : le poster posé derrière reste visible jusqu'à la première image.
                setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
            }
        },
        update = { view ->
            view.resizeMode = if (fit) AspectRatioFrameLayout.RESIZE_MODE_FIT else AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            view.player = player
        },
        onRelease = { view -> view.player = null },
    )
}
