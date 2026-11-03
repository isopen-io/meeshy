package me.meeshy.ui.component.video

import android.view.LayoutInflater
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
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.R
import me.meeshy.ui.component.media.ComposerLiveEffects
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
    /** Le focus est revenu après une perte PASSAGÈRE (fin d'un appel, d'une alarme) : la vidéo reprend d'elle-même. */
    onAudioFocusGained: () -> Unit = {},
    /** La perte est DÉFINITIVE (un autre lecteur a pris le focus pour de bon) : aucun gain ne suivra. */
    onAudioFocusLostForGood: () -> Unit = {},
    /**
     * `false` : le média ne passe PAS par le cache disque (un contenu protégé — flamme, vue unique — ne laisse
     * aucune copie durable sur l'appareil). Le défaut garde le comportement des réels et des stories.
     */
    cached: Boolean = true,
    /**
     * `false` : la surface joue son son SANS demander le focus audio — la scène l'a confié à une autre de ses vidéos
     * (#14611). Deux surfaces audibles d'une même scène se le disputeraient : la seconde le prendrait, la première se
     * mettrait en pause et l'hôte figerait la lecture.
     */
    holdsAudioFocus: Boolean = true,
    /**
     * `true` : l'image passe par une `TextureView` (#14624). Elle se compose dans la hiérarchie — au-dessus d'une autre
     * vidéo, sous la rotation, le découpage et l'opacité de l'objet qui la porte. Une vidéo POSÉE sur une scène à fond
     * vidéo en a besoin : deux `SurfaceView` superposées n'ont aucun ordre garanti. Le défaut garde la `SurfaceView` des
     * réels.
     */
    textured: Boolean = false,
    /** Le gain d'auteur (0..1 ; ExoPlayer n'amplifie pas) — sans effet quand [muted]. */
    volume: Float = 1f,
    /**
     * Le look d'une vidéo réglée du compositeur, que son aperçu peint par le GPU (#14848) : les mêmes effets que la scène
     * ([me.meeshy.ui.component.retouch.rememberStoryVideoLookEffects]). `null` (une publication, déjà cuite) n'ouvre aucun
     * pipeline d'effets.
     */
    effects: ComposerLiveEffects? = null,
    /** Le premier plan est lu : l'hôte retire son poster sans que la page se recompose pour autant. */
    onFirstFrame: () -> Unit = {},
    /** Le média est arrivé au bout (sans boucle, ou fenêtre de source épuisée) : l'hôte enchaîne. */
    onPlaybackEnded: () -> Unit = {},
) {
    val context = LocalContext.current
    val mediaCache = remember(context) { MeeshyMediaCache.get(context) }
    val painted = effects != null
    val player = remember(mediaUrl, sourceStartMs, sourceEndMs, loads, cached, painted) {
        if (!loads) return@remember null
        // Un composable n'instancie jamais ExoPlayer lui-même : le lecteur vient du pool (borné à trois, FIFO)
        // et y retourne à la sortie. La source se pose à chaque emprunt, le lecteur n'est donc lié à aucune URL.
        val sourceFactory =
            if (cached) mediaCache.mediaSourceFactory(MediaCacheCategory.VIDEO, mediaUrl)
            else DefaultMediaSourceFactory(context)
        ReelPlayers.get(context).acquire().apply {
            setAudioAttributes(VIDEO_AUDIO_ATTRIBUTES, !muted && holdsAudioFocus)
            // **La fenêtre est portée par le MediaItem, jamais par un `seekTo`
            // suivi d'une surveillance.** ExoPlayer coupe alors la source
            // lui-même : la position 0 du player EST le début de la fenêtre, la
            // boucle reboucle sur elle, et aucun code n'a à observer la tête de
            // lecture pour arrêter à temps.
            setMediaSource(
                sourceFactory.createMediaSource(
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
                ),
            )
            repeatMode = Player.REPEAT_MODE_ONE
            this.volume = if (muted) 0f else volume.coerceIn(0f, 1f)
            playWhenReady = false
            if (painted) setVideoEffects(emptyList())
            prepare()
        }
    }
    LaunchedEffect(player, effects) { effects?.let { player?.setVideoEffects(it.effects) } }

    // Le volume suit [muted] a chaud : le player est memoize par URL, donc la
    // valeur passee au constructeur ne refleterait jamais un toggle ulterieur.
    LaunchedEffect(player, muted, holdsAudioFocus, volume) {
        player?.volume = if (muted) 0f else volume.coerceIn(0f, 1f)
        // Le focus suit le son : audible, la lecture le prend ; muet, elle le rend et ne le redemande pas.
        player?.setAudioAttributes(VIDEO_AUDIO_ATTRIBUTES, !muted && holdsAudioFocus)
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
    val currentOnAudioFocusGained by rememberUpdatedState(onAudioFocusGained)
    val currentOnAudioFocusLostForGood by rememberUpdatedState(onAudioFocusLostForGood)
    val currentOnFirstFrame by rememberUpdatedState(onFirstFrame)
    val currentOnPlaybackEnded by rememberUpdatedState(onPlaybackEnded)
    DisposableEffect(player) {
        val live = player ?: return@DisposableEffect onDispose { }
        val releaseLease = if (cached) mediaCache.lease(mediaUrl) else ({ })
        currentOnPlayer(ReelPlayerHandle(live))
        val focusListener = object : Player.Listener {
            override fun onRenderedFirstFrame() = currentOnFirstFrame()

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) currentOnPlaybackEnded()
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (!playWhenReady && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS) {
                    currentOnAudioFocusLost()
                    currentOnAudioFocusLostForGood()
                }
            }

            // Perte PASSAGÈRE (un appel qui sonne, une alarme) : ExoPlayer se tait sans toucher à playWhenReady et
            // reprendrait seul au retour du focus, pendant que la minuterie de la story aurait continué. L'hôte
            // fige donc la lecture comme pour une perte définitive : rien ne repart au milieu d'un appel.
            override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
                if (playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS) {
                    currentOnAudioFocusLost()
                } else if (playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                    currentOnAudioFocusGained()
                }
            }
        }
        live.addListener(focusListener)
        onDispose {
            live.removeListener(focusListener)
            currentOnPlayer(null)
            releaseLease()
            // Un lecteur peint par le GPU garde son pipeline d'effets : il ne se remet pas à zéro, il se détruit.
            val pool = ReelPlayers.get(context)
            if (painted) pool.discard(live) else pool.release(live)
        }
    }

    if (!showsPicture || player == null) return

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            if (textured) {
                LayoutInflater.from(ctx).inflate(R.layout.composer_live_player_view, null) as PlayerView
            } else {
                PlayerView(ctx).apply {
                    useController = false
                    // Sans obturateur noir : le poster posé derrière reste visible jusqu'à la première image.
                    setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                }
            }
        },
        update = { view ->
            view.resizeMode = if (fit) AspectRatioFrameLayout.RESIZE_MODE_FIT else AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            view.player = player
        },
        onRelease = { view -> view.player = null },
    )
}
