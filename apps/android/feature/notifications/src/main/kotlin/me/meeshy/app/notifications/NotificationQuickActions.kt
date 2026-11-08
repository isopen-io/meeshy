package me.meeshy.app.notifications

import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal fun quickActionTestTag(action: NotificationQuickAction, notificationId: String): String = when (action) {
    is NotificationQuickAction.Connect -> "notification.quick.connect.$notificationId"
    is NotificationQuickAction.Write -> "notification.quick.write.$notificationId"
}

/**
 * Les gestes sous la rangée — hors du bouton de la rangée (un bouton dans un bouton ne reçoit pas ses
 * touches), alignés sur le texte : retrait 16 + 44 + 12, marge basse md. « Se connecter » devient
 * « Demande envoyée », inactif, dès qu'il est parti.
 */
@Composable
internal fun QuickActionsRow(
    notification: ApiNotification,
    actions: List<NotificationQuickAction>,
    isConnectRequested: Boolean,
    onQuickAction: (ApiNotification, NotificationQuickAction) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.lg + 44.dp + MeeshySpacing.md, end = MeeshySpacing.lg, bottom = MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        actions.forEach { action ->
            val sent = action is NotificationQuickAction.Connect && isConnectRequested
            QuickActionChip(
                tag = quickActionTestTag(action, notification.id),
                label = stringResource(action.labelRes(sent)),
                icon = action.icon(sent),
                isPrimary = action is NotificationQuickAction.Connect && !sent,
                enabled = !sent,
                onClick = { onQuickAction(notification, action) },
            )
        }
    }
}

@Composable
private fun QuickActionChip(tag: String, label: String, icon: ImageVector, isPrimary: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val container by animateColorAsState(
        if (isPrimary) MeeshyPalette.Indigo600 else MeeshyPalette.Indigo500.copy(alpha = 0.12f),
        tween(200),
        label = "quick-action-container",
    )
    val content = if (isPrimary) Color.White else if (MeeshyTheme.isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo600
    Row(
        modifier = Modifier
            .testTag(tag)
            .clip(CircleShape)
            .background(container)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .defaultMinSize(minHeight = 44.dp)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(MeeshySpacing.xs))
        Text(label, style = MaterialTheme.typography.labelLarge, color = content, fontWeight = FontWeight.SemiBold)
    }
}

@StringRes
private fun NotificationQuickAction.labelRes(sent: Boolean): Int = when (this) {
    is NotificationQuickAction.Connect -> if (sent) R.string.notifications_quick_connect_sent else R.string.notifications_quick_connect
    is NotificationQuickAction.Write -> R.string.notifications_quick_write
}

private fun NotificationQuickAction.icon(sent: Boolean) = when (this) {
    is NotificationQuickAction.Connect -> if (sent) MeeshyIcons.Check else MeeshyIcons.PersonAdd
    is NotificationQuickAction.Write -> MeeshyIcons.Chat
}
