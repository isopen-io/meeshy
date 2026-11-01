package me.meeshy.ui.component.media

import android.os.Looper
import android.view.LayoutInflater
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.PlayerMessage
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import me.meeshy.sdk.model.composer.live.ComposerLivePlayback
import me.meeshy.sdk.model.composer.live.ComposerLiveWindow
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.R

const val COMPOSER_LIVE_VIDEO_TAG = "composer-live-video"
const val COMPOSER_LIVE_LOADING_TAG = "composer-live-loading"

private val LIVE_AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
    .setUsage(C.USAGE_MEDIA)
    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
    .build()

/** Le lecteur vivant du compositeur, et s'il attend encore sa première image (la scène le dit). */
@Stable
class ComposerLivePlayerState internal constructor(val player: ExoPlayer, waiting: State<Boolean>) {
    val waiting: Boolean by waiting
}

/**
 * L'attente d'un lecteur vivant : elle dure jusqu'à la PREMIÈRE IMAGE rendue, jamais au-delà — une recherche du Couper ou
 * une boucle qui remet le lecteur en mémoire tampon ne rallume pas l'anneau par-dessus une vidéo qui joue (recette S8 du
 * 2026-10-31 : l'anneau restait au-dessus de la lecture).
 */
internal class ComposerLiveFirstFrame : Player.Listener {
    val waiting = mutableStateOf(true)

    override fun onRenderedFirstFrame() {
        waiting.value = false
    }
}

/**
 * Le lecteur en direct du compositeur (#13863, #13973) : UN lecteur Media3 par média de la scène, jamais recréé pendant le
 * geste de Couper. Plusieurs jouent ensemble (fond, vidéos posées, sons) : aucun ne prend le focus audio, qui ferait taire
 * les autres — la scène se tait, elle, hors premier plan. La fenêtre est tenue sur la source entière — un message posé à sa fin ramène la tête au début, une boucle de la
 * source aussi ([ComposerLivePlayback.rewindTo]) — et chaque fenêtre nouvelle déplace la tête là où l'auteur regarde
 * ([ComposerLivePlayback.seekOnChange]). Le volume suit à chaud ; [playing] faux le fige sans rembobiner. Chacun ne charge
 * d'avance que quelques secondes, 8 Mo au plus ([ComposerLiveBuffer]).
 */
@OptIn(UnstableApi::class)
@Composable
fun rememberComposerLivePlayer(
    mediaUrl: String,
    window: ComposerLiveWindow,
    volume: Float,
    playing: Boolean,
    category: MediaCacheCategory = MediaCacheCategory.VIDEO,
): ComposerLivePlayerState {
    val context = LocalContext.current
    val mediaCache = remember(context) { MeeshyMediaCache.get(context) }
    val player = remember(mediaUrl) {
        PlayerCensus.record()
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaCache.mediaSourceFactory(category, mediaUrl))
            .setLoadControl(ComposerLiveBuffer.loadControl())
            .build().apply {
                setAudioAttributes(LIVE_AUDIO_ATTRIBUTES, false)
                setMediaItem(MediaItem.fromUri(mediaUrl))
                repeatMode = Player.REPEAT_MODE_ALL
                prepare()
            }
    }
    val firstFrame = remember(player) { ComposerLiveFirstFrame() }
    val live = remember(player) { ComposerLiveHead(player) }
    LaunchedEffect(live, window) { live.follow(window) }
    LaunchedEffect(player, volume) { player.volume = volume }
    LaunchedEffect(player, playing) { player.playWhenReady = playing }
    DisposableEffect(player) {
        val releaseLease = mediaCache.lease(mediaUrl)
        val listener = object : Player.Listener {
            override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
                if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) live.rewind()
            }
        }
        player.addListener(listener)
        player.addListener(firstFrame)
        onDispose {
            player.removeListener(firstFrame)
            player.removeListener(listener)
            live.close()
            releaseLease()
            player.release()
        }
    }
    return remember(player) { ComposerLivePlayerState(player, firstFrame.waiting) }
}

/** La tête du lecteur vivant : elle suit la fenêtre courante et reboucle sur son début. */
private class ComposerLiveHead(private val player: ExoPlayer) {
    private var window: ComposerLiveWindow? = null
    private var endMessage: PlayerMessage? = null

    fun follow(next: ComposerLiveWindow) {
        ComposerLivePlayback.seekOnChange(window, next)?.let(player::seekTo)
        window = next
        endMessage?.cancel()
        endMessage = next.endMs?.let { end ->
            player.createMessage { _, _ -> player.seekTo(next.startMs) }
                .setPosition(end)
                .setLooper(Looper.getMainLooper())
                .setDeleteAfterDelivery(false)
                .send()
        }
    }

    /** La source a rebouclé d'elle-même : la tête revient au début de la fenêtre. */
    fun rewind() {
        val current = window ?: return
        ComposerLivePlayback.rewindTo(player.currentPosition, current)?.let(player::seekTo)
    }

    fun close() {
        endMessage?.cancel()
        endMessage = null
    }
}

/**
 * L'image du lecteur vivant, posée sur l'affiche du média (aucun obturateur noir : l'affiche reste jusqu'à la première
 * image). Une TextureView, jamais une SurfaceView : l'image suit la pose de l'objet (échelle, rotation) et le look peint
 * par-dessus. Tant que le lecteur attend sa première image, un indicateur le dit, annoncé au lecteur d'écran.
 */
@OptIn(UnstableApi::class)
@Composable
fun ComposerLiveVideo(state: ComposerLivePlayerState, fit: Boolean, modifier: Modifier = Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        AndroidView(
            modifier = Modifier.matchParentSize().testTag(COMPOSER_LIVE_VIDEO_TAG),
            factory = { ctx -> LayoutInflater.from(ctx).inflate(R.layout.composer_live_player_view, null) as PlayerView },
            update = { view ->
                view.resizeMode = if (fit) AspectRatioFrameLayout.RESIZE_MODE_FIT else AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                view.player = state.player
            },
            onRelease = { view -> view.player = null },
        )
        if (state.waiting) ComposerLiveLoading()
    }
}

/** L'attente du lecteur vivant : un anneau discret, annoncé « Chargement de l'aperçu ». */
@Composable
fun ComposerLiveLoading(modifier: Modifier = Modifier) {
    val label = stringResource(R.string.media_trim_loading)
    CircularProgressIndicator(
        color = Color.White,
        strokeWidth = 2.dp,
        modifier = modifier.size(28.dp).testTag(COMPOSER_LIVE_LOADING_TAG).semantics { contentDescription = label },
    )
}
