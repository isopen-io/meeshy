package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Bottom bar layer: the pending attachments and the @mention suggestions strips stacked over the composer. */
@Composable
internal fun ChatBottomBarHost(host: ChatHostContext) {
    val state = host.state
    val composerText by host.composerText.collectAsStateWithLifecycle()
    val pending = host.pending
    val actions = host.actions
    val accentColor = host.accentColor
    val replyTarget = state.replyingToMessageId?.let { id ->
        state.messages.firstOrNull { it.messageId == id }
    }
    Column {
        ComposerPendingStrip(pending.items, onRemove = actions.removePendingAttachment)
        MentionSuggestionStrip(
            mention = state.mention,
            accentColor = accentColor,
            onSelect = actions.onMentionSelected,
        )
        ChatComposer(
            draft = composerText.text,
            draftRevision = composerText.revision,
            canSend = composerText.hasText || state.clipboardContent != null || (!pending.isEmpty && !pending.hasPreparing),
            hasPendingAttachments = !pending.isEmpty,
            onPickUris = actions.stagePendingUris,
            isEditing = state.isEditing,
            affordances = state.composerAffordances,
            slowMode = rememberComposerSlowMode(state),
            replyingToLabel = replyTarget?.let { it.senderName ?: it.text.take(40) },
            hasEffects = state.hasPendingEffects,
            clipboardContent = state.clipboardContent,
            sentiment = composerText.sentiment,
            languageCode = state.composerLanguageCode,
            accentColor = accentColor,
            onDraftChange = actions.onDraftChange,
            onPickLanguage = actions.onComposerLanguagePicked,
            onSend = actions.send,
            onOpenEffects = actions.openEffectsPicker,
            onCancelEdit = actions.cancelEdit,
            onCancelReply = actions.cancelReply,
            onRemoveClipboard = actions.removeClipboardContent,
            onPickFile = actions.pickFile,
        )
    }
}
