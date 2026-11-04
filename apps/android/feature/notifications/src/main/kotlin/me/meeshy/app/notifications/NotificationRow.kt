package me.meeshy.app.notifications

import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationBannerFraming
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.sdk.model.NotificationRowPresentation
import me.meeshy.sdk.model.RowLeading
import me.meeshy.sdk.model.accessibilityDescription
import me.meeshy.sdk.model.notificationTypeAccentHex
import me.meeshy.sdk.model.quickActions
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.swipe.SwipeAction
import me.meeshy.ui.component.swipe.SwipeableRow
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private val UNREAD_FADE = tween<Color>(durationMillis = 250)

/**
 * Une rangée de la cloche — miroir de `NotificationRowView` (iOS) posé sur le glissement persistant :
 * avatar de l'acteur et pastille de non-lu, la phrase d'action, le corps, la citation, le pied (le
 * groupe ou le contenu visé), la vignette du contenu, l'horodatage, puis les gestes (« Se connecter »,
 * « Écrire ») HORS du bouton de la rangée — un bouton dans un bouton ne reçoit pas ses touches.
 *
 * Les callbacks reçoivent la notification : l'écran n'alloue AUCUNE lambda par rangée, et une rangée
 * dont ni la notification ni les deux drapeaux n'ont changé ne se recompose pas (le fond de non-lu
 * glisse vers sa nouvelle teinte par `animateColorAsState`, la seule animation que le changement d'état
 * d'UNE rangée provoque).
 */
@Composable
internal fun NotificationRow(
    notification: ApiNotification,
    isFriend: Boolean,
    isConnectRequested: Boolean,
    onOpen: (ApiNotification) -> Unit,
    onMarkRead: (ApiNotification) -> Unit,
    onDelete: (ApiNotification) -> Unit,
    onQuickAction: (ApiNotification, NotificationQuickAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isUnread = !notification.state.isRead
    val accent = remember(notification.type) { hexColor(notificationTypeAccentHex(notification.type)) }
    val presentation = remember(notification) {
        NotificationBannerFraming.present(
            notification = notification,
            groupName = null,
            isDirect = notification.context?.conversationType.equals("direct", ignoreCase = true),
        )
    }
    val headline = headlineText(presentation.headline)
    val body = presentationBodyText(presentation)
    val copy = rememberNotificationRowCopy()
    val row = remember(notification, headline, body, copy) { NotificationRowPresentation.of(notification, headline, body, copy = copy) }
    val footerText = rememberFooterText(row.footer)
    val time = rememberRowTimeLabel(notification)
    val unreadPrefix = stringResource(R.string.notifications_unread_prefix)
    val description = remember(row, isUnread, unreadPrefix, footerText, time) {
        row.accessibilityDescription(isUnread, unreadPrefix, footerText, time)
    }
    val quickActions = remember(notification, isFriend) { notification.quickActions(isFriend) }

    val isDark = MeeshyTheme.isDark
    val wash by animateColorAsState(
        targetValue = if (isUnread) accent.copy(alpha = if (isDark) 0.07f else 0.05f) else Color.Transparent,
        animationSpec = UNREAD_FADE,
        label = "notification-unread-wash",
    )

    val markReadLabel = stringResource(R.string.notifications_action_mark_read)
    val deleteLabel = stringResource(R.string.notifications_action_delete)
    val leading = remember(isUnread, markReadLabel, onMarkRead, notification) {
        if (isUnread) {
            listOf(SwipeAction(MeeshyIcons.MailOpen, markReadLabel, MeeshyPalette.Indigo500) { onMarkRead(notification) })
        } else {
            emptyList()
        }
    }
    val trailing = remember(deleteLabel, onDelete, notification) {
        listOf(SwipeAction(MeeshyIcons.DeleteFilled, deleteLabel, MeeshyPalette.Error) { onDelete(notification) })
    }

    SwipeableRow(modifier = modifier, leadingActions = leading, trailingActions = trailing) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(wash),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpen(notification) }
                    .clearAndSetSemantics { contentDescription = description }
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                RowLeadingHead(row.leading, notification, accent, isUnread)
                RowText(row, isUnread, footerText, Modifier.weight(1f))
                presentation.thumbnailUrl?.let { NotificationRowThumbnail(it, accent) }
                time?.let { RowTimestamp(it) }
            }
            if (quickActions.isNotEmpty()) {
                QuickActionsRow(notification, quickActions, isConnectRequested, onQuickAction)
            }
        }
    }
}

@Composable
private fun RowLeadingHead(leading: RowLeading, notification: ApiNotification, accent: Color, isUnread: Boolean) {
    Box {
        when (leading) {
            RowLeading.Avatar -> MeeshyAvatar(
                name = notification.actor?.displayName ?: notification.actor?.username ?: "?",
                modifier = Modifier.size(44.dp),
                containerColor = accent,
                imageUrl = notification.actor?.avatar,
            )
            is RowLeading.Milestone -> NotificationMilestoneMedallion(leading.milestone, accent)
            RowLeading.Signature -> NotificationSignatureMedallion(accent)
        }
        if (isUnread) {
            Box(
                Modifier.align(Alignment.TopEnd).offset(x = 2.dp, y = (-2).dp).size(9.dp)
                    .clip(CircleShape).background(accent),
            )
        }
    }
}

@Composable
private fun RowText(row: NotificationRowPresentation, isUnread: Boolean, footerText: String?, modifier: Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        Text(
            text = row.title,
            style = MaterialTheme.typography.labelLarge,
            color = MeeshyTheme.tokens.textPrimary,
            fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        row.body?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        row.quote?.let {
            Text(
                text = stringResource(R.string.notifications_reply_to_comment, it),
                style = MaterialTheme.typography.bodySmall,
                fontStyle = FontStyle.Italic,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        val footer = row.footer
        if (footer != null && footerText != null) NotificationRowFooterLine(footer, footerText)
    }
}

@Composable
private fun rememberRowTimeLabel(notification: ApiNotification): String? {
    val strings = rememberRelativeTimeStrings()
    return remember(notification.state.createdAt, strings) {
        NotificationRowTime.epochMillis(notification)?.let { NotificationRowTime.short(it, strings) }
    }
}

@Composable
private fun RowTimestamp(label: String) {
    Text(label, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted, fontWeight = FontWeight.Medium)
}

@Composable
private fun QuickActionsRow(
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
                label = stringResource(action.labelRes(sent)),
                icon = action.icon(sent),
                isPrimary = action is NotificationQuickAction.Connect && !sent,
                onClick = { if (!sent) onQuickAction(notification, action) },
            )
        }
    }
}

@Composable
private fun QuickActionChip(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, isPrimary: Boolean, onClick: () -> Unit) {
    val container by animateColorAsState(
        if (isPrimary) MeeshyPalette.Indigo600 else MeeshyPalette.Indigo500.copy(alpha = 0.12f),
        tween(200),
        label = "quick-action-container",
    )
    val content = if (isPrimary) Color.White else if (MeeshyTheme.isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo600
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(container)
            .clickable(onClick = onClick)
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
