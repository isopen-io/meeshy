package me.meeshy.app.conversations

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities

/**
 * Une conversation de la liste: la rangée plate Lentille ([ConversationRowContainer]) posée dans le
 * panneau d'actions révélées d'iOS ([ConversationSwipeActions]). La rangée ne connaît ni flux ni
 * ViewModel: elle reçoit un instantané immuable ([ConversationRowModel]) et ses rappels groupés.
 */
@Composable
internal fun ConversationRow(
    model: ConversationRowModel,
    actions: ConversationRowActions,
) {
    val conversation = model.conversation
    val prefs = conversation.resolvedPreferences
    val capabilities = remember(conversation, model.currentUserPrefs) {
        ConversationRowMenuCapabilities.make(conversation, model.currentUserPrefs)
    }
    val swipe = ConversationSwipeActionModel.of(
        isPinned = prefs?.isPinned == true,
        isArchived = prefs?.isArchived == true,
        hasUnread = conversation.unreadCount > 0,
        canToggleArchive = capabilities.canToggleArchive,
        obsolete = capabilities.obsolete,
    )
    ConversationSwipeActions(swipe = swipe, actions = actions) {
        ConversationRowContainer(model = model, actions = actions)
    }
}
