package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Deleting a message is never one tap away: both "delete" rows of the long-press sheet open
 * the SAME confirmation, which lists every deletion the menu allows — mirror of iOS
 * `messageDeleteConfirmationAnchor` (title, "for everyone" first, "for me", Cancel, and the
 * two-hour hint).
 */
internal object MessageDeleteConfirmation {

    private val ORDER = listOf(MessageAction.DeleteForEveryone, MessageAction.DeleteForMe)

    /** The deletions the confirmation offers, in iOS order — those the resolved menu allows. */
    fun scopes(actions: List<MessageAction>): List<MessageAction> = ORDER.filter { it in actions }
}

@Composable
internal fun MessageDeleteConfirmationDialog(
    scopes: List<MessageAction>,
    onDeleteForEveryone: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.chat_delete_confirm_title)) },
        text = { Text(stringResource(R.string.chat_delete_confirm_hint)) },
        confirmButton = {
            Column(horizontalAlignment = Alignment.End) {
                scopes.forEach { scope ->
                    when (scope) {
                        MessageAction.DeleteForEveryone -> TextButton(onClick = { onDismiss(); onDeleteForEveryone() }) {
                            Text(stringResource(R.string.chat_action_delete_for_everyone), color = MeeshyPalette.Error)
                        }
                        MessageAction.DeleteForMe -> TextButton(onClick = { onDismiss(); onDeleteForMe() }) {
                            Text(stringResource(R.string.chat_action_delete_for_me), color = MeeshyPalette.Error)
                        }
                        else -> Unit
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.chat_delete_confirm_cancel))
                }
            }
        },
    )
}
