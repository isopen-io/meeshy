package me.meeshy.app.profile

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.profile.ProfileActionPlan
import me.meeshy.sdk.model.profile.ProfileConnectionAction
import me.meeshy.sdk.model.profile.ProfileContextBanner
import me.meeshy.sdk.model.profile.ProfileLayout
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.pressable
import me.meeshy.ui.theme.MeeshyMotion
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
    val onCall: ((isVideo: Boolean) -> Unit)? = null,
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
    val reduceMotion = LocalReduceMotion.current
    val sizeSpec: FiniteAnimationSpec<IntSize> =
        if (reduceMotion) snap() else spring(dampingRatio = 0.85f, stiffness = MeeshyMotion.stiffnessForResponse(0.35f))
    val connection = remember(plan.contextBanner, plan.connectionActions, plan.showsConnectedBanner) {
        ConnectionGroup(plan.contextBanner, plan.connectionActions, plan.showsConnectedBanner)
    }
    Column(
        modifier = Modifier.fillMaxWidth().animateContentSize(sizeSpec),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (plan.canMessage) SendMessageButton(isOpening = isOpeningConversation, onClick = callbacks.onSendMessage)
        val onCall = callbacks.onCall
        if (plan.offersCall && onCall != null) CallButtons(enabled = !isOpeningConversation, onCall = onCall)
        AnimatedContent(
            targetState = connection,
            transitionSpec = { connectionTransition(reduceMotion) },
            label = "profile-connection",
        ) { group ->
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                group.banner?.let { ConnectionContextRow(banner = it, name = displayName) }
                group.actions.forEach { ConnectionActionButton(action = it, callbacks = callbacks) }
                if (group.showsConnected) ConnectedPill()
            }
        }
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

/** L'état de la relation tel que la fiche le peint : sa clé d'animation, une transition par changement. */
private data class ConnectionGroup(
    val banner: ProfileContextBanner?,
    val actions: List<ProfileConnectionAction>,
    val showsConnected: Boolean,
)

private fun connectionTransition(reduceMotion: Boolean): ContentTransform {
    if (reduceMotion) return fadeIn(snap()) togetherWith fadeOut(snap())
    val spec = spring<Float>(dampingRatio = 0.85f, stiffness = MeeshyMotion.stiffnessForResponse(0.35f))
    return (fadeIn(spec) + scaleIn(spec, initialScale = 0.96f)) togetherWith fadeOut(spec)
}

/** Appel vocal et appel vidéo côte à côte (miroir de `callButtons` iOS). */
@Composable
private fun CallButtons(enabled: Boolean, onCall: (isVideo: Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        ProfileActionButton(
            icon = MeeshyIcons.Call,
            label = stringResource(R.string.profile_action_call_audio),
            color = MeeshyPalette.Indigo500,
            enabled = enabled,
            modifier = Modifier.weight(1f),
            onClick = { onCall(false) },
        )
        ProfileActionButton(
            icon = MeeshyIcons.Video,
            label = stringResource(R.string.profile_action_call_video),
            color = MeeshyPalette.Indigo500,
            enabled = enabled,
            modifier = Modifier.weight(1f),
            onClick = { onCall(true) },
        )
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
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pressable()
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(Brush.horizontalGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo400)))
            .clickable(enabled = !isOpening, role = Role.Button) {
                haptics.medium()
                onClick()
            }
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
private fun ProfileActionButton(
    icon: ImageVector,
    label: String,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val shape = RoundedCornerShape(12.dp)
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .pressable()
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(color.copy(alpha = 0.10f))
            .border(1.dp, color.copy(alpha = 0.25f), shape)
            .clickable(enabled = enabled, role = Role.Button) {
                haptics.medium()
                onClick()
            }
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
        val haptics = rememberMeeshyHaptics()
        Text(
            text = stringResource(R.string.profile_blocked_unblock),
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .pressable()
                .clip(CircleShape)
                .background(MeeshyPalette.Success)
                .clickable(role = Role.Button) {
                    haptics.light()
                    onUnblock()
                }
                .heightIn(min = 44.dp)
                .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.md),
        )
    }
}
