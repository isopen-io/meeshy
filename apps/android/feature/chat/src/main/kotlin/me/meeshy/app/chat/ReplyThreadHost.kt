package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.Instant

/**
 * Monte le fil de discussion d'un message en plein écran au-dessus de la conversation (iOS pousse `ThreadView`).
 * Le parent vient des messages déjà chargés : une couture mince, toute la logique vit dans [ReplyThreadViewModel].
 */
@Composable
internal fun ReplyThreadHost(
    state: ChatUiState,
    parentId: String,
    accentColor: Color,
    onDismiss: () -> Unit,
) {
    val parent = remember(parentId, state.messages) {
        state.messages.firstOrNull { it.messageId == parentId }?.let { bubble ->
            ReplyThreadParent(
                messageId = bubble.messageId,
                senderName = bubble.senderName,
                senderAvatarUrl = bubble.senderAvatarUrl,
                senderColorHex = bubble.senderColorHex,
                text = bubble.text,
                createdAtMillis = bubble.createdAtIso?.let { iso ->
                    try { Instant.parse(iso).toEpochMilli() } catch (_: Exception) { null }
                },
            )
        }
    } ?: return
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        ReplyThreadScreen(
            conversationId = state.conversationId,
            parent = parent,
            accentColor = accentColor,
            canReply = state.viewerMayWrite,
            onDismiss = onDismiss,
            modifier = Modifier,
        )
    }
}
