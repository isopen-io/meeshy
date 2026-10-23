package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val PAIR_AVATAR_SIZE = 120.dp
private const val PILL_BACKGROUND_ALPHA = 0.15f
private const val LOCAL_BADGE_RATIO = 0.4f
private val LOCAL_BADGE_MIN = 44.dp

/**
 * La disposition AUDIO de l'appel établi (miroir de iOS `audioCallLayout`) : la paire d'avatars de
 * 120 dp (le correspondant et, en pastille, soi), son nom, la durée, puis les pastilles de statut —
 * reconnexion, contact en sourdine, « Réseau faible (contact) » et « Serveur déconnecté ». Les
 * pastilles n'existent que tant que leur cause dure.
 *
 * [signalingDegraded] vient de la couture de signalisation (`false` tant que rien ne l'alimente).
 */
@Composable
internal fun CallAudioStage(
    state: CallUiState,
    peerAvatarUrl: String?,
    modifier: Modifier = Modifier,
    signalingDegraded: Boolean = false,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        CallAvatarPair(name = state.peerName, avatarUrl = peerAvatarUrl, size = PAIR_AVATAR_SIZE)
        Text(
            text = callPeerTitle(state.peerName),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
        )
        state.durationLabel?.let { clock -> CallStageDuration(clock, state.durationSeconds) }
        CallStagePills(state, signalingDegraded)
    }
}

/** Le correspondant et, en pastille au coin bas-fin, soi : décoratif, le nom est lu par le texte voisin. */
@Composable
internal fun CallAvatarPair(name: String, avatarUrl: String?, size: Dp, modifier: Modifier = Modifier) {
    val badge = maxOf(LOCAL_BADGE_MIN, size * LOCAL_BADGE_RATIO)
    Box(modifier = modifier.clearAndSetSemantics { }) {
        CallAvatarDisc(name = name, size = size, avatarUrl = avatarUrl)
        CallAvatarDisc(
            name = stringResource(R.string.call_avatar_you),
            size = badge,
            avatarUrl = null,
            modifier = Modifier.align(Alignment.BottomEnd).offset(x = badge * 0.22f, y = badge * 0.12f),
        )
    }
}

@Composable
private fun CallStageDuration(clock: String, seconds: Long) {
    val resources = LocalContext.current.resources
    val description = stringResource(R.string.call_duration_a11y)
    val spoken = remember(seconds, resources) { CallSpokenDuration.spoken(resources, seconds) }
    Text(
        text = clock,
        style = MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Medium,
        color = CallPalette.Brand,
        modifier = Modifier
            .background(CallPalette.Brand.copy(alpha = PILL_BACKGROUND_ALPHA), CircleShape)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xsPlus)
            .semantics {
                contentDescription = description
                stateDescription = spoken
            },
    )
}

@Composable
private fun CallStagePills(state: CallUiState, signalingDegraded: Boolean) {
    val warning = MeeshyTheme.tokens.warning
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (state.status == CallStatus.RECONNECTING) {
            CallStatusPill(Icons.Filled.Sync, stringResource(R.string.call_status_reconnecting, state.reconnectAttempt), warning)
        }
        if (state.isPeerMuted) {
            CallStatusPill(Icons.Filled.MicOff, stringResource(R.string.call_stage_peer_muted), CallPalette.InkSecondary)
        }
        if (state.isPeerQualityDegraded) {
            CallStatusPill(Icons.Filled.WifiOff, stringResource(R.string.call_stage_peer_network), warning)
        }
        if (signalingDegraded) {
            CallStatusPill(Icons.Filled.CloudOff, stringResource(R.string.call_stage_signaling), warning)
        }
    }
}

/** Une pastille de statut : icône et texte teintés, sur une capsule à 15 % de la même teinte. */
@Composable
internal fun CallStatusPill(icon: ImageVector, text: String, color: Color) {
    Row(
        modifier = Modifier
            .background(color.copy(alpha = PILL_BACKGROUND_ALPHA), CircleShape)
            .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs)
            .semantics(mergeDescendants = true) { },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(12.dp))
        Text(text = text, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = color)
    }
}
