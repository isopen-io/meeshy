package me.meeshy.app.calls

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallDuoStageLayout
import me.meeshy.sdk.model.call.CallRemoteVideoFade
import me.meeshy.sdk.model.call.CallSelfTileLaw
import me.meeshy.sdk.model.call.CallSelfTileMemory
import me.meeshy.sdk.model.call.ScreenShareCapturePolicy
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
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
            // P15.11 : l'écran reçu tient la une (la permutation est refusée), il se pince jusqu'à 4×.
            val receivingScreen = state.isPeerScreenSharing && !featuresLocal && !framed
            val screenZoom = rememberCallReceivedScreenZoom(receivingScreen, callKey)
            if (!framed) {
                if (featuresLocal && localTrack != null) {
                    VideoRenderer(track = localTrack, eglContext = eglContext, modifier = Modifier.fillMaxSize(), mirror = state.mirrorsLocalPreview, fit = fit)
                } else {
                    CallRemoteVideoStage(
                        callKey = callKey, hasTrack = remoteTrack != null, peerVideoEnabled = !state.isPeerCameraOff,
                        hasEstablishedMedia = connected, track = remoteTrack, eglContext = eglContext, peerName = state.peerName,
                        avatarUrl = peerAvatarUrl,
                        modifier = Modifier.fillMaxSize().clipToBounds().callReceivedScreenZoomLayer(screenZoom, receivingScreen),
                        fit = fit, peerSpeech = peerSpeech,
                    )
                }
            }
            CallDuoSceneControls(
                state = state,
                featuresLocal = featuresLocal,
                receivingScreen = receivingScreen,
                screenZoom = screenZoom,
                reduceMotion = reduceMotion,
                onSceneTap = onSceneTap,
                selfCamera = selfCamera,
                controlsVisible = controlsVisible,
            )
            CallDuoStageOverlays(
                state = state,
                featuresLocal = featuresLocal,
                showsSelfTile = layout.showsSelfTile,
                callKey = callKey,
                remoteTrack = remoteTrack,
                localTrack = localTrack,
                eglContext = eglContext,
                peerAvatarUrl = peerAvatarUrl,
                reduceMotion = reduceMotion,
                onSwap = onSwap,
                onRevive = onRevive,
                selfTileMemory = selfTileMemory,
                selfCamera = selfCamera,
                controlsVisible = controlsVisible,
                selfUserId = selfUserId,
                peerUserId = peerUserId,
                peerSpeech = peerSpeech,
            )
        }
    }
}

/**
 * Les gestes et les commandes de zoom posés sur l'image du duo connecté, SOUS ma vignette : le toucher de la scène, le pincement
 * de ma propre image en plein écran (et son indicateur), et les pastilles de zoom de ma caméra quand mon image tient la scène.
 */
@Composable
private fun BoxScope.CallDuoSceneControls(
    state: CallUiState,
    featuresLocal: Boolean,
    receivingScreen: Boolean,
    screenZoom: CallReceivedScreenZoom,
    reduceMotion: Boolean,
    onSceneTap: (() -> Unit)?,
    selfCamera: CallSelfCameraActions?,
    controlsVisible: Boolean,
) {
    // Le toucher de la scène vit ICI, SOUS la vignette : un détecteur posé sur la colonne du
    // chrome, au-dessus, avalait tous les touchers et la vignette ne glissait ni ne permutait plus.
    // Ma propre image en plein écran se pince (zoom de la caméra envoyée) ; zoomée, un double toucher
    // revient à 1×.
    val pinchZoom = if (featuresLocal) selfCamera?.zoom else null
    if (onSceneTap != null || pinchZoom != null || receivingScreen) {
        val sceneGestures = if (receivingScreen) {
            Modifier.callReceivedScreenZoomGestures(screenZoom, reduceMotion, onSceneTap)
        } else {
            Modifier
                .let { if (pinchZoom != null) it.callCameraPinch(enabled = true, zoom = pinchZoom).callCameraZoomAdjustable(pinchZoom) else it }
                .pointerInput(onSceneTap, pinchZoom) {
                    detectTapGestures(
                        onDoubleTap = pinchZoom?.let { zoom ->
                            { if (zoom.state.value.displayFactor != zoom.state.value.profile?.baselineDisplay) zoom.resetToBaseline() }
                        },
                        onTap = { onSceneTap?.invoke() },
                    )
                }
        }
        Box(Modifier.fillMaxSize().then(sceneGestures))
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
}

/**
 * Ce qui se pose sur l'image du duo connecté : le micro coupé de l'autre et ma vignette, chacun paraissant et repartant en fondu
 * (loi 17.1) — jamais insérés ni retirés d'un coup.
 */
@Composable
private fun BoxScope.CallDuoStageOverlays(
    state: CallUiState,
    featuresLocal: Boolean,
    showsSelfTile: Boolean,
    callKey: String,
    remoteTrack: VideoTrack?,
    localTrack: VideoTrack?,
    eglContext: EglBase.Context,
    peerAvatarUrl: String?,
    reduceMotion: Boolean,
    onSwap: () -> Unit,
    onRevive: () -> Unit,
    selfTileMemory: CallSelfTileMemory,
    selfCamera: CallSelfCameraActions?,
    controlsVisible: Boolean,
    selfUserId: String,
    peerUserId: String,
    peerSpeech: CallPeerSpeechSource,
) {
    // Loi 17.1 — le micro coupé de l'autre paraît et repart en fondu (iOS `.transition(.opacity)`), court sous
    // « Réduire les animations ».
    AnimatedVisibility(
        visible = state.isPeerMuted && !featuresLocal,
        enter = fadeIn(tween(CallChromeStow.fadeMillis(reduceMotion))),
        exit = fadeOut(tween(CallChromeStow.fadeMillis(reduceMotion))),
        modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding().padding(top = MUTED_BADGE_TOP),
    ) {
        CallPeerMutedBadge(compact = false)
    }
    CallSelfTilePresence(
        visible = showsSelfTile,
        reduceMotion = reduceMotion,
        frame = { body ->
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
                // #17982 : la plaque dit qui la vignette montre ; permutée, le micro coupé de l'autre y précède son nom,
                // comme sur une tuile de groupe (P11.6).
                plate = CallSelfTileLaw.plate(showsPeer = featuresLocal, peerName = state.peerName),
                plateLeading = {
                    if (state.isPeerMuted && featuresLocal) {
                        Icon(MeeshyIcons.MicOff, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(CALL_TILE_PLATE_ICON))
                    }
                },
                modifier = Modifier.fillMaxSize(),
                overlay = { _ ->
                    if (showsMyImage && selfCamera != null) CallSelfTileZoomSlot(selfCamera.zoom, visible = controlsVisible)
                },
                content = body,
            )
        },
    ) {
        CallSelfTileBody(
            state = state,
            featuresLocal = featuresLocal,
            callKey = callKey,
            remoteTrack = remoteTrack,
            localTrack = localTrack,
            eglContext = eglContext,
            peerAvatarUrl = peerAvatarUrl,
            peerSpeech = peerSpeech,
        )
    }
}

/**
 * Loi 17.1 — ma vignette paraît et repart en fondu : à la connexion, au départ et au retour d'un cadre en direct. Une
 * `SurfaceView` ne se fond pas elle-même : le CADRE (liseré, ombre, plaque) fond d'abord sous un voile opaque, puis le voile se
 * lève sur ce qu'elle montre, monté seulement sous un voile qui n'est plus plein ; au départ, le voile retombe puis le cadre fond
 * ([CallRemoteVideoFade.presenceVeilDelayMillis], [CallRemoteVideoFade.presenceFrameDelayMillis]). Interruptible : un retour
 * pendant le départ repart de l'état courant. Opacité seule, lue au dessin ; deux fondus courts sous « Réduire les animations ».
 */
@Composable
private fun CallSelfTilePresence(
    visible: Boolean,
    reduceMotion: Boolean,
    frame: @Composable (content: @Composable BoxScope.() -> Unit) -> Unit,
    body: @Composable BoxScope.() -> Unit,
) {
    val millis = CallRemoteVideoFade.durationMillis(reduceMotion)
    val presence = remember { MutableTransitionState(false) }
    presence.targetState = visible
    val veil = remember { Animatable(1f) }
    LaunchedEffect(visible, millis) {
        delay(CallRemoteVideoFade.presenceVeilDelayMillis(reduceMotion, appearing = visible).toLong())
        veil.animateTo(if (visible) 0f else 1f, tween(millis, easing = LinearEasing))
    }
    val mounts by remember { derivedStateOf { CallRemoteVideoFade.mountsTileContent(veil.value) } }
    val veiled by remember { derivedStateOf { CallRemoteVideoFade.showsVeil(veil.value) } }
    AnimatedVisibility(
        visibleState = presence,
        modifier = Modifier.fillMaxSize(),
        enter = fadeIn(tween(millis, delayMillis = CallRemoteVideoFade.presenceFrameDelayMillis(reduceMotion, appearing = true))),
        exit = fadeOut(tween(millis, delayMillis = CallRemoteVideoFade.presenceFrameDelayMillis(reduceMotion, appearing = false))),
    ) {
        frame {
            if (mounts) body()
            if (veiled) Box(Modifier.matchParentSize().graphicsLayer { alpha = veil.value }.background(CallPalette.Veil))
        }
    }
}

/** Ce que montre ma vignette : l'image de l'autre une fois permutée, la tuile de survie, ou mon image et son corps caméra coupée. */
@Composable
private fun CallSelfTileBody(
    state: CallUiState,
    featuresLocal: Boolean,
    callKey: String,
    remoteTrack: VideoTrack?,
    localTrack: VideoTrack?,
    eglContext: EglBase.Context,
    peerAvatarUrl: String?,
    peerSpeech: CallPeerSpeechSource,
) {
    when {
        state.isCameraOn && state.isVideoAutoPaused && !featuresLocal -> CallVideoPausedTileBody()
        // Ma vignette ne se pose qu'une fois l'appel connecté : le média est établi.
        featuresLocal -> CallRemoteVideoStage(
            callKey = callKey,
            hasTrack = remoteTrack != null,
            peerVideoEnabled = !state.isPeerCameraOff,
            hasEstablishedMedia = true,
            track = remoteTrack,
            eglContext = eglContext,
            peerName = state.peerName,
            avatarUrl = peerAvatarUrl,
            modifier = Modifier.fillMaxSize(),
            compact = true,
            overlay = true,
            peerSpeech = peerSpeech,
        )
        else -> CallSelfTileFeed(cameraOn = state.isCameraOn, track = localTrack, eglContext = eglContext, mirror = state.mirrorsLocalPreview)
    }
}

/**
 * Loi 17.12 — ma caméra qui se coupe ou se rallume : mon image et le corps « caméra coupée » passent l'un à l'autre en fondu,
 * au rythme de [CallRemoteVideoFade] (plus court sous « Réduire les animations »). Le corps est un VOILE opaque (fond noir, G4) dont
 * l'opacité se lit au dessin ; mon image, détachée de la piste quand la caméra se coupe (gelée, jamais noire), reste montée dessous
 * jusqu'à ce qu'il la couvre ([CallRemoteVideoFade.keepsTileImage]).
 */
@Composable
private fun CallSelfTileFeed(cameraOn: Boolean, track: VideoTrack?, eglContext: EglBase.Context, mirror: Boolean) {
    val fade = tween<Float>(CallRemoteVideoFade.durationMillis(rememberCallReduceMotion()), easing = LinearEasing)
    val live = cameraOn && track != null
    val veil = animateFloatAsState(if (live) 0f else 1f, fade, label = "callSelfTileVeil")
    val keepsImage by remember(live) { derivedStateOf { CallRemoteVideoFade.keepsTileImage(live, veil.value) } }
    val showsBody by remember { derivedStateOf { CallRemoteVideoFade.showsVeil(veil.value) } }
    Box(Modifier.fillMaxSize()) {
        if (keepsImage) {
            VideoRenderer(track = track.takeIf { cameraOn }, eglContext = eglContext, modifier = Modifier.fillMaxSize(), mirror = mirror, overlay = true)
        }
        if (showsBody) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = veil.value }.background(CallPalette.Veil)) {
                CallSelfCameraOffBody()
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
