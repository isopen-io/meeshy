package me.meeshy.app.calls

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallDuoStageLayout
import me.meeshy.sdk.model.call.CallSelfTileCorner
import me.meeshy.sdk.model.call.CallSelfTileMemory
import me.meeshy.sdk.model.call.ScreenShareCapturePolicy
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import org.webrtc.EglBase
import org.webrtc.VideoTrack

private const val PAUSED_SCRIM_ALPHA = 0.85f
private val MUTED_BADGE_TOP = 52.dp
private val ZOOM_INDICATOR_BOTTOM = 220.dp
private val CAMERA_RAIL_TOP = 56.dp

/**
 * La scène vidéo du duo (miroir de iOS `videoCallLayout` + `duoOverlays`). Connecté : la vidéo du
 * correspondant occupe tout l'écran — son avatar « Caméra désactivée » s'il n'envoie rien — et ma
 * vignette flotte par-dessus ; toucher la vignette permute les deux ([onSwap]). Avant la connexion, mon aperçu
 * tient tout le fond. Le flux d'un pair qui escalade l'audio en vidéo s'affiche même caméra locale coupée.
 *
 * [layout] — mon image en plein écran ou dans la vignette — est décidé par l'écran (`CallDuoStageLaw`) : il dit où vit le
 * ZOOM de ma caméra (les pastilles en haut au centre, ou le bouton dans la vignette). Les commandes de ma caméra n'ont plus
 * de place ici (#17327) : ce sont le rail « Mon image » du (…). La vignette porte le liseré de qui elle montre
 * ([selfUserId], ou [peerUserId] après permutation — loi 4).
 */
@Composable
internal fun CallDuoVideoStage(
    state: CallUiState,
    callKey: String,
    remoteTrack: VideoTrack?,
    localTrack: VideoTrack?,
    eglContext: EglBase.Context,
    peerAvatarUrl: String?,
    connected: Boolean,
    reduceMotion: Boolean,
    layout: CallDuoStageLayout,
    modifier: Modifier = Modifier,
    onSwap: () -> Unit = {},
    /** Ma vignette touchée, contrôles rangés : ils reviennent d'abord (G1.9). */
    onRevive: () -> Unit = {},
    selfTileMemory: CallSelfTileMemory = CallSelfTileMemories.shared,
    onSceneTap: (() -> Unit)? = null,
    selfCamera: CallSelfCameraActions? = null,
    controlsVisible: Boolean = true,
    framed: Boolean = false,
    selfUserId: String = "",
    peerUserId: String = "",
    peerSpeech: CallPeerSpeechSource = CallPeerSpeechSource.NONE,
) {
    Box(modifier.fillMaxSize()) {
        if (!connected) {
            localTrack?.let { local ->
                VideoRenderer(track = local, eglContext = eglContext, modifier = Modifier.fillMaxSize(), mirror = state.mirrorsLocalPreview)
            }
        } else {
            val featuresLocal = layout.isMyImageFullScreen
            val fit = ScreenShareCapturePolicy.remoteFits(state.isPeerScreenSharing, rememberCallVideoFit())
            if (!framed) {
                if (featuresLocal && localTrack != null) {
                    VideoRenderer(track = localTrack, eglContext = eglContext, modifier = Modifier.fillMaxSize(), mirror = state.mirrorsLocalPreview, fit = fit)
                } else {
                    CallRemoteVideoStage(
                        callKey = callKey,
                        hasTrack = remoteTrack != null,
                        peerVideoEnabled = !state.isPeerCameraOff,
                        hasEstablishedMedia = connected,
                        track = remoteTrack,
                        eglContext = eglContext,
                        peerName = state.peerName,
                        avatarUrl = peerAvatarUrl,
                        modifier = Modifier.fillMaxSize(),
                        fit = fit,
                        peerSpeech = peerSpeech,
                    )
                }
            }
            // Le toucher de la scène vit ICI, SOUS la vignette : un détecteur posé sur la colonne du
            // chrome, au-dessus, avalait tous les touchers et la vignette ne glissait ni ne permutait plus.
            // Ma propre image en plein écran se pince (zoom de la caméra envoyée) ; zoomée, un double toucher
            // revient à 1×.
            val pinchZoom = if (featuresLocal) selfCamera?.zoom else null
            if (onSceneTap != null || pinchZoom != null) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .let { if (pinchZoom != null) it.callCameraPinch(enabled = true, zoom = pinchZoom).callCameraZoomAdjustable(pinchZoom) else it }
                        .pointerInput(onSceneTap, pinchZoom) {
                            detectTapGestures(
                                onDoubleTap = pinchZoom?.let { zoom ->
                                    { if (zoom.state.value.displayFactor != zoom.state.value.profile?.baselineDisplay) zoom.resetToBaseline() }
                                },
                                onTap = { onSceneTap?.invoke() },
                            )
                        },
                )
            }
            if (pinchZoom != null) {
                CallZoomIndicator(pinchZoom, Modifier.align(Alignment.BottomCenter).padding(bottom = ZOOM_INDICATOR_BOTTOM))
            }
            // iOS `zoomLensRail` : mon image en plein écran, les pastilles de zoom montent en haut au centre ; dans la
            // vignette, le bouton de zoom s'y loge. Les commandes de ma caméra sont le rail « Mon image » du (…).
            if (featuresLocal && selfCamera != null) {
                AnimatedVisibility(
                    visible = controlsVisible,
                    enter = fadeIn(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
                    exit = fadeOut(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
                    modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding().padding(top = CAMERA_RAIL_TOP),
                ) {
                    CallZoomLensCapsule(selfCamera.zoom, state.isCameraOn)
                }
            }
            if (state.isPeerMuted && !featuresLocal) {
                CallPeerMutedBadge(
                    compact = false,
                    modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding().padding(top = MUTED_BADGE_TOP),
                )
            }
            if (layout.showsSelfTile) {
                val showsMyImage = !featuresLocal && state.isCameraOn && localTrack != null && !state.isVideoAutoPaused
                CallSelfTile(
                    callKey = callKey,
                    memory = selfTileMemory,
                    paused = state.isVideoAutoPaused && state.isCameraOn,
                    reduceMotion = reduceMotion,
                    onSwap = onSwap,
                    onReveal = onRevive,
                    controlsVisible = controlsVisible,
                    rimHex = CallTileRim.duoSelfTile(selfUserId, peerUserId, showsPeer = featuresLocal),
                    modifier = Modifier.fillMaxSize(),
                    overlay = { stowFactor ->
                        if (showsMyImage && selfCamera != null) CallSelfTileZoomSlot(selfCamera.zoom, visible = controlsVisible)
                        if (state.isPeerMuted && featuresLocal) {
                            val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
                            CallPeerMutedBadge(
                                compact = true,
                                modifier = Modifier.align(Alignment.BottomStart).padding(MeeshySpacing.xs)
                                    .callKeepsSmallTileSize(stowFactor, CallSelfTileCorner.BottomStart, rtl),
                            )
                        }
                    },
                ) {
                    when {
                        !state.isCameraOn -> CallSelfCameraOffBody()
                        state.isVideoAutoPaused && !featuresLocal -> CallVideoPausedTileBody()
                        featuresLocal -> CallRemoteVideoStage(
                            callKey = callKey,
                            hasTrack = remoteTrack != null,
                            peerVideoEnabled = !state.isPeerCameraOff,
                            hasEstablishedMedia = connected,
                            track = remoteTrack,
                            eglContext = eglContext,
                            peerName = state.peerName,
                            avatarUrl = peerAvatarUrl,
                            modifier = Modifier.fillMaxSize(),
                            compact = true,
                            overlay = true,
                            peerSpeech = peerSpeech,
                        )
                        localTrack != null -> VideoRenderer(
                            track = localTrack,
                            eglContext = eglContext,
                            modifier = Modifier.fillMaxSize(),
                            mirror = state.mirrorsLocalPreview,
                            overlay = true,
                        )
                        else -> Unit
                    }
                }
            }
        }
    }
}

/** La tuile de survie : « Vidéo en pause · Reprise auto », là où se pose la vignette (caméra gelée par l'appli, pas coupée). */
@Composable
internal fun CallVideoPausedTileBody(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.fillMaxSize().background(CallPalette.Veil.copy(alpha = PAUSED_SCRIM_ALPHA)))
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
            modifier = Modifier.padding(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.Filled.VideocamOff,
                contentDescription = null,
                tint = MeeshyTheme.tokens.warning,
                modifier = Modifier.size(22.dp),
            )
            Text(
                text = stringResource(R.string.call_stage_video_paused),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = CallPalette.Ink,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(R.string.call_stage_video_paused_short),
                style = MaterialTheme.typography.labelSmall,
                color = CallPalette.InkMuted,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * Faut-il AJUSTER l'image (bandes) plutôt que la REMPLIR (rognée) ? Oui quand la fenêtre se
 * redimensionne — écran partagé, fenêtre libre, Chromebook — où rogner le correspondant déplaît.
 */
@Composable
internal fun rememberCallVideoFit(): Boolean {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    return remember(context, configuration) {
        val activity = context.findActivity()
        val multiWindow = activity?.isInMultiWindowMode == true
        val chromeOs = context.packageManager.hasSystemFeature("org.chromium.arc")
        multiWindow || chromeOs
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
