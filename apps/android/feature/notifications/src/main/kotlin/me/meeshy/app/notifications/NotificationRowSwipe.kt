package me.meeshy.app.notifications

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.ui.component.swipe.SwipeAction
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le balayage d'une rangée — miroir de `.swipeActions(edge: .trailing)` (iOS) : UN seul côté, celui
 * de la fin. « Supprimer » (destructif) est l'action la plus proche du bord, « Lu » (enveloppe
 * ouverte, indigo) la suit et n'existe que si la ligne est non lue. Rien ne se révèle côté début.
 */
@Composable
internal fun rememberNotificationSwipeActions(
    notification: ApiNotification,
    isUnread: Boolean,
    onMarkRead: (ApiNotification) -> Unit,
    onDelete: (ApiNotification) -> Unit,
): List<SwipeAction> {
    val deleteLabel = stringResource(R.string.notifications_action_delete)
    val markReadLabel = stringResource(R.string.notifications_action_mark_read)
    return remember(notification, isUnread, deleteLabel, markReadLabel, onMarkRead, onDelete) {
        notificationSwipeActions(
            isUnread = isUnread,
            deleteLabel = deleteLabel,
            markReadLabel = markReadLabel,
            onDelete = { onDelete(notification) },
            onMarkRead = { onMarkRead(notification) },
        )
    }
}

internal fun notificationSwipeActions(
    isUnread: Boolean,
    deleteLabel: String,
    markReadLabel: String,
    onDelete: () -> Unit,
    onMarkRead: () -> Unit,
): List<SwipeAction> = buildList {
    add(SwipeAction(MeeshyIcons.DeleteFilled, deleteLabel, MeeshyPalette.Error, onDelete))
    if (isUnread) add(SwipeAction(MeeshyIcons.MailOpen, markReadLabel, MeeshyPalette.Indigo500, onMarkRead))
}
