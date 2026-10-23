package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.profile.ProfileActionPlan
import me.meeshy.sdk.model.profile.ProfileConnectionAction
import me.meeshy.sdk.model.profile.ProfileContextBanner
import me.meeshy.sdk.model.profile.ProfileLayout
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** The gestures of the action section, so the section stays a pure projection of the plan. */
internal data class ProfileActionCallbacks(
    val onSendMessage: () -> Unit,
    val onRequest: () -> Unit,
    val onCancel: () -> Unit,
    val onResend: () -> Unit,
    val onAccept: () -> Unit,
    val onDecline: () -> Unit,
    val onBlock: () -> Unit,
    val onUnblock: () -> Unit,
    val onReport: () -> Unit,
)

/**
 * The action section of someone else's profile — mirror of `UserProfileSheet.actionButtons`
 * (iOS): « Envoyer un message » first, then the context of a pending request, the connection
 * buttons, block / unblock and report. A person I blocked shows only the blocked card.
 */
@Composable
internal fun ProfileActionsSection(
    plan: ProfileActionPlan,
    displayName: String,
    isOpeningConversation: Boolean,
    callbacks: ProfileActionCallbacks,
) {
    if (plan.layout == ProfileLayout.BLOCKED_BY_ME) {
        BlockedByMeCard(onUnblock = callbacks.onUnblock)
        return
    }
    if (plan.layout == ProfileLayout.CLOSED) return
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (plan.canMessage) SendMessageButton(isOpening = isOpeningConversation, onClick = callbacks.onSendMessage)
        plan.contextBanner?.let { ConnectionContextRow(banner = it, name = displayName) }
        plan.connectionActions.forEach { ConnectionActionButton(action = it, callbacks = callbacks) }
        if (plan.showsConnectedBanner) ConnectedPill()
        if (plan.canBlock) {
            ProfileActionButton(
                icon = Icons.Filled.Block,
                label = stringResource(R.string.profile_action_block_user),
                color = MeeshyPalette.Error,
                onClick = callbacks.onBlock,
            )
        }
        if (plan.canReport) {
            ProfileActionButton(
                icon = Icons.Filled.Flag,
                label = stringResource(R.string.profile_action_report),
                color = MeeshyPalette.Warning,
                onClick = callbacks.onReport,
            )
        }
    }
}

@Composable
private fun ConnectionActionButton(action: ProfileConnectionAction, callbacks: ProfileActionCallbacks) {
    val muted = MeeshyTheme.tokens.textSecondary
    when (action) {
        ProfileConnectionAction.REQUEST -> ProfileActionButton(
            Icons.Filled.PersonAdd, stringResource(R.string.profile_action_connection_request), MeeshyPalette.Indigo500, callbacks.onRequest,
        )
        ProfileConnectionAction.CANCEL -> ProfileActionButton(
            Icons.Filled.Cancel, stringResource(R.string.profile_action_cancel_request), muted, callbacks.onCancel,
        )
        ProfileConnectionAction.RESEND -> ProfileActionButton(
            Icons.Filled.Refresh, stringResource(R.string.profile_action_resend_request), MeeshyPalette.Indigo500, callbacks.onResend,
        )
        ProfileConnectionAction.ACCEPT -> ProfileActionButton(
            Icons.Filled.CheckCircle, stringResource(R.string.profile_action_accept_connection), MeeshyPalette.Success, callbacks.onAccept,
        )
        ProfileConnectionAction.DECLINE -> ProfileActionButton(
            Icons.Filled.Cancel, stringResource(R.string.profile_action_decline_connection), muted, callbacks.onDecline,
        )
    }
}

@Composable
private fun SendMessageButton(isOpening: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(Brush.horizontalGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo400)))
            .clickable(enabled = !isOpening, role = Role.Button, onClick = onClick)
            .padding(vertical = MeeshySpacing.md),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isOpening) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
        } else {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.profile_action_send_message),
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}

@Composable
private fun ProfileActionButton(icon: ImageVector, label: String, color: Color, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(color.copy(alpha = 0.10f))
            .border(1.dp, color.copy(alpha = 0.25f), shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(text = label, color = color, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ConnectionContextRow(banner: ProfileContextBanner, name: String) {
    val (icon, text) = when (banner) {
        ProfileContextBanner.RECEIVED -> Icons.Filled.PersonAdd to stringResource(R.string.profile_connection_context_received, name)
        ProfileContextBanner.SENT -> Icons.Filled.Schedule to stringResource(R.string.profile_connection_context_sent, name)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.10f))
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
    }
}

@Composable
private fun ConnectedPill() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MeeshyPalette.Success.copy(alpha = 0.12f))
            .padding(vertical = MeeshySpacing.md),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MeeshyPalette.Success, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.profile_status_connected),
            color = MeeshyPalette.Success,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun BlockedByMeCard(onUnblock: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.profile_blocked_by_me),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Text(
            text = stringResource(R.string.profile_blocked_unblock),
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .clip(CircleShape)
                .background(MeeshyPalette.Success)
                .clickable(role = Role.Button, onClick = onUnblock)
                .heightIn(min = 44.dp)
                .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.md),
        )
    }
}
