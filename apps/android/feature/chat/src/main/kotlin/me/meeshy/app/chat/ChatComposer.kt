package me.meeshy.app.chat

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.sdk.model.SentimentLevel
import me.meeshy.sdk.model.composer.ComposerMinimizeOutcome
import me.meeshy.ui.component.recording.VoiceRecordingPill
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La barre de composition : un simple assemblage autour d'UNE plaque de verre ([ComposerGlassPlate])
 * qui porte bandeaux, plateau, rails et rangée de saisie, et d'un état minimisé en bouton flottant.
 * L'hôte (le chat, ou une autre surface) la pilote par ses rappels : [hostCallbacks] (interaction,
 * contenu présent), [focusTrigger] (focus à la demande), [emojiInjection] et [externalAttachments]
 * (injections externes), [foldSlot] (chevron de repli). Le texte externe (édition, brouillon) passe
 * par [draft] + [draftRevision].
 */
@Composable
internal fun ChatComposer(
    draft: String,
    draftRevision: Int,
    canSend: Boolean,
    isEditing: Boolean,
    affordances: ComposerAffordances,
    slowMode: SlowModeState,
    replyBanner: ComposerReplyBanner?,
    hasEffects: Boolean,
    clipboardContent: ClipboardContent?,
    sentiment: SentimentLevel?,
    languageCode: String,
    accentColor: Color,
    onDraftChange: (String) -> Unit,
    onPickLanguage: (String) -> Unit,
    onSend: () -> Unit,
    onOpenEffects: () -> Unit,
    onCancelEdit: () -> Unit,
    onCancelReply: () -> Unit,
    onRemoveClipboard: () -> Unit,
    onPickFile: (bytes: ByteArray, fileName: String, mimeType: String?) -> Unit,
    hasPendingAttachments: Boolean = false,
    onPickUris: ((List<Uri>) -> Unit)? = null,
    editingOriginalText: String? = null,
    onStageVoiceFile: ((File) -> Unit)? = null,
    onStageCapturedUris: (suspend (List<Uri>) -> Unit)? = null,
    secondaryColor: Color = MeeshyPalette.Indigo600,
    hostCallbacks: ComposerHostCallbacks = ComposerHostCallbacks(),
    focusTrigger: Int = 0,
    emojiInjection: ComposerEmojiInjection? = null,
    externalAttachments: ComposerExternalAttachments? = null,
    foldSlot: (@Composable () -> Unit)? = null,
    canMinimize: Boolean = true,
) {
    val context = LocalContext.current
    val ioScope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        if (onPickUris != null) return@rememberLauncherForActivityResult onPickUris(uris)
        ioScope.launch {
            val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, uris.first()) } ?: return@launch
            onPickFile(picked.bytes, picked.fileName, picked.mimeType)
        }
    }
    val voice = rememberComposerVoice(onStageVoiceFile, onPickFile)
    var minimized by rememberSaveable { mutableStateOf(false) }
    var attachmentTrayOpen by remember { mutableStateOf(false) }
    var cameraChooserOpen by remember { mutableStateOf(false) }
    var emojiPickerOpen by remember { mutableStateOf(false) }
    // Camera and Emoji joined the ladder in #3738; Location stays off until the gateway's shared-place
    // wire field has a producer in Android's message model.
    val ladderTiles = remember(affordances) {
        ComposerAttachmentLadder.tiles(affordances, hasRecentMediaStrip = true, showCamera = true, showLocation = false, showEmoji = true)
    }
    // Cursor-aware mirror of `draft` so the Emoji tile inserts at the caret; `draft` stays the source of truth.
    var fieldValue by remember { mutableStateOf(TextFieldValue(draft, selection = TextRange(draft.length))) }
    LaunchedEffect(draftRevision) { fieldValue = TextFieldValue(draft, selection = TextRange(draft.length)) }
    fun insertEmoji(emoji: String) {
        val r = ComposerEmojiInsertion.insert(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end, emoji)
        fieldValue = TextFieldValue(r.text, TextRange(r.cursor))
        onDraftChange(r.text)
    }
    val hasContent = draft.isNotBlank() || hasPendingAttachments || clipboardContent != null
    LaunchedEffect(hasContent) { hostCallbacks.onHasContentChange(hasContent) }
    LaunchedEffect(focusTrigger) {
        if (focusTrigger > 0) {
            minimized = false
            runCatching { focusRequester.requestFocus() }
        }
    }
    LaunchedEffect(emojiInjection?.nonce) { emojiInjection?.let { insertEmoji(it.emoji) } }
    LaunchedEffect(externalAttachments?.nonce) {
        externalAttachments?.takeIf { it.uris.isNotEmpty() }?.let { onPickUris?.invoke(it.uris) }
    }
    val chatCameraCapture = rememberChatCameraCapture(
        onCaptured = { uri, _ ->
            val stage = onStageCapturedUris
            if (stage != null) {
                stage(listOf(uri))
            } else {
                withContext(Dispatchers.IO) { readPickedAttachment(context, uri) }?.let { picked ->
                    onPickFile(picked.bytes, picked.fileName, picked.mimeType)
                }
            }
        },
    )
    val showMic = !isEditing && draft.isBlank() && clipboardContent == null && !hasPendingAttachments && affordances.canSendAudios
    val interact = hostCallbacks.onAnyInteraction

    ComposerShellLayout(
        minimized = minimized,
        canMinimize = canMinimize,
        onMinimizeOutcome = { outcome ->
            when (outcome) {
                ComposerMinimizeOutcome.MINIMIZE -> {
                    attachmentTrayOpen = false
                    focusManager.clearFocus()
                    minimized = true
                }
                ComposerMinimizeOutcome.DISMISS_SURFACES -> {
                    attachmentTrayOpen = false
                    focusManager.clearFocus()
                }
                ComposerMinimizeOutcome.REBOUND -> Unit
            }
        },
        minimizedContent = {
            ComposerMinimizedButton(
                showMic = showMic,
                accentColor = accentColor,
                secondaryColor = secondaryColor,
                onTap = {
                    interact()
                    minimized = false
                    if (showMic) voice.request()
                },
                modifier = Modifier.padding(horizontal = MeeshySpacing.md),
            )
        },
        expandedContent = {
            ComposerGlassPlate(foldSlot = foldSlot) {
                if (attachmentTrayOpen && ladderTiles.isNotEmpty() && !voice.isRecording && !affordances.isReadOnly) {
                    ComposerAttachmentTray(
                        tiles = ladderTiles,
                        recentMedia = {
                            ComposerRecentMedia(
                                canCapture = affordances.canSendImages || affordances.canSendVideos,
                                accentColor = accentColor,
                                onPickFile = onPickFile,
                                onPickUri = onPickUris?.let { stage -> { uri: Uri -> stage(listOf(uri)) } },
                            )
                        },
                        onTileClick = { kind ->
                            attachmentTrayOpen = false
                            when (kind) {
                                AttachmentTileKind.Photo -> filePicker.launch("image/*")
                                AttachmentTileKind.File -> filePicker.launch("*/*")
                                AttachmentTileKind.Voice -> voice.request()
                                AttachmentTileKind.Camera -> cameraChooserOpen = true
                                AttachmentTileKind.Emoji -> emojiPickerOpen = true
                                AttachmentTileKind.Location -> Unit
                            }
                        },
                    )
                }
                if (cameraChooserOpen) {
                    ComposerCameraChooser(
                        canSendImages = affordances.canSendImages,
                        canSendVideos = affordances.canSendVideos,
                        onPickPhoto = chatCameraCapture::launchPhoto,
                        onPickVideo = chatCameraCapture::launchVideo,
                        onDismiss = { cameraChooserOpen = false },
                    )
                }
                if (replyBanner != null) ComposerReplyRow(replyBanner, accentColor, onCancelReply)
                if (isEditing) ComposerEditRow(editingOriginalText, onCancelEdit)
                if (clipboardContent != null) {
                    ClipboardContentPreview(
                        clip = clipboardContent,
                        accentColor = accentColor,
                        onRemove = onRemoveClipboard,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
                    )
                }
                when {
                    voice.isRecording -> VoiceRecordingPill(
                        session = voice.session,
                        accentColor = accentColor,
                        onCancel = voice.cancel,
                        onStop = voice.finish,
                        onSend = voice.finish,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                    )
                    affordances.isReadOnly -> ComposerReadOnlyNotice(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
                    )
                    else -> {
                        if (!isEditing && slowMode.isActive && !slowMode.canSend) {
                            ComposerSlowModeNotice(
                                remainingSeconds = slowMode.remainingSeconds,
                                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                            )
                        }
                        ComposerInputRow(
                            isEditing = isEditing,
                            hasAttachmentTiles = ladderTiles.isNotEmpty(),
                            attachmentTrayOpen = attachmentTrayOpen,
                            hasEffects = hasEffects,
                            languageCode = languageCode,
                            fieldValue = fieldValue,
                            sentiment = sentiment,
                            showMic = showMic,
                            sendEnabled = canSend && (isEditing || slowMode.canSend),
                            accentColor = accentColor,
                            secondaryColor = secondaryColor,
                            focusRequester = focusRequester,
                            onFocusChange = { if (it) interact() },
                            onToggleTray = {
                                interact()
                                attachmentTrayOpen = !attachmentTrayOpen
                            },
                            onOpenEffects = onOpenEffects,
                            onPickLanguage = onPickLanguage,
                            onFieldChange = { newValue ->
                                fieldValue = newValue
                                onDraftChange(newValue.text)
                            },
                            onRequestVoice = {
                                interact()
                                voice.request()
                            },
                            onSend = {
                                interact()
                                haptics.light()
                                onSend()
                            },
                        )
                    }
                }
            }
        },
    )
    if (emojiPickerOpen) {
        ComposerEmojiSheet(accentColor, onSelect = ::insertEmoji, onDismiss = { emojiPickerOpen = false })
    }
}
