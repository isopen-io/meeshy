package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.composer.ComposerToolbarLaw

/** Bottom bar layer: the @mention suggestions strip over the composer, whose glass plate carries the pending attachments. */
@Composable
internal fun ChatBottomBarHost(host: ChatHostContext) {
    val state = host.state
    val composerText by host.composerText.collectAsStateWithLifecycle()
    val pending = host.pending
    val actions = host.actions
    val accentColor = host.accentColor
    val replyBanner = state.replyingToMessageId?.let { id ->
        ComposerReplyBanner.of(state.messages.firstOrNull { it.messageId == id })
    }
    val editingOriginalText = state.editingMessageId?.let { id ->
        state.messages.firstOrNull { it.messageId == id }?.let { it.originalText ?: it.text }
    }
    val context = LocalContext.current
    LaunchedEffect(actions.trayNotices) {
        actions.trayNotices.collect { notice -> Toast.makeText(context, notice, Toast.LENGTH_LONG).show() }
    }
    val editPending = rememberPendingRetouch(actions)
    Column {
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
            isEndToEnd = state.isEndToEnd,
            replyBanner = replyBanner,
            editingOriginalText = editingOriginalText,
            onStageVoiceFile = { file -> actions.stageFile(file, "audio/mp4") },
            onStageCapturedUris = actions.stageCapturedUris,
            selfAuthor = actions.selfAuthor(),
            effects = state.pendingEffects,
            onToggleEffect = actions.toggleEffect,
            onSelectEphemeralDuration = actions.selectEphemeralDuration,
            quickEmojis = ComposerToolbarLaw.quickEmojis(state.quickReactions),
            onQuickEmoji = { emoji ->
                actions.onDraftChange(emoji)
                actions.send()
            },
            pendingSlot = if (pending.items.isEmpty()) null else {
                {
                    ComposerPendingStrip(
                        pending.items,
                        onRemove = actions.removePendingAttachment,
                        onEdit = editPending,
                    )
                }
            },
            canMinimize = false,
            pendingAttachmentCount = pending.items.size,
            clipboardContent = state.clipboardContent,
            languageCode = state.composerLanguageCode,
            accentColor = accentColor,
            onDraftChange = actions.onDraftChange,
            onPickLanguage = actions.onComposerLanguagePicked,
            onSend = actions.send,
            onClearEffects = actions.clearEffects,
            onCancelEdit = actions.cancelEdit,
            onCancelReply = actions.cancelReply,
            onRemoveClipboard = actions.removeClipboardContent,
            onPickFile = actions.pickFile,
        )
    }
}
