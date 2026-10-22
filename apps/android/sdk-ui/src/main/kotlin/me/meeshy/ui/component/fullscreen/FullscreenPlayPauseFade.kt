package me.meeshy.ui.component.fullscreen

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.sdk.model.fullscreen.FullscreenPlayPauseFadeLaw
import me.meeshy.ui.R

/**
 * L'état du bouton lecture/pause central, tenu par la loi pure [FullscreenPlayPauseFadeLaw] :
 * l'hôte lui dit ce que fait le moteur ([rememberFullscreenPlayPauseFade]) et quand on touche
 * le média ([onMediaTap]) ; le bouton lit [isVisible].
 */
@Stable
public class FullscreenPlayPauseFadeState internal constructor() {

    public var law: FullscreenPlayPauseFadeLaw by mutableStateOf(FullscreenPlayPauseFadeLaw())
        private set

    /** Affiché en permanence en pause ; en lecture, seulement tant qu'il est révélé. */
    public val isVisible: Boolean get() = law.isVisible

    internal fun onPlayback(isPlaying: Boolean) {
        law = law.playback(isPlaying)
    }

    /**
     * Un toucher sur le média pendant la lecture ramène le bouton et réarme la seconde. Le toucher
     * garde aussi l'effet que l'hôte lui donne (basculer le plein cadre ou le chrome) : la loi ne
     * rend aucun verdict « ce toucher s'arrête au bouton ».
     */
    public fun onMediaTap() {
        law = law.tappingMedia()
    }

    internal fun onFaded() {
        law = law.fading()
    }
}

/**
 * **Le bouton pause d'une vidéo plein écran s'efface une seconde après le début de la lecture, et
 * revient au toucher.** Un bouton posé au centre de l'image cache ce qu'on regarde. L'état suit
 * [isPlaying] ; la tâche d'effacement est clée sur la loi, donc un réarmement (toucher, reprise)
 * la relance d'elle-même, sans minuteur à invalider.
 */
@Composable
public fun rememberFullscreenPlayPauseFade(isPlaying: Boolean): FullscreenPlayPauseFadeState {
    val state = remember { FullscreenPlayPauseFadeState() }
    LaunchedEffect(isPlaying) { state.onPlayback(isPlaying) }
    LaunchedEffect(state.law) {
        val wait = state.law.fadeDelay ?: return@LaunchedEffect
        delay(wait)
        state.onFaded()
    }
    return state
}

internal const val PLAY_PAUSE_DISC_TAG: String = "fullscreen-play-pause-disc"
internal const val PLAY_PAUSE_RELAY_TAG: String = "fullscreen-play-pause-relay"

private val CenterButtonSize = 64.dp
private val CenterGlyphSize = 32.dp
private const val CENTER_FADE_MILLIS: Int = 250

/** Le bouton central est translucide : il se pose sur l'image sans la couvrir. */
public const val FULLSCREEN_CENTER_BUTTON_OPACITY: Float = 0.55f

/**
 * Le bouton lecture/pause central. Visible ([visible], de [FullscreenPlayPauseFadeState.isVisible]),
 * un toucher met en pause ou reprend. Effacé, il ne se voit ni ne se touche — **mais TalkBack le
 * garde** : une vue à opacité nulle sortirait de l'arbre d'accessibilité, et sans ce relais une
 * personne qui navigue au lecteur d'écran perdrait la pause une seconde après avoir lancé la
 * lecture. Le relais, posé HORS de l'opacité, porte le même libellé et la même action ; il
 * n'existe pas quand le bouton est visible, et ne porte aucun geste tactile (le toucher tombe sur
 * le média, qui ramène le bouton).
 */
@Composable
public fun FullscreenPlayPauseButton(
    isPlaying: Boolean,
    visible: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    opacity: Float = FULLSCREEN_CENTER_BUTTON_OPACITY,
    playLabel: String = stringResource(R.string.fullscreen_play),
    pauseLabel: String = stringResource(R.string.fullscreen_pause),
) {
    val label = if (isPlaying) pauseLabel else playLabel
    val discAlpha by animateFloatAsState(
        targetValue = if (visible) opacity else 0f,
        animationSpec = tween(durationMillis = CENTER_FADE_MILLIS),
        label = "fullscreenPlayPauseAlpha",
    )
    Box(modifier.size(CenterButtonSize), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .fillMaxSize()
                .testTag(PLAY_PAUSE_DISC_TAG)
                .graphicsLayer { alpha = discAlpha }
                .then(
                    if (visible) {
                        Modifier
                            .clip(CircleShape)
                            .clickable(role = Role.Button) { onToggle() }
                            .semantics { contentDescription = label }
                    } else {
                        Modifier.clearAndSetSemantics { }
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            FullscreenGlassBackdrop(tone = FullscreenChromeTone.OnMedia, modifier = Modifier.fillMaxSize())
            Icon(
                imageVector = (if (isPlaying) FullscreenChromeSymbol.Pause else FullscreenChromeSymbol.Play).icon,
                contentDescription = null,
                tint = fullscreenChromeInk(FullscreenChromeTone.OnMedia, null),
                modifier = Modifier.size(CenterGlyphSize),
            )
        }
        if (!visible) {
            Box(
                Modifier
                    .fillMaxSize()
                    .testTag(PLAY_PAUSE_RELAY_TAG)
                    .semantics {
                        contentDescription = label
                        role = Role.Button
                        onClick(label = null) {
                            onToggle()
                            true
                        }
                    },
            )
        }
    }
}
