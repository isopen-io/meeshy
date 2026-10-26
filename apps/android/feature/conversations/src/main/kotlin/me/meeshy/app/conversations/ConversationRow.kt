package me.meeshy.app.conversations

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MarkChatRead
import androidx.compose.material.icons.filled.MarkChatUnread
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Unarchive
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.ui.component.swipe.SwipeAction
import me.meeshy.ui.component.swipe.SwipeableRow
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Une conversation de la liste: la rangée plate Lentille ([ConversationRowContainer]) posée dans les
 * actions de glissement d'iOS (épingler, sourdine, verrou à gauche ; archive, lu / non lu, masquer à
 * droite, [ConversationSwipePlan]). La rangée ne connaît ni flux ni ViewModel: elle reçoit un instantané
 * immuable ([ConversationRowModel]) et ses rappels groupés.
 */
@Composable
internal fun ConversationRow(
    model: ConversationRowModel,
    actions: ConversationRowActions,
) {
    val conversation = model.conversation
    val prefs = conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isMuted = prefs?.isMuted == true
    val isArchived = prefs?.isArchived == true
    val capabilities = remember(conversation, model.currentUserPrefs) {
        ConversationRowMenuCapabilities.make(conversation, model.currentUserPrefs)
    }
    val plan = ConversationSwipePlan.of(
        hasUnread = conversation.unreadCount > 0,
        canToggleArchive = capabilities.canToggleArchive,
        removal = capabilities.removal,
    )

    val pin = stringResource(if (isPinned) R.string.conversations_action_unpin else R.string.conversations_action_pin)
    val mute = stringResource(if (isMuted) R.string.conversations_action_unmute else R.string.conversations_action_mute)
    val lock = stringResource(if (model.isLocked) R.string.conversations_action_unlock else R.string.conversations_action_lock)
    val archive = stringResource(
        if (isArchived) R.string.conversations_action_unarchive else R.string.conversations_action_archive,
    )
    val markRead = stringResource(R.string.conversations_action_mark_read)
    val markUnread = stringResource(R.string.conversations_action_mark_unread)
    val remove = capabilities.removal?.let { stringResource(it.swipeLabelRes()) }.orEmpty()

    val leadingActions = remember(plan, pin, mute, lock, model.isLocked, isPinned, isMuted, actions) {
        plan.leading.map { kind ->
            when (kind) {
                SwipeKind.PIN -> SwipeAction(Icons.Filled.PushPin, pin, MeeshyPalette.PinnedBlue, actions.onTogglePin)
                SwipeKind.MUTE -> SwipeAction(
                    if (isMuted) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                    mute, MeeshyPalette.Neutral500, actions.onToggleMute,
                )
                else -> SwipeAction(
                    if (model.isLocked) Icons.Filled.LockOpen else Icons.Filled.Lock,
                    lock, MeeshyPalette.Warning, actions.onLockToggle,
                )
            }
        }
    }
    val trailingActions = remember(plan, archive, markRead, markUnread, remove, isArchived, actions) {
        plan.trailing.map { kind ->
            when (kind) {
                SwipeKind.ARCHIVE -> SwipeAction(
                    if (isArchived) Icons.Filled.Unarchive else Icons.Filled.Archive,
                    archive, MeeshyPalette.Warning, actions.onToggleArchive,
                )
                SwipeKind.MARK_READ -> SwipeAction(
                    Icons.Filled.MarkChatRead, markRead, MeeshyPalette.Indigo400, actions.onMarkRead,
                )
                SwipeKind.MARK_UNREAD -> SwipeAction(
                    Icons.Filled.MarkChatUnread, markUnread, MeeshyPalette.Indigo400, actions.onMarkUnread,
                )
                else -> SwipeAction(Icons.Filled.VisibilityOff, remove, MeeshyPalette.Error, actions.onRemove)
            }
        }
    }

    SwipeableRow(leadingActions = leadingActions, trailingActions = trailingActions) {
        ConversationRowContainer(model = model, actions = actions)
    }
}

private fun ConversationRowMenuCapabilities.Removal.swipeLabelRes(): Int = when (this) {
    ConversationRowMenuCapabilities.Removal.DELETE -> R.string.dialogs_removal_delete
    ConversationRowMenuCapabilities.Removal.HIDE -> R.string.dialogs_removal_hide
}
