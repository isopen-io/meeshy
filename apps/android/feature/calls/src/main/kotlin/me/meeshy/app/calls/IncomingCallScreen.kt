package me.meeshy.app.calls

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.pressable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'appel entrant plein écran (iOS `IncomingCallView`) : anneaux et avatar qui rebondit, le nom,
 * « Appel (vidéo) entrant », la pastille de type, puis Refuser (rouge) et Répondre (vert, comme
 * iOS `MeeshyColors.success`), chacun avec un retour haptique. Le tri des permissions est fait par l'hôte
 * ([onAccept] est déjà l'accepter-sous-permissions). L'arrivée est annoncée à TalkBack.
 */
@Composable
internal fun IncomingCallScreen(
    state: CallUiState,
    peer: CallPeerVisual,
    reduceMotion: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    modifier: Modifier = Modifier,
    onDeclineWithMessage: ((String) -> Unit)? = null,
) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val announce = rememberCallAnnouncer()
    val title = callPeerTitle(state.peerName)
    val typeLabel = stringResource(if (state.isVideoCall) R.string.call_incoming_video else R.string.call_incoming_audio)

    var declineSheetOpen by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        announce(context.getString(R.string.call_incoming_a11y, typeLabel, title))
    }

    Column(
        modifier = modifier.fillMaxSize().padding(bottom = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        IncomingCallRings(name = state.peerName, peer = peer, reduceMotion = reduceMotion)
        Spacer(Modifier.height(MeeshySpacing.xxxl))
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(MeeshySpacing.sm))
        Text(
            text = typeLabel,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = CallPalette.InkSecondary,
        )
        Spacer(Modifier.height(MeeshySpacing.md))
        CallTypeBadge(
            isVideo = state.isVideoCall,
            label = stringResource(
                if (state.isVideoCall) R.string.call_incoming_badge_video else R.string.call_incoming_badge_audio,
            ),
        )
        Spacer(Modifier.weight(1f))
        if (onDeclineWithMessage != null) {
            DeclineWithMessageButton(
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    declineSheetOpen = true
                },
            )
            Spacer(Modifier.height(MeeshySpacing.xl))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(60.dp), verticalAlignment = Alignment.Top) {
            IncomingAction(
                icon = Icons.Filled.CallEnd,
                tint = CallPalette.Decline,
                caption = stringResource(R.string.call_incoming_decline),
                description = stringResource(R.string.call_action_decline),
                hint = stringResource(R.string.call_incoming_decline_hint),
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onDecline()
                },
            )
            IncomingAction(
                icon = if (state.isVideoCall) Icons.Filled.Videocam else Icons.Filled.Call,
                tint = CallPalette.Accept,
                caption = stringResource(R.string.call_incoming_accept),
                description = stringResource(R.string.call_action_accept),
                hint = stringResource(R.string.call_incoming_accept_hint),
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onAccept()
                },
            )
        }
    }

    if (declineSheetOpen && onDeclineWithMessage != null) {
        CallDeclineSheet(
            reduceMotion = reduceMotion,
            onSend = { text ->
                declineSheetOpen = false
                onDeclineWithMessage(text)
            },
            onDismiss = { declineSheetOpen = false },
        )
    }
}

/** « Message » : la capsule de verre qui ouvre les réponses rapides (iOS `declineWithMessageButton`). */
@Composable
private fun DeclineWithMessageButton(onClick: () -> Unit) {
    val label = stringResource(R.string.call_decline_open)
    val description = stringResource(R.string.call_decline_open_label)
    val hint = stringResource(R.string.call_decline_open_hint)
    Row(
        modifier = Modifier
            .pressable()
            .defaultMinSize(minHeight = 48.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.16f))
            .clickable(onClickLabel = hint, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description }
            .padding(horizontal = MeeshySpacing.xl),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(MeeshyIcons.MessageFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = Color.White,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

@Composable
private fun IncomingAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: androidx.compose.ui.graphics.Color,
    caption: String,
    description: String,
    hint: String,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        CallCircleButton(
            icon = icon,
            background = tint,
            contentDescription = "$description. $hint",
            onClick = onClick,
        )
        Spacer(Modifier.height(MeeshySpacing.smPlus))
        Text(
            text = caption,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = tint,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}
