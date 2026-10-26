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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material.icons.filled.PersonAdd
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationBannerFraming
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.sdk.model.NotificationRowDetail
import me.meeshy.sdk.model.NotificationRowFooter
import me.meeshy.sdk.model.RowContentKind
import me.meeshy.sdk.model.notificationTypeAccentHex
import me.meeshy.sdk.model.quickActions
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.swipe.SwipeAction
import me.meeshy.ui.component.swipe.SwipeableRow
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
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
    val detail = remember(notification, headline, body) { NotificationRowDetail.of(notification, headline, body) }
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
            listOf(SwipeAction(Icons.Filled.MarkEmailRead, markReadLabel, MeeshyPalette.Indigo500) { onMarkRead(notification) })
        } else {
            emptyList()
        }
    }
    val trailing = remember(deleteLabel, onDelete, notification) {
        listOf(SwipeAction(Icons.Filled.Delete, deleteLabel, MeeshyPalette.Error) { onDelete(notification) })
    }
    val unreadState = stringResource(R.string.notifications_unread_prefix)

    SwipeableRow(modifier = modifier, leadingActions = leading, trailingActions = trailing) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(wash)
                .semantics(mergeDescendants = false) { if (isUnread) stateDescription = unreadState },
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpen(notification) }
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Box {
                    MeeshyAvatar(
                        name = notification.actor?.displayName ?: notification.actor?.username ?: "?",
                        modifier = Modifier.size(44.dp),
                        containerColor = accent,
                        imageUrl = notification.actor?.avatar,
                    )
                    if (isUnread) {
                        Box(
                            Modifier.align(Alignment.TopEnd).offset(x = 2.dp, y = (-2).dp).size(9.dp)
                                .clip(CircleShape).background(accent),
                        )
                    }
                }
                RowText(headline, detail, isUnread, Modifier.weight(1f))
                presentation.thumbnailUrl?.let { RowThumbnail(it, accent) }
                RowTimestamp(notification)
            }
            if (quickActions.isNotEmpty()) {
                QuickActionsRow(notification, quickActions, isConnectRequested, onQuickAction)
            }
        }
    }
}

@Composable
private fun RowText(headline: String, detail: NotificationRowDetail, isUnread: Boolean, modifier: Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        Text(
            text = headline,
            style = MaterialTheme.typography.labelLarge,
            color = MeeshyTheme.tokens.textPrimary,
            fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        detail.body?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        detail.quote?.let {
            Text(
                text = stringResource(R.string.notifications_reply_to_comment, it),
                style = MaterialTheme.typography.bodySmall,
                fontStyle = FontStyle.Italic,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        detail.footer?.let { RowFooter(it) }
    }
}

@Composable
private fun RowFooter(footer: NotificationRowFooter) {
    val text = when (footer) {
        is NotificationRowFooter.Conversation -> footer.title
        is NotificationRowFooter.Content -> footer.excerpt ?: stringResource(footer.kind.labelRes())
    }
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(top = MeeshySpacing.xxs),
    )
}

@StringRes
private fun RowContentKind.labelRes(): Int = when (this) {
    RowContentKind.STORY -> R.string.notifications_footer_story
    RowContentKind.REEL -> R.string.notifications_footer_reel
    RowContentKind.MOOD -> R.string.notifications_footer_mood
    RowContentKind.POST -> R.string.notifications_footer_post
}

@Composable
private fun RowThumbnail(url: String, accent: Color) {
    val shape = RoundedCornerShape(8.dp)
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .size(44.dp)
            .clip(shape)
            .background(accent.copy(alpha = 0.12f)),
    )
}

@Composable
private fun RowTimestamp(notification: ApiNotification) {
    val strings = rememberRelativeTimeStrings()
    val label = remember(notification.state.createdAt, strings) {
        NotificationRowTime.epochMillis(notification)?.let {
            RelativeTimeFormat.short(
                epochMillis = it,
                referenceMillis = System.currentTimeMillis(),
                zone = ZoneId.systemDefault(),
                locale = Locale.getDefault(),
                strings = strings,
            )
        }
    }
    label?.let {
        Text(it, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted, fontWeight = FontWeight.Medium)
    }
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
    is NotificationQuickAction.Connect -> if (sent) Icons.Filled.Check else Icons.Filled.PersonAdd
    is NotificationQuickAction.Write -> Icons.Filled.ChatBubble
}
