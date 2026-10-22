package me.meeshy.app.calls

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.background
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallSelfTileMemory
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import org.webrtc.EglBase
import org.webrtc.VideoTrack

private const val PAUSED_SCRIM_ALPHA = 0.85f
private val MUTED_BADGE_TOP = 52.dp

/**
 * La scène vidéo du duo (miroir de iOS `videoCallLayout` + `duoOverlays`). Connecté : la vidéo du
 * correspondant occupe tout l'écran — son avatar « Caméra désactivée » s'il n'envoie rien — et ma
 * vignette flotte par-dessus ; toucher la vignette permute les deux. Avant la connexion, mon aperçu
 * tient tout le fond. Le flux d'un pair qui escalade l'audio en vidéo s'affiche même caméra locale coupée.
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
    modifier: Modifier = Modifier,
    selfTileMemory: CallSelfTileMemory = CallSelfTileMemories.shared,
) {
    Box(modifier.fillMaxSize()) {
        if (!connected) {
            localTrack?.let { local ->
                VideoRenderer(track = local, eglContext = eglContext, modifier = Modifier.fillMaxSize(), mirror = true)
            }
        } else {
            var swapped by remember(callKey) { mutableStateOf(false) }
            val featuresLocal = swapped && localTrack != null
            val fit = rememberCallVideoFit()
            if (featuresLocal && localTrack != null) {
                VideoRenderer(track = localTrack, eglContext = eglContext, modifier = Modifier.fillMaxSize(), mirror = true, fit = fit)
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
                )
            }
            if (state.isPeerMuted && !featuresLocal) {
                CallPeerMutedBadge(
                    compact = false,
                    modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding().padding(top = MUTED_BADGE_TOP),
                )
            }
            if (state.isCameraOn && (localTrack != null || state.isVideoAutoPaused)) {
                CallSelfTile(
                    callKey = callKey,
                    memory = selfTileMemory,
                    paused = state.isVideoAutoPaused,
                    reduceMotion = reduceMotion,
                    onSwap = { if (localTrack != null) swapped = !swapped },
                    modifier = Modifier.fillMaxSize(),
                    overlay = {
                        if (state.isPeerMuted && featuresLocal) {
                            CallPeerMutedBadge(
                                compact = true,
                                modifier = Modifier.align(Alignment.BottomStart).padding(MeeshySpacing.xs),
                            )
                        }
                    },
                ) {
                    when {
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
                        )
                        localTrack != null -> VideoRenderer(
                            track = localTrack,
                            eglContext = eglContext,
                            modifier = Modifier.fillMaxSize(),
                            mirror = true,
                            overlay = true,
                        )
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
