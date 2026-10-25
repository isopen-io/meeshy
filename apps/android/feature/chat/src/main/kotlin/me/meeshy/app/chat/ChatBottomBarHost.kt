package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Bottom bar layer: the pending attachments and the @mention suggestions strips stacked over the composer. */
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
    val scope = rememberCoroutineScope()
    var retouching by remember { mutableStateOf<Pair<String, ChatRetouchPending>?>(null) }
    retouching?.let { (id, piece) ->
        ChatCaptureRetouchHost(
            pending = piece,
            person = state.selfAuthor,
            onDeliver = { file ->
                if (file.bytes !== piece.bytes) actions.replacePendingAttachment(id, file.bytes, file.fileName, file.mimeType)
                retouching = null
            },
            onDismiss = { retouching = null },
        )
    }
    Column {
        ComposerPendingStrip(
            pending.items,
            onRemove = actions.removePendingAttachment,
            onEdit = { item ->
                scope.launch {
                    val bytes = actions.readPendingBytes(item) ?: return@launch
                    val piece = withContext(Dispatchers.Default) { ChatRetouchPending.of(bytes, item.fileName ?: "photo.jpg", item.mimeType) }
                    if (piece != null) retouching = item.id to piece
                }
            },
        )
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
            replyBanner = replyBanner,
            editingOriginalText = editingOriginalText,
            onStageVoiceFile = { file -> actions.stageFile(file, "audio/mp4") },
            onStageCapturedUris = actions.stageCapturedUris,
            selfAuthor = state.selfAuthor,
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
