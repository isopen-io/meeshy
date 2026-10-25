package me.meeshy.ui.component.audio

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.DurationFormat
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.MeeshyMinTapTarget
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.media.MeeshyMediaCache
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val PROGRESS_TICK_MS: Long = 200L
private val PLAY_BUTTON_SIZE = 40.dp
private val TRACK_HEIGHT = 4.dp

/**
 * La lecture d'un échantillon de voix, pure et sans lecteur : progression bornée `0..1`, horloge
 * « M:SS » (le temps écoulé pendant la lecture, la durée sinon) et résolution de l'adresse servie.
 */
public object VoiceSampleProgress {

    /** La part écoulée ; une durée inconnue ou nulle donne 0. */
    public fun fraction(positionMs: Long, durationMs: Long?): Float {
        val total = durationMs?.takeIf { it > 0 } ?: return 0f
        return (positionMs.coerceAtLeast(0).toFloat() / total).coerceIn(0f, 1f)
    }

    /** « 0:04 » : l'écoulé en lecture ou après une pause en cours de route, sinon la durée totale. */
    public fun clock(positionMs: Long, durationMs: Long?, isPlaying: Boolean): String {
        val shown = if (isPlaying || positionMs > 0) positionMs else durationMs ?: 0L
        return DurationFormat.clock(wholeSeconds = (shown.coerceAtLeast(0) / 1000L).toInt())
    }

    /**
     * L'adresse jouée : une URL absolue telle quelle ; un chemin `/…` rattaché à l'origine de la base
     * d'API configurée ; `null` quand rien ne peut être joué.
     */
    public fun resolve(url: String, apiBaseUrl: String?): String? {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) return null
        if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed
        if (!trimmed.startsWith("/")) return null
        val origin = apiBaseUrl?.let(::origin) ?: return null
        return origin + trimmed
    }

    private fun origin(base: String): String? {
        val scheme = base.indexOf("://").takeIf { it > 0 } ?: return null
        val pathStart = base.indexOf('/', startIndex = scheme + 3)
        return if (pathStart < 0) base else base.substring(0, pathStart)
    }
}

/**
 * Le lecteur de l'échantillon public d'une voix (miroir de l'`AudioPlayerView` que la fiche iOS
 * monte dans sa carte « Voix ») : bouton lecture / pause dans la couleur [accent], barre de
 * progression et horloge. Le lecteur n'est créé qu'au premier appui, mis en pause quand l'écran
 * passe en arrière-plan et libéré quand le composant quitte l'écran ; la fin rembobine.
 */
@OptIn(UnstableApi::class)
@Composable
public fun MeeshyVoiceSamplePlayer(
    url: String,
    durationMs: Long?,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val apiBaseUrl = LocalMediaBaseUrl.current
    val source = remember(url, apiBaseUrl) { VoiceSampleProgress.resolve(url, apiBaseUrl) }
    var player by remember(source) { mutableStateOf<ExoPlayer?>(null) }
    var isPlaying by remember(source) { mutableStateOf(false) }
    var positionMs by remember(source) { mutableLongStateOf(0L) }
    var knownDurationMs by remember(source) { mutableStateOf(durationMs?.takeIf { it > 0 }) }

    val toggle: () -> Unit = toggle@{
        val playable = source ?: return@toggle
        val current = player ?: createVoicePlayer(context, playable).also { created ->
            created.addListener(object : Player.Listener {
                override fun onIsPlayingChanged(playing: Boolean) {
                    isPlaying = playing
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY && created.duration > 0) knownDurationMs = created.duration
                    if (playbackState == Player.STATE_ENDED) {
                        created.pause()
                        created.seekTo(0)
                        positionMs = 0L
                    }
                }
            })
            player = created
        }
        if (current.isPlaying) current.pause() else current.play()
    }

    LaunchedEffect(player, isPlaying) {
        val active = player ?: return@LaunchedEffect
        while (isPlaying) {
            positionMs = active.currentPosition
            delay(PROGRESS_TICK_MS)
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(player, lifecycleOwner) {
        val active = player
        val releaseLease = if (active != null && source != null) MeeshyMediaCache.get(context).lease(source) else null
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) active?.pause()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            releaseLease?.invoke()
            active?.release()
        }
    }

    VoiceSampleControls(
        isPlaying = isPlaying,
        fraction = VoiceSampleProgress.fraction(positionMs, knownDurationMs),
        clock = VoiceSampleProgress.clock(positionMs, knownDurationMs, isPlaying),
        accent = accent,
        enabled = source != null,
        onToggle = toggle,
        modifier = modifier,
    )
}

@OptIn(UnstableApi::class)
private fun createVoicePlayer(context: android.content.Context, url: String): ExoPlayer {
    val cache = MeeshyMediaCache.get(context)
    return ExoPlayer.Builder(context)
        .setMediaSourceFactory(cache.mediaSourceFactory(MediaCacheCategory.AUDIO, url))
        .build()
        .apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = Player.REPEAT_MODE_OFF
            prepare()
        }
}

/** Les commandes sans lecteur : bouton, piste et horloge, testables sous Robolectric. */
@Composable
internal fun VoiceSampleControls(
    isPlaying: Boolean,
    fraction: Float,
    clock: String,
    accent: Color,
    enabled: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(if (isPlaying) R.string.fullscreen_pause else R.string.fullscreen_play)
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(MeeshyMinTapTarget)
                .clip(CircleShape)
                .clickable(enabled = enabled, onClickLabel = label, role = Role.Button, onClick = onToggle),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier.size(PLAY_BUTTON_SIZE).background(accent, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (isPlaying) MeeshyIcons.Pause else MeeshyIcons.Play,
                    contentDescription = label,
                    tint = MeeshyTheme.tokens.backgroundPrimary,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .height(TRACK_HEIGHT)
                .clip(RoundedCornerShape(TRACK_HEIGHT))
                .background(accent.copy(alpha = MeeshyOpacity.medium))
                .semantics { progressBarRangeInfo = ProgressBarRangeInfo(fraction, 0f..1f) },
        ) {
            Box(Modifier.fillMaxWidth(fraction).height(TRACK_HEIGHT).background(accent))
        }
        Text(
            text = clock,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}
