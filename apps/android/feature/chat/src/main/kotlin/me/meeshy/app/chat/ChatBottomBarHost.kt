package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.runtime.remember
import me.meeshy.feature.chat.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.composer.ComposerToolbarLaw

/**
 * Bottom bar layer. The multi-selection bar (#13294) REPLACES the composer while the mode is open
 * — it rises from the bottom edge as the composer leaves (iOS `ConversationComposerDock`).
 */
@Composable
internal fun ChatBottomBarHost(host: ChatHostContext) {
    val reduceMotion = LocalReduceMotion.current
    val ms = if (reduceMotion) 0 else 220
    AnimatedContent(
        targetState = host.selection.isActive,
        transitionSpec = {
            (slideInVertically(tween(ms)) { it / 2 } + fadeIn(tween(ms))) togetherWith
                (slideOutVertically(tween(ms)) { it / 2 } + fadeOut(tween(ms)))
        },
        label = "composer-or-selection",
    ) { selecting ->
        if (selecting) ChatSelectionBar(host) else ChatComposerDock(host)
    }
}

/** The selection bar, wired to the law of the actions menu and to the batch intents of the host. */
@Composable
private fun ChatSelectionBar(host: ChatHostContext) {
    val state = host.state
    val actions = host.actions
    val clipboard = LocalClipboardManager.current
    val haptics = rememberMeeshyHaptics()
    val canWrite = state.viewerMayWrite
    val ids = host.selection.ids
    val selected = remember(state.messages, ids) { state.messages.filter { it.messageId in ids } }
    val now = System.currentTimeMillis()
    val offer = remember(selected, canWrite) { SelectionOffer.of(selected, canWrite, now) }
    var confirmingDelete by remember { mutableStateOf(false) }
    SelectionBar(
        count = selected.size,
        offer = offer,
        accentColor = host.accentColor,
        onCancel = actions.endSelection,
        onDelete = { confirmingDelete = true },
        onCopy = {
            clipboard.setText(AnnotatedString(SelectionOffer.copyText(selected, canWrite, now)))
            haptics.success()
            actions.endSelection()
        },
        onStar = {
            actions.toggleStars(SelectionOffer.starTargets(selected, canWrite, now).map { it.messageId })
            haptics.light()
            actions.endSelection()
        },
        onForward = {
            actions.forwardSelection(SelectionOffer.idsOffering(MessageAction.Forward, selected, canWrite, now))
            actions.endSelection()
        },
    )
    if (confirmingDelete) {
        val scopes = buildList {
            if (offer.deleteForEveryone) add(MessageAction.DeleteForEveryone)
            if (offer.deleteForMe) add(MessageAction.DeleteForMe)
        }
        MessageDeleteConfirmationDialog(
            scopes = scopes,
            title = if (selected.size > 1) {
                pluralStringResource(R.plurals.chat_delete_confirm_title_many, selected.size, selected.size)
            } else {
                stringResource(R.string.chat_delete_confirm_title)
            },
            onDeleteForEveryone = {
                actions.deleteSelectionForEveryone(SelectionOffer.idsOffering(MessageAction.DeleteForEveryone, selected, canWrite, now))
                haptics.success()
                actions.endSelection()
            },
            onDeleteForMe = {
                actions.deleteSelectionForMe(SelectionOffer.idsOffering(MessageAction.DeleteForMe, selected, canWrite, now))
                haptics.success()
                actions.endSelection()
            },
            onDismiss = { confirmingDelete = false },
        )
    }
}

/** The @mention suggestions strip over the composer, whose glass plate carries the pending attachments. */
@Composable
private fun ChatComposerDock(host: ChatHostContext) {
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
    var pickerOpen by rememberSaveable { mutableStateOf(false) }
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
            canSend = composerText.hasText || state.clipboardContent != null || host.pendingPlace != null ||
                (!pending.isEmpty && !pending.hasPreparing),
            hasPendingAttachments = !pending.isEmpty || host.pendingPlace != null,
            onLocationRequest = { pickerOpen = true },
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
            pendingSlot = if (pending.items.isEmpty() && host.pendingPlace == null) null else {
                {
                    Column {
                        ComposerPlaceChip(host.pendingPlace, accentColor, onRemove = actions.clearPendingPlace)
                        if (pending.items.isNotEmpty()) {
                            ComposerPendingStrip(
                                pending.items,
                                onRemove = actions.removePendingAttachment,
                                onEdit = editPending,
                            )
                        }
                    }
                }
            },
            canMinimize = false,
            foldable = true,
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
    if (pickerOpen) {
        LocationPickerDialog(
            accent = accentColor,
            settingsSheet = host.navigation.locationSettingsSheet,
            onSelect = actions.setPendingPlace,
            onDismiss = { pickerOpen = false },
        )
    }
}
