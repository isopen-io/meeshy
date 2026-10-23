package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallStatusLabelLaw
import me.meeshy.sdk.model.call.OutgoingRingingLabel
import me.meeshy.ui.theme.MeeshySpacing

private const val FADE_MILLIS = 300
private const val ENDED_AVATAR_ALPHA = 0.6f

/** Le nom du contact, ou « Inconnu » quand l'appel n'en porte pas. */
@Composable
internal fun callPeerTitle(name: String): String = name.ifBlank { stringResource(R.string.call_unknown_peer) }

@Composable
private fun CallPeerTitle(name: String) {
    Text(
        text = callPeerTitle(name),
        style = MaterialTheme.typography.headlineMedium,
        fontWeight = FontWeight.SemiBold,
        color = CallPalette.Ink,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun callTypeLabel(isVideo: Boolean): String =
    stringResource(if (isVideo) R.string.call_type_video else R.string.call_type_audio)

/**
 * La sonnerie sortante, SANS état : « Appel en cours… » (ou, à [label] `WaitingForPeer`,
 * « En attente du correspondant… » avec son sous-texte, en fondu de 0,3 s), la pastille de
 * type d'appel, puis « Raccrocher ». C'est le test qui lui passe le [label].
 */
@Composable
internal fun CallOutgoingRingingBody(
    state: CallUiState,
    label: OutgoingRingingLabel,
    peer: CallPeerVisual,
    reduceMotion: Boolean,
    onHangUp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val fade = if (reduceMotion) 0 else FADE_MILLIS
    Column(
        modifier = modifier.fillMaxSize().padding(bottom = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CallPulsingAvatar(name = state.peerName, peer = peer, reduceMotion = reduceMotion)
        Spacer(Modifier.height(MeeshySpacing.xxl))
        CallPeerTitle(state.peerName)
        Spacer(Modifier.height(MeeshySpacing.sm))
        Crossfade(targetState = label, animationSpec = tween(fade), label = "ringing-label") { current ->
            Text(
                text = stringResource(
                    if (current == OutgoingRingingLabel.WaitingForPeer) R.string.call_outgoing_waiting
                    else R.string.call_outgoing_ringing,
                ),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = CallPalette.InkSecondary,
                textAlign = TextAlign.Center,
            )
        }
        AnimatedVisibility(
            visible = CallStatusLabelLaw.showsHint(label),
            enter = fadeIn(tween(fade)),
        ) {
            Text(
                text = stringResource(R.string.call_outgoing_waiting_hint),
                style = MaterialTheme.typography.labelSmall,
                color = CallPalette.InkMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
        Spacer(Modifier.height(MeeshySpacing.lg))
        CallTypeBadge(isVideo = state.isVideoCall, label = callTypeLabel(state.isVideoCall))
        Spacer(Modifier.height(MeeshySpacing.xxxl))
        CallCircleButton(
            icon = Icons.Filled.CallEnd,
            background = CallPalette.Decline,
            contentDescription = stringResource(R.string.call_action_hang_up),
            onClick = onHangUp,
        )
    }
}

/** La sonnerie sortante : tient l'horloge des 6 s et annonce le passage à l'attente à TalkBack. */
@Composable
internal fun CallOutgoingRingingScreen(
    state: CallUiState,
    peer: CallPeerVisual,
    reduceMotion: Boolean,
    onHangUp: () -> Unit,
) {
    var secondsRinging by remember { mutableStateOf(0L) }
    LaunchedEffect(Unit) {
        delay(CallStatusLabelLaw.SLOW_THRESHOLD_SECONDS * 1_000)
        secondsRinging = CallStatusLabelLaw.SLOW_THRESHOLD_SECONDS
    }
    val label = CallStatusLabelLaw.outgoing(secondsRinging)
    val context = LocalContext.current
    val announce = rememberCallAnnouncer()
    LaunchedEffect(label) {
        if (label == OutgoingRingingLabel.WaitingForPeer) announce(context.getString(R.string.call_outgoing_waiting))
    }
    CallOutgoingRingingBody(state, label, peer, reduceMotion, onHangUp)
}

/** L'écran de connexion : avatar, nom, pastille de progression « Connexion… », raccrocher. */
@Composable
internal fun CallConnectingScreen(
    state: CallUiState,
    peer: CallPeerVisual,
    reduceMotion: Boolean,
    onHangUp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(bottom = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CallPulsingAvatar(name = state.peerName, peer = peer, reduceMotion = reduceMotion)
        Spacer(Modifier.height(MeeshySpacing.xxl))
        CallPeerTitle(state.peerName)
        Spacer(Modifier.height(MeeshySpacing.sm))
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.semantics(mergeDescendants = true) { },
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp).clearAndSetSemantics { },
                strokeWidth = 2.dp,
                color = CallPalette.Brand,
            )
            Text(
                text = stringResource(R.string.call_connecting_label),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = CallPalette.InkSecondary,
            )
        }
        Spacer(Modifier.height(60.dp))
        CallCircleButton(
            icon = Icons.Filled.CallEnd,
            background = CallPalette.Decline,
            contentDescription = stringResource(R.string.call_action_hang_up),
            onClick = onHangUp,
        )
    }
}

/**
 * Le panneau de fin : avatar à 60 %, nom, motif parmi les six, durée finale PARLÉE par TalkBack,
 * et « Réessayer » en capsule verte libellée — seulement pour un échec transitoire ([CallUiState.canRetry]).
 * Sans réessai, l'hôte ferme le panneau de lui-même après 1,5 s.
 */
@Composable
internal fun CallEndedPanel(
    state: CallUiState,
    peer: CallPeerVisual,
    onRetry: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val resources = LocalContext.current.resources
    Column(
        modifier = modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg, Alignment.CenterVertically),
    ) {
        CallAvatarDisc(
            name = state.peerName,
            size = 100.dp,
            avatarUrl = peer.avatarUrl,
            ring = peer.ring,
            modifier = Modifier.alpha(ENDED_AVATAR_ALPHA).clearAndSetSemantics { },
        )
        Text(
            text = callPeerTitle(state.peerName),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.InkSecondary,
        )
        Text(
            text = endedLabel(state.endReason),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = CallPalette.InkSecondary,
            textAlign = TextAlign.Center,
        )
        state.durationLabel?.let { clock ->
            val description = stringResource(R.string.call_duration_a11y)
            val spoken = remember(state.durationSeconds, resources) {
                CallSpokenDuration.spoken(resources, state.durationSeconds)
            }
            Text(
                text = clock,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = CallPalette.InkSecondary,
                modifier = Modifier.semantics {
                    contentDescription = description
                    stateDescription = spoken
                },
            )
        }
        if (state.canRetry) {
            CallRetryCapsule(onClick = onRetry)
            Text(
                text = stringResource(R.string.call_action_close),
                style = MaterialTheme.typography.bodyMedium,
                color = CallPalette.InkMuted,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp)
                    .clickable(role = Role.Button, onClick = onClose)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            )
        }
    }
}

@Composable
private fun CallRetryCapsule(onClick: () -> Unit) {
    val label = stringResource(R.string.call_action_retry)
    Row(
        modifier = Modifier
            .defaultMinSize(minHeight = 48.dp)
            .clip(CircleShape)
            .background(CallPalette.Accept)
            .clickable(onClickLabel = label, role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.md)
            .semantics { role = Role.Button },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Refresh, contentDescription = null, tint = CallPalette.Ink)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
        )
    }
}
