package me.meeshy.ui.component.video

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.drop
import me.meeshy.sdk.model.playback.PipAspect
import me.meeshy.sdk.model.playback.VideoPictureInPicturePolicy
import me.meeshy.sdk.model.playback.VideoPresentation

/** Le coordinateur PiP vidéo de l'activité ; `null` (aperçus, tests, hôte sans PiP) : aucune fenêtre. */
public val LocalVideoPictureInPicture: ProvidableCompositionLocal<VideoPictureInPictureCoordinator?> =
    staticCompositionLocalOf { null }

/** Ce que la surface lit de son PiP : la fenêtre la montre ([inPip]), le bouton est proposé, et le geste qui l'ouvre. */
@Stable
public class VideoPictureInPictureState internal constructor(
    public val inPip: Boolean,
    public val offersButton: Boolean,
    public val enter: () -> Unit,
)

/**
 * Inscrit la surface [player] auprès du coordinateur tant qu'elle est [active] et que la loi
 * ([VideoPictureInPicturePolicy.mayConfigure]) la laisse configurer une fenêtre : une vidéo inline ou protégée ne
 * s'inscrit jamais. [onWindowClosed] : l'utilisateur a fermé la fenêtre, la vidéo se met en pause.
 */
@Composable
public fun rememberVideoPictureInPicture(
    presentation: VideoPresentation,
    isProtected: Boolean,
    player: ReelPlayerHandle?,
    fallback: PipAspect,
    active: Boolean = true,
    requestsPip: Boolean = true,
    onWindowClosed: () -> Unit = {},
): VideoPictureInPictureState {
    val coordinator = LocalVideoPictureInPicture.current
    val configured = coordinator != null && player != null && active &&
        VideoPictureInPicturePolicy.mayConfigure(presentation, requestsPip, isProtected)
    DisposableEffect(coordinator, player, configured, fallback) {
        val live = player
        if (!configured || coordinator == null || live == null) return@DisposableEffect onDispose { }
        val unregister = coordinator.register(
            object : VideoPictureInPictureSurface {
                override val isPlaying: Boolean get() = live.isPlaying
                override val aspect: PipAspect
                    get() = VideoPictureInPicturePolicy.aspect(live.displayWidth(), live.displayHeight(), fallback)
            },
        )
        onDispose { unregister() }
    }
    val currentOnWindowClosed by rememberUpdatedState(onWindowClosed)
    LaunchedEffect(coordinator, configured) {
        if (configured && coordinator != null) coordinator.closures.drop(1).collect { currentOnWindowClosed() }
    }
    val inPip = rememberVideoWindowShown()
    return VideoPictureInPictureState(
        inPip = inPip && configured,
        offersButton = configured && coordinator?.offersButton() == true,
        enter = { coordinator?.requestEnter() },
    )
}

/** `true` tant que la fenêtre flottante montre une vidéo : l'écran qui la porte retire tout son chrome. */
@Composable
public fun rememberVideoWindowShown(): Boolean {
    val coordinator = LocalVideoPictureInPicture.current
    val flow = coordinator?.inPip ?: remember { MutableStateFlow(false) }
    val shown by flow.collectAsState()
    return shown
}
