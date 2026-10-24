package me.meeshy.app.conversations

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.swipe.SwipeAction
import me.meeshy.ui.component.swipe.SwipeableRow
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Une conversation de la liste: la rangée plate Lentille ([ConversationRowContainer]) posée dans les
 * actions de glissement (épingler à gauche, archiver à droite). La rangée ne connaît ni flux ni
 * ViewModel: elle reçoit un instantané immuable ([ConversationRowModel]) et ses rappels groupés.
 */
@Composable
internal fun ConversationRow(
    model: ConversationRowModel,
    actions: ConversationRowActions,
) {
    val prefs = model.conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isArchived = prefs?.isArchived == true

    val pinLabel = stringResource(
        if (isPinned) R.string.conversations_action_unpin else R.string.conversations_action_pin,
    )
    val archiveLabel = stringResource(
        if (isArchived) R.string.conversations_action_unarchive else R.string.conversations_action_archive,
    )
    val leadingActions = remember(pinLabel, actions.onTogglePin) {
        listOf(SwipeAction(Icons.Filled.PushPin, pinLabel, MeeshyPalette.Warning, actions.onTogglePin))
    }
    val trailingActions = remember(archiveLabel, actions.onToggleArchive) {
        listOf(SwipeAction(Icons.Filled.Archive, archiveLabel, MeeshyPalette.Indigo500, actions.onToggleArchive))
    }

    SwipeableRow(leadingActions = leadingActions, trailingActions = trailingActions) {
        ConversationRowContainer(model = model, actions = actions)
    }
}
