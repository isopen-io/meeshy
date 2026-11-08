package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.CallHeaderPresentation
import me.meeshy.sdk.model.call.CallHeaderSnapshot
import me.meeshy.sdk.model.call.HeaderCallEntry
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La place d'appel de l'en-tête (iOS `ConversationHeaderCallSlot`) : menu vocal / vidéo au repos,
 * pastille verte « Toucher pour revenir » avec la durée pendant un appel d'ici, « Rejoindre »
 * quand l'appel vit côté serveur. [HeaderCallEntry.canStart] `false` : « Rejoindre » seul.
 * Jamais un second appel depuis l'en-tête.
 */
@Composable
internal fun ChatHeaderCallSlot(
    conversationId: String,
    entry: HeaderCallEntry?,
    serverActiveCall: ActiveCallSession?,
    localCall: ChatLocalCall,
    hasLocalLiveCall: Boolean,
    isGroup: Boolean,
    calleeName: String,
    accentColor: Color,
    onStartCall: (isVideo: Boolean) -> Unit,
    onRejoinCall: (ActiveCallSession) -> Unit,
) {
    if (entry == null) return
    val snapshot = localCall.snapshot.takeIf { it.isActive }
        ?: CallHeaderSnapshot(isActive = hasLocalLiveCall, conversationId = null)
    when (val presentation = CallHeaderPresentation.resolve(snapshot, serverActiveCall, entry.canStart, conversationId)) {
        CallHeaderPresentation.None -> Unit
        CallHeaderPresentation.Start -> ChatHeaderCallButton(isGroup = isGroup, accentColor = accentColor, onCall = onStartCall)
        CallHeaderPresentation.ReturnToCall -> ReturnToCallPill(localCall)
        is CallHeaderPresentation.Rejoin -> RejoinCallPill(
            isVideo = presentation.call.isVideo,
            onClick = { onRejoinCall(presentation.call) },
        )
    }
}

/** La pastille verte d'un appel en cours ici : point, combiné, durée vivante — un toucher revient à l'appel. */
@Composable
internal fun ReturnToCallPill(localCall: ChatLocalCall) {
    val duration by localCall.duration.collectAsStateWithLifecycle(initialValue = null)
    val success = MeeshyTheme.tokens.success
    val haptic = LocalHapticFeedback.current
    val shape = RoundedCornerShape(percent = 50)
    val description = stringResource(R.string.chat_call_return)
    Row(
        modifier = Modifier
            .padding(end = MeeshySpacing.sm)
            .defaultMinSize(minHeight = 48.dp)
            .clip(shape)
            .background(success.copy(alpha = 0.15f), shape)
            .border(1.dp, success.copy(alpha = 0.3f), shape)
            .clickable(role = Role.Button) {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                localCall.onReturn()
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .clearAndSetSemantics {
                contentDescription = description
                role = Role.Button
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).background(success, CircleShape))
        Spacer(Modifier.width(MeeshySpacing.xs))
        Icon(MeeshyIcons.Call, contentDescription = null, tint = success, modifier = Modifier.size(14.dp))
        duration?.let {
            Spacer(Modifier.width(MeeshySpacing.xs))
            Text(text = it, style = MaterialTheme.typography.labelMedium, color = success)
        }
    }
}
