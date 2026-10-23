package me.meeshy.app.chat

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.SentimentLevel
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.recording.VoiceRecordingPill
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The chat composer — text field, attachment ladder, effects/language pills,
 * voice recording pill and reply/edit/clipboard context rows. Extracted out of
 * `ChatScreen.kt` (issue found in review: the file was over three times the
 * repo's 800-1100 line budget, and this composable plus the four helpers below
 * it were the largest single-responsibility slice still living there) so the
 * budget stops growing every time the composer itself grows. Called from
 * `ChatScreen`'s `bottomBar`, which owns [ChatUiState] and feeds this composer
 * its already-resolved [SlowModeState] via [rememberComposerSlowMode].
 */
@OptIn(ExperimentalMaterial3Api::class)
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
) {
    val context = LocalContext.current
    val ioScope = rememberCoroutineScope()
    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetMultipleContents(),
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        if (onPickUris != null) {
            onPickUris(uris)
            return@rememberLauncherForActivityResult
        }
        ioScope.launch {
            val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, uris.first()) } ?: return@launch
            onPickFile(picked.bytes, picked.fileName, picked.mimeType)
        }
    }
    val haptics = rememberMeeshyHaptics()
    val voiceCapture = remember {
        ComposerVoiceCapture(File(context.cacheDir, "voice"), { MediaRecorderEngine(context) })
    }
    var recording by remember { mutableStateOf(voiceCapture.session) }

    // A finished take joins the tray by copy, off the main thread (iOS
    // `stopRecordingToAttachment`). Without a file-staging host, it is read on IO instead.
    fun deliverTake(take: VoiceTake?) {
        val file = take?.file ?: return
        val stage = onStageVoiceFile
        if (stage != null) return stage(file)
        ioScope.launch {
            val bytes = withContext(Dispatchers.IO) { runCatching { file.readBytes() }.getOrNull().also { file.delete() } }
            if (bytes != null && bytes.isNotEmpty()) onPickFile(bytes, file.name, VOICE_MIME_TYPE)
        }
    }

    fun startVoiceRecording() {
        if (voiceCapture.start()) haptics.medium()
        recording = voiceCapture.session
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) startVoiceRecording() }

    fun requestVoiceRecording() {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) startVoiceRecording() else micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun cancelVoiceRecording() {
        voiceCapture.cancel()
        recording = voiceCapture.session
        haptics.light()
    }

    // Both the pill's Stop and Send controls put the take in the tray, next to the other
    // pieces, ready for the send button. A take below the minimum sendable duration never
    // reaches here — the pill disables both buttons.
    fun finishVoiceRecording() {
        val take = voiceCapture.finish()
        recording = voiceCapture.session
        haptics.light()
        deliverTake(take)
    }

    // Leaving the screen (navigation, rotation, theme change) or the app going to the
    // background frees the mic: Android cuts a background mic anyway, and a take left
    // running would keep the mic indicator on and leave an orphan file behind.
    val latestDeliver by rememberUpdatedState(::deliverTake)
    DisposableEffect(voiceCapture) {
        onDispose { latestDeliver(voiceCapture.abandon()) }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        if (voiceCapture.session.isRecording) {
            deliverTake(voiceCapture.abandon())
            recording = voiceCapture.session
        }
    }
    var attachmentTrayOpen by remember { mutableStateOf(false) }
    // Camera and Emoji got a live handler in this lot (issue #3738) and join the
    // ladder; Location stays off — the gateway's shared-place wire field
    // (`messageSchema.location`, services/gateway/src/services/location/sharedPlace.ts)
    // has no producer in Android's message model yet (`ApiMessage`/`MessageRepository`
    // live in :core:model/:sdk-core, outside this lot's chat-only perimeter), so
    // wiring the tile would be a dead end — tracked as a follow-up rather than left
    // silently inert.
    val ladderTiles = remember(affordances) {
        ComposerAttachmentLadder.tiles(
            affordances = affordances,
            hasRecentMediaStrip = true,
            showCamera = true,
            showLocation = false,
            showEmoji = true,
        )
    }
    var cameraChooserOpen by remember { mutableStateOf(false) }
    var composerEmojiPickerOpen by remember { mutableStateOf(false) }
    // Cursor-aware mirror of `draft`, kept only so the Emoji tile can insert at
    // the caret instead of always appending — `draft` itself stays the single
    // source of truth the ViewModel owns (autosave restore, send-clears,
    // edit-message loads all flow through it), so an external change re-syncs
    // the mirror with the caret pinned to the end of the new text.
    var fieldValue by remember { mutableStateOf(TextFieldValue(draft, selection = TextRange(draft.length))) }
    LaunchedEffect(draftRevision) {
        fieldValue = TextFieldValue(draft, selection = TextRange(draft.length))
    }
    // The capture joins the tray by a streamed copy (never a whole-file read): a long
    // video can no longer exhaust memory and vanish. The camera deletes its file once
    // the copy is done, hence the wait.
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
    Surface(color = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            if (attachmentTrayOpen && ladderTiles.isNotEmpty() && !recording.isRecording && !affordances.isReadOnly) {
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
                            AttachmentTileKind.Voice -> requestVoiceRecording()
                            AttachmentTileKind.Camera -> cameraChooserOpen = true
                            AttachmentTileKind.Emoji -> composerEmojiPickerOpen = true
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
            LaunchedEffect(recording.isRecording) {
                while (recording.isRecording) {
                    delay(100)
                    voiceCapture.tick(0.1)
                    recording = voiceCapture.session
                }
            }
            if (recording.isRecording) {
                VoiceRecordingPill(
                    session = recording,
                    accentColor = accentColor,
                    onCancel = ::cancelVoiceRecording,
                    onStop = ::finishVoiceRecording,
                    onSend = ::finishVoiceRecording,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                )
            } else if (affordances.isReadOnly) {
                ComposerReadOnlyNotice(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
                )
            } else {
                if (!isEditing && slowMode.isActive && !slowMode.canSend) {
                    ComposerSlowModeNotice(
                        remainingSeconds = slowMode.remainingSeconds,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
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
                    showMic = !isEditing && draft.isBlank() && clipboardContent == null && !hasPendingAttachments &&
                        affordances.canSendAudios,
                    sendEnabled = canSend && (isEditing || slowMode.canSend),
                    accentColor = accentColor,
                    onToggleTray = { attachmentTrayOpen = !attachmentTrayOpen },
                    onOpenEffects = onOpenEffects,
                    onPickLanguage = onPickLanguage,
                    onFieldChange = { newValue ->
                        fieldValue = newValue
                        onDraftChange(newValue.text)
                    },
                    onRequestVoice = ::requestVoiceRecording,
                    onSend = {
                        haptics.light()
                        onSend()
                    },
                )
            }
        }
    }
    if (composerEmojiPickerOpen) {
        ModalBottomSheet(
            onDismissRequest = { composerEmojiPickerOpen = false },
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            EmojiFullPicker(
                onSelect = { emoji ->
                    val result = ComposerEmojiInsertion.insert(
                        text = fieldValue.text,
                        selectionStart = fieldValue.selection.start,
                        selectionEnd = fieldValue.selection.end,
                        emoji = emoji,
                    )
                    fieldValue = TextFieldValue(result.text, TextRange(result.cursor))
                    onDraftChange(result.text)
                },
                accentColor = accentColor,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }
}

private const val VOICE_MIME_TYPE = "audio/mp4"
