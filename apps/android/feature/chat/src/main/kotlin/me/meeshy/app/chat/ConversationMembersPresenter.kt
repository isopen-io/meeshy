package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The members sheet of a conversation, opened from OUTSIDE its chat — the « Gérer les membres »
 * entry of the conversation list row (#12865, iOS `presentInfo(of:)` on its Members tab). The
 * same sheet as the chat header's: the roster, its search and the moderation the viewer's rank
 * allows ([ConversationMembersViewModel]).
 */
@Composable
fun ConversationMembersPresenter(
    conversationId: String,
    accentColor: Color,
    onDismiss: () -> Unit,
) {
    ConversationMembersSheet(
        conversationId = conversationId,
        accentColor = accentColor,
        onDismiss = onDismiss,
    )
}
