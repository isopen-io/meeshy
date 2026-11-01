package me.meeshy.ui.component.video

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.fullscreen.FullscreenVideoGestures
import me.meeshy.sdk.model.fullscreen.SwipeDownOutcome
import me.meeshy.ui.component.viewer.ImageViewerMoreMenu
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.playback.PipAspect
import me.meeshy.sdk.model.playback.VideoPresentation
import me.meeshy.ui.R
import me.meeshy.ui.component.viewer.ImageViewerExit
import me.meeshy.ui.component.viewer.viewerDialogProperties
import androidx.compose.ui.platform.testTag
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le lecteur vidéo plein écran de Meeshy : une vidéo se regarde ICI, pas dans l'application système. Il joue
 * [mediaUrl] (par le cache disque de [ReelVideoSurface]), son audible, en entier dans l'écran. Un toucher met en
 * pause / reprend ; la barre de progression et la croix s'effacent après quelques secondes de lecture. Avec [secure], la fenêtre est exclue des captures (FLAG_SECURE) et le média ne passe pas par le cache disque. Un autre son
 * (vocal, appel) qui prend le focus met la lecture en pause, comme partout ailleurs.
 *
 * Un glissement vers le bas au-delà du seuil de [FullscreenVideoGestures] ferme la vidéo, comme la visionneuse d'images ;
 * en deçà, elle revient en ressort. Le menu ⋯ porte les [exits] que l'hôte lui confie (Enregistrer, Partager —
 * #13915) et lui rend celle qu'on touche ; sans sortie, pas de menu.
 *
 * Le Picture-in-Picture (iOS `MeeshyVideoPlayer` plein écran, #13814) : quitter l'application pendant la lecture, ou
 * toucher le bouton PiP, fait continuer la vidéo seule dans la fenêtre flottante, sans contrôles ; fermer la fenêtre la
 * met en pause. Une vidéo [secure] (protégée) n'a ni bouton ni fenêtre.
 */
@Composable
public fun MeeshyVideoViewer(
    mediaUrl: String,
    onDismiss: () -> Unit,
    secure: Boolean = false,
    exits: List<ImageViewerExit> = emptyList(),
    onExit: (ImageViewerExit) -> Unit = {},
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = viewerDialogProperties(secure),
    ) {
        var handle by remember { mutableStateOf<ReelPlayerHandle?>(null) }
        var paused by remember { mutableStateOf(false) }
        var controlsShown by remember { mutableStateOf(true) }
        var progress by remember { mutableFloatStateOf(0f) }
        val toggleTouch = remember { MutableInteractionSource() }
        val pip = rememberVideoPictureInPicture(
            presentation = VideoPresentation.FULLSCREEN,
            isProtected = secure,
            player = handle,
            fallback = PipAspect.LANDSCAPE,
            onWindowClosed = {
                paused = true
                controlsShown = true
            },
        )
        val chromeShown = controlsShown && !pip.inPip
        val density = LocalDensity.current
        val scope = rememberCoroutineScope()
        val dragY = remember { Animatable(0f) }
        val latestDismiss by rememberUpdatedState(onDismiss)
        val dismissDistancePx = with(density) { FullscreenVideoGestures.DISMISS_DISTANCE.dp.toPx() }

        LaunchedEffect(handle) {
            val live = handle ?: return@LaunchedEffect
            while (true) {
                val duration = live.durationMs()
                progress = if (duration > 0) (live.positionMs().toFloat() / duration).coerceIn(0f, 1f) else 0f
                delay(PROGRESS_TICK_MILLIS)
            }
        }
        LaunchedEffect(controlsShown, paused) {
            if (controlsShown && !paused) {
                delay(CONTROLS_HIDE_MILLIS)
                controlsShown = false
            }
        }
        DisposableEffect(Unit) { onDispose { handle = null } }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .drawBehind { drawRect(Color.Black.copy(alpha = 1f - STAGE_FADE_ON_DRAG * (dragY.value / dismissDistancePx).coerceIn(0f, 1f))) }
                .testTag(VIDEO_VIEWER_STAGE_TAG)
                .pointerInput(Unit) {
                    var travel = 0f
                    detectVerticalDragGestures(
                        onDragStart = { travel = 0f },
                        onVerticalDrag = { change, dy ->
                            travel = FullscreenVideoGestures.dragOffset(travel + dy)
                            val follow = travel
                            scope.launch { dragY.snapTo(follow) }
                            change.consume()
                        },
                        onDragEnd = {
                            val travelDp = with(density) { travel.toDp().value }
                            when (FullscreenVideoGestures.swipeDownEnded(travelDp, isPlaying = false, pipActive = false)) {
                                is SwipeDownOutcome.Dismiss -> latestDismiss()
                                SwipeDownOutcome.SnapBack -> scope.launch { dragY.animateTo(0f, spring()) }
                            }
                        },
                        onDragCancel = { scope.launch { dragY.animateTo(0f, spring()) } },
                    )
                }
                .clickable(interactionSource = toggleTouch, indication = null, role = Role.Button) {
                    paused = !paused
                    controlsShown = true
                },
            contentAlignment = Alignment.Center,
        ) {
            ReelVideoSurface(
                mediaUrl = mediaUrl,
                isActive = true,
                rewindWhenInactive = false,
                modifier = Modifier.fillMaxSize().graphicsLayer { translationY = dragY.value },
                muted = false,
                paused = paused,
                fit = true,
                onPlayer = { handle = it },
                onAudioFocusLost = { paused = true; controlsShown = true },
                cached = !secure,
            )
            AnimatedVisibility(visible = paused && !pip.inPip, enter = fadeIn(), exit = fadeOut()) {
                Icon(
                    MeeshyIcons.PlayCircleFilled,
                    contentDescription = stringResource(R.string.fullscreen_play),
                    tint = Color.White,
                    modifier = Modifier.size(72.dp),
                )
            }
            AnimatedVisibility(
                visible = chromeShown,
                modifier = Modifier.align(Alignment.TopStart),
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .statusBarsPadding()
                        .padding(MeeshySpacing.sm)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.4f)),
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.fullscreen_close), tint = Color.White)
                }
            }
            AnimatedVisibility(
                visible = chromeShown && (pip.offersButton || exits.isNotEmpty()),
                modifier = Modifier.align(Alignment.TopEnd),
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Row(
                    modifier = Modifier.statusBarsPadding().padding(MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    if (pip.offersButton) {
                        IconButton(
                            onClick = pip.enter,
                            modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.4f)),
                        ) {
                            Icon(
                                MeeshyIcons.PictureInPicture,
                                contentDescription = stringResource(R.string.media_video_pip_enter),
                                tint = Color.White,
                            )
                        }
                    }
                    if (exits.isNotEmpty()) ImageViewerMoreMenu(exits = exits, isBusy = false, onExit = onExit)
                }
            }
            AnimatedVisibility(
                visible = chromeShown,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(MeeshySpacing.lg)) {
                    LinearProgressIndicator(
                        progress = { progress },
                        color = Color.White,
                        trackColor = Color.White.copy(alpha = 0.3f),
                        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
                    )
                }
            }
        }
    }
}

/** La scène de la vidéo plein écran, où se lisent le toucher et le glissement vers le bas. */
public const val VIDEO_VIEWER_STAGE_TAG: String = "meeshy.video.viewer.stage"

/** How much of the black stage fades while a swipe down follows the finger (as the image viewer). */
private const val STAGE_FADE_ON_DRAG = 0.6f
private const val PROGRESS_TICK_MILLIS = 250L
private const val CONTROLS_HIDE_MILLIS = 3_000L
