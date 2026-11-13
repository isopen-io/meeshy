package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
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
import me.meeshy.sdk.model.call.CallAudioStageLayout
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val PAIR_AVATAR_SIZE = CallAudioStageLayout.FULL_AVATAR_DP.dp
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
    peer: CallPeerVisual,
    modifier: Modifier = Modifier,
    signalingDegraded: Boolean = false,
    /** D'où vient « le pair parle » : l'anneau et le halo de sa couleur n'existent qu'à la parole (P9). */
    peerSpeech: CallPeerSpeechSource = CallPeerSpeechSource.NONE,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        CallAvatarPair(
            name = state.peerName,
            peer = peer,
            size = PAIR_AVATAR_SIZE,
            peerSpeech = peerSpeech,
        )
        Text(
            text = callPeerTitle(state.peerName),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
        )
        state.durationLabel?.let { clock -> CallStageDuration(clock, state.durationSeconds, live = state.hasLiveClock) }
        CallStagePills(state, signalingDegraded)
    }
}

/** Le correspondant et, en pastille au coin bas-fin, soi : décoratif, le nom est lu par le texte voisin. */
@Composable
internal fun CallAvatarPair(
    name: String,
    peer: CallPeerVisual,
    size: Dp,
    modifier: Modifier = Modifier,
    /** Sa couleur d'auteur ([CallTileRim.peerFace]) et sa parole : l'anneau et le halo fondent à l'opacité ; au repos, rien. */
    peerSpeech: CallPeerSpeechSource = CallPeerSpeechSource.NONE,
) {
    val badge = maxOf(LOCAL_BADGE_MIN, size * LOCAL_BADGE_RATIO)
    val reach = callSpeakingReach(compact = false)
    Box(modifier = modifier.clearAndSetSemantics { }) {
        CallSpeakingAvatar(
            name = name,
            size = size,
            avatarUrl = peer.avatarUrl,
            colorHex = CallTileRim.peerFace(peerSpeech.peerUserId),
            speaking = rememberPeerSpeaking(peerSpeech),
            reduceMotion = rememberCallReduceMotion(),
            compact = false,
            ring = peer.ring,
        )
        CallAvatarDisc(
            name = peer.localBadgeName(stringResource(R.string.call_avatar_you)),
            size = badge,
            avatarUrl = peer.selfAvatarUrl,
            modifier = Modifier.align(Alignment.BottomEnd).offset(x = badge * 0.22f - reach, y = badge * 0.12f - reach),
        )
    }
}

/**
 * La durée de l'appel, lue « Durée de l'appel » puis son temps parlé. [compact] : la ligne de l'en-tête compact
 * (#17529, iOS `CallCompactAudioHeader`), sans capsule, en chiffres tabulaires.
 */
@Composable
internal fun CallStageDuration(fixedClock: String, fixedSeconds: Long, live: Boolean, compact: Boolean = false) {
    val seconds = liveOrFixedSeconds(live, LocalCallLiveSeconds.current, fixedSeconds)
    val clock = if (live) clockLabel(seconds) else fixedClock
    val resources = LocalContext.current.resources
    val description = stringResource(R.string.call_duration_a11y)
    val spoken = remember(seconds, resources) { CallSpokenDuration.spoken(resources, seconds) }
    val capsule = if (compact) {
        Modifier
    } else {
        Modifier
            .background(CallPalette.Brand.copy(alpha = PILL_BACKGROUND_ALPHA), CircleShape)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xsPlus)
    }
    Text(
        text = clock,
        style = if (compact) MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum") else MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Medium,
        color = CallPalette.Brand,
        modifier = capsule
            .semantics {
                contentDescription = description
                stateDescription = spoken
            },
    )
}

@Composable
internal fun CallStagePills(
    state: CallUiState,
    signalingDegraded: Boolean,
    horizontalAlignment: Alignment.Horizontal = Alignment.CenterHorizontally,
) {
    val warning = MeeshyTheme.tokens.warning
    Column(
        horizontalAlignment = horizontalAlignment,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (state.status == CallStatus.RECONNECTING) {
            CallStatusPill(Icons.Filled.Sync, stringResource(R.string.call_status_reconnecting, state.reconnectAttempt), warning)
        }
        if (state.isPeerMuted) {
            CallStatusPill(Icons.Filled.MicOff, stringResource(R.string.call_stage_peer_muted), CallPalette.InkSecondary)
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

/**
 * #17945 (B), loi 11 — le fond derrière l'avatar d'un duo audio : un toucher y range l'en-tête, la pilule et le journal
 * (l'avatar regrandit à 120 dp, [CallAudioStageLayout]), un nouveau toucher les rend. Posé SOUS la colonne de l'appel,
 * comme le toucher de la scène vidéo : un bouton touché répond toujours, seul l'espace libre arrive ici. Muet pour
 * TalkBack, qui ne range jamais les contrôles (l'écran ne le pose alors pas).
 */
@Composable
internal fun CallAudioSceneTapTarget(onTap: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxSize()
            .pointerInput(onTap) { detectTapGestures(onTap = { onTap() }) }
            .clearAndSetSemantics { },
    )
}
