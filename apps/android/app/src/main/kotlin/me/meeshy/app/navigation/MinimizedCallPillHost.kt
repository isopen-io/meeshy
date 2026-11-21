package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallViewModel
import me.meeshy.app.calls.CallHeaderNamesViewModel
import me.meeshy.app.calls.CallVignetteLayer
import me.meeshy.app.calls.VideoRenderer
import me.meeshy.app.calls.rememberCallHeaderNames
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.ui.theme.MeeshySpacing
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallVignetteGlide

/**
 * L'appel réduit en haut de l'application (#17767) : la pastille n'apparaît ni ne disparaît d'un coup, elle arrive et
 * repart par le fondu et l'échelle courts de [CallCapsuleTransitions], pendant que l'appel plein écran se contracte ou se
 * redéploie. Un toucher reconstruit la route CALL depuis la configuration vivante ; le [callViewModel] de l'activité est
 * repris, donc `start()` est inerte.
 *
 * « Réduire les animations » (réglage système OU forçage de l'application) est fourni SOUS ce niveau, par
 * `AccessibilityLocalsProvider` dans `ProvideAppLocals` : on lit la valeur que [FeedOverlayMotionLocalsProvider] relaie à
 * toute l'application, la même que lisent les transitions du `NavHost`.
 *
 * #18218 — l'hôte dit aussi à la navigation si un appel vivant a sa capsule ([CallCapsuleTransitions.capsuleLive]) :
 * l'écran d'appel s'y contracte et s'en redéploie. Seul le statut est lu (distinct), jamais le chrono : l'hôte ne se
 * recompose pas chaque seconde.
 */
@Composable
internal fun AnimatedMinimizedCallPill(
    visible: Boolean,
    callViewModel: CallViewModel,
    navController: NavHostController,
    onCollapse: () -> Unit = {},
) {
    val reduceMotion = FeedOverlayTransition.reduceMotion
    val capsuleLive by remember(callViewModel) {
        callViewModel.state.map { CallPillPresenter.isMinimizable(it.status) }.distinctUntilChanged()
    }.collectAsStateWithLifecycle(initialValue = CallPillPresenter.isMinimizable(callViewModel.state.value.status))
    SideEffect { CallCapsuleTransitions.capsuleLive = capsuleLive }
    AnimatedVisibility(
        visible = visible,
        enter = CallCapsuleTransitions.enter(reduceMotion),
        exit = CallCapsuleTransitions.exit(reduceMotion),
    ) {
        MinimizedCallPill(
            callViewModel = callViewModel,
            navController = navController,
            onCollapse = onCollapse,
            modifier = Modifier
                .statusBarsPadding()
                .padding(vertical = MeeshySpacing.xs)
                .collapsesIntoVignette(reduceMotion, onCollapse),
        )
    }
}

/**
 * #19701 — la capsule se REPLIE en vignette d'un glissé horizontal, progressif et annulable (directive du 2026-08-30) :
 * elle suit le doigt, et revient en place si on la relâche avant [CallVignetteGlide.COLLAPSE_DISTANCE_DP]. TalkBack
 * offre la même chose en action sur la capsule (`CallPill.onCollapse`).
 */
private fun Modifier.collapsesIntoVignette(reduceMotion: Boolean, onCollapse: () -> Unit): Modifier = composed {
    val shift = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    this
        .graphicsLayer { translationX = shift.value }
        .pointerInput(reduceMotion) {
            detectHorizontalDragGestures(
                onHorizontalDrag = { change, amount ->
                    change.consume()
                    scope.launch { shift.snapTo(shift.value + amount) }
                },
                onDragEnd = {
                    val travelledDp = with(density) { shift.value.toDp().value }
                    if (CallVignetteGlide.collapses(travelledDp)) {
                        onCollapse()
                        scope.launch { shift.snapTo(0f) }
                    } else {
                        scope.launch { if (reduceMotion) shift.snapTo(0f) else shift.animateTo(0f) }
                    }
                },
                onDragCancel = { scope.launch { shift.snapTo(0f) } },
            )
        }
}

/**
 * #19701 — l'appel réduit en vignette : la seule autre forme de l'appel réduit, en audio comme en vidéo. Elle lit l'état
 * VIVANT (chrono, vidéo de l'autre) ; posée en dernier calque de l'app, elle reste au-dessus de ce qui se voit.
 */
@Composable
internal fun MinimizedCallVignette(
    callViewModel: CallViewModel,
    navController: NavHostController,
    namesSource: CallHeaderNamesViewModel = hiltViewModel(),
) {
    val headerNames by rememberCallHeaderNames(callViewModel.activeConfig.conversationId, namesSource)
    val callState by callViewModel.state.collectAsStateWithLifecycle()
    val peerVisual by callViewModel.peerVisual.collectAsStateWithLifecycle()
    val remoteVideo by callViewModel.remoteVideoTracks.collectAsStateWithLifecycle(initialValue = null)
    val track = remoteVideo?.takeIf { callState.isVideoCall && !callState.isPeerCameraOff }
    CallVignetteLayer(
        state = callState,
        peerAvatarUrl = peerVisual.avatarUrl,
        peerUserId = callViewModel.activeConfig.peerId,
        names = headerNames,
        reduceMotion = FeedOverlayTransition.reduceMotion,
        onClick = {
            navController.navigate(CallRoute.reopen(callViewModel.activeConfig)) { launchSingleTop = true }
        },
        video = track?.let { live ->
            { modifier -> VideoRenderer(track = live, eglContext = callViewModel.eglBaseContext, modifier = modifier, overlay = true) }
        },
    )
}
