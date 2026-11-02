package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRemoteVideoSurface
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.EglBase
import org.webrtc.VideoTrack

private const val CAMERA_OFF_SCRIM_ALPHA = 0.85f
private const val CONNECTING_SCRIM_ALPHA = 0.4f
private const val AVATAR_FULL_DP = 96
private const val AVATAR_COMPACT_DP = 36

/**
 * L'image du correspondant, selon [surface] : le flux en direct, son avatar « Caméra désactivée »
 * (jamais l'image gelée ni un chargement sans fin), ou « Connexion vidéo… ». [compact] sert la
 * vignette (après une permutation) : avatar réduit, sans phrase.
 */
@Composable
internal fun CallRemoteVideoSurfaceView(
    surface: CallRemoteVideoSurface,
    track: VideoTrack?,
    eglContext: EglBase.Context,
    peerName: String,
    avatarUrl: String?,
    modifier: Modifier = Modifier,
    fit: Boolean = false,
    compact: Boolean = false,
    overlay: Boolean = false,
) {
    Box(modifier) {
        when {
            surface == CallRemoteVideoSurface.Live && track != null -> {
                val live = stringResource(R.string.call_stage_remote_live)
                VideoRenderer(
                    track = track,
                    eglContext = eglContext,
                    modifier = Modifier.fillMaxSize().semantics { contentDescription = live },
                    overlay = overlay,
                    fit = fit,
                )
            }
            surface == CallRemoteVideoSurface.Connecting -> CallRemoteConnectingPlaceholder(compact)
            else -> CallRemoteCameraOffPlaceholder(peerName, avatarUrl, compact)
        }
    }
}

/**
 * Pose la surface du pair avec son délai d'attente : sans image et sans annonce de caméra coupée,
 * l'attente dure [CallRemoteVideoSurface.WAIT_SECONDS] puis le pair est montré caméra coupée — et
 * TalkBack l'annonce une fois l'audio établi. [callKey] borne l'attente à son appel.
 */
@Composable
internal fun CallRemoteVideoStage(
    callKey: String,
    hasTrack: Boolean,
    peerVideoEnabled: Boolean,
    hasEstablishedMedia: Boolean,
    track: VideoTrack?,
    eglContext: EglBase.Context,
    peerName: String,
    avatarUrl: String?,
    modifier: Modifier = Modifier,
    fit: Boolean = false,
    compact: Boolean = false,
    overlay: Boolean = false,
) {
    var elapsedForCallKey by remember { mutableStateOf<String?>(null) }
    val surface = CallRemoteVideoSurface.resolve(
        hasTrack = hasTrack,
        peerVideoEnabled = peerVideoEnabled,
        waitElapsed = CallRemoteVideoSurface.isWaitElapsed(hasEstablishedMedia, elapsedForCallKey, callKey),
    )
    val established by rememberUpdatedState(hasEstablishedMedia)
    val announce = rememberCallAnnouncer()
    val context = LocalContext.current
    if (surface == CallRemoteVideoSurface.Connecting) {
        LaunchedEffect(callKey) {
            delay(CallRemoteVideoSurface.WAIT_SECONDS * 1_000)
            elapsedForCallKey = callKey
            if (established) announce(context.getString(R.string.call_stage_remote_off))
        }
    }
    CallRemoteVideoSurfaceView(surface, track, eglContext, peerName, avatarUrl, modifier, fit, compact, overlay)
}

/** Le pair a coupé sa caméra (ou n'envoie rien) : son avatar et « Caméra désactivée ». */
@Composable
internal fun CallRemoteCameraOffPlaceholder(peerName: String, avatarUrl: String?, compact: Boolean) {
    val label = stringResource(R.string.call_stage_remote_off)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CallPalette.Veil.copy(alpha = CAMERA_OFF_SCRIM_ALPHA))
            .semantics(mergeDescendants = true) { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        ) {
            CallAvatarDisc(
                name = peerName,
                size = (if (compact) AVATAR_COMPACT_DP else AVATAR_FULL_DP).dp,
                avatarUrl = avatarUrl,
                modifier = Modifier.clearAndSetSemantics { },
            )
            if (compact) {
                Icon(Icons.Filled.VideocamOff, contentDescription = null, tint = CallPalette.InkSecondary, modifier = Modifier.size(14.dp))
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.VideocamOff, contentDescription = null, tint = CallPalette.InkSecondary, modifier = Modifier.size(14.dp))
                    Text(
                        text = label,
                        style = MaterialTheme.typography.bodyMedium,
                        color = CallPalette.InkSecondary,
                    )
                }
            }
        }
    }
}

/** Pas encore d'image, mais l'attente n'est pas écoulée : « Connexion vidéo… » et un indicateur. */
@Composable
internal fun CallRemoteConnectingPlaceholder(compact: Boolean) {
    val label = stringResource(R.string.call_stage_remote_connecting)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CallPalette.Veil.copy(alpha = CONNECTING_SCRIM_ALPHA))
            .semantics(mergeDescendants = true) { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(if (compact) 18.dp else 28.dp).clearAndSetSemantics { },
                strokeWidth = 2.dp,
                color = CallPalette.InkSecondary,
            )
            if (!compact) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = CallPalette.InkMuted,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
