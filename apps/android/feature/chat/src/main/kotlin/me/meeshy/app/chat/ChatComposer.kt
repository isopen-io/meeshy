package me.meeshy.app.chat

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import me.meeshy.sdk.model.waveform.MicAmplitudeDecibels
import me.meeshy.sdk.model.waveform.VoiceRecordingFile
import me.meeshy.sdk.model.waveform.VoiceRecordingOutcome
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.recording.VoiceRecordingPill
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
    replyingToLabel: String?,
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
) {
    val context = LocalContext.current
    val ioScope = rememberCoroutineScope()
    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        ioScope.launch {
            val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, uri) } ?: return@launch
            onPickFile(picked.bytes, picked.fileName, picked.mimeType)
        }
    }
    var recording by remember { mutableStateOf(VoiceRecordingSession.idle()) }
    var activeVoiceRecorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var activeVoiceRecordingFile by remember { mutableStateOf<File?>(null) }

    // Stops+releases the real MediaRecorder session (Android hardware), distinct from
    // VoiceRecordingSession.stop() (the pure UI state machine) below — the two "stop"s
    // are independent concerns. Returns the recorded file, if any, for the caller to
    // decide what to do with (send it, or discard it on cancel).
    fun releaseVoiceRecorder(): File? {
        activeVoiceRecorder?.let { recorder ->
            // stop() throws IllegalStateException if called too soon after start() with
            // no data captured yet (e.g. a cancel within the same frame as the tap) —
            // never worth crashing the composer over a take too short to matter.
            runCatching { recorder.stop() }
            recorder.release()
        }
        activeVoiceRecorder = null
        val file = activeVoiceRecordingFile
        activeVoiceRecordingFile = null
        return file
    }

    fun startVoiceRecording() {
        val dir = File(context.cacheDir, "voice").apply { mkdirs() }
        val file = File(dir, VoiceRecordingFile.next(System.currentTimeMillis()))
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            recorder.start()
            activeVoiceRecorder = recorder
            activeVoiceRecordingFile = file
            recording = recording.start()
        } catch (e: Exception) {
            recorder.release()
            file.delete()
        }
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
        releaseVoiceRecorder()?.delete()
        recording = recording.cancel()
    }

    // Both the pill's Stop and Send controls finalise the take the same way — there is
    // no staging tray in this composer (every other attachment kind, file/clipboard, is
    // delivered immediately on pick too), so "stop and add to attachments" reads as
    // "deliver it now", identically to "send". A take below the minimum sendable
    // duration (canSend == false) never reaches here — the pill disables both buttons.
    fun finishVoiceRecording() {
        val file = releaseVoiceRecorder()
        val stop = recording.stop()
        recording = stop.session
        val completedFile = file.takeIf { stop.outcome is VoiceRecordingOutcome.Completed }
        val bytes = completedFile?.let { runCatching { it.readBytes() }.getOrNull() }
        file?.delete()
        if (completedFile != null && bytes != null && bytes.isNotEmpty()) {
            onPickFile(bytes, completedFile.name, "audio/mp4")
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
    val chatCameraCapture = rememberChatCameraCapture(
        onCaptured = { uri, _ ->
            withContext(Dispatchers.IO) { readPickedAttachment(context, uri) }?.let { picked ->
                onPickFile(picked.bytes, picked.fileName, picked.mimeType)
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
            if (replyingToLabel != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Reply,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = stringResource(R.string.chat_replying_to, replyingToLabel),
                        style = MaterialTheme.typography.labelMedium,
                        color = accentColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = MeeshySpacing.xs),
                    )
                    IconButton(onClick = onCancelReply) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.chat_cancel_reply),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            if (isEditing) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Edit,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = stringResource(R.string.chat_editing_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = accentColor,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = MeeshySpacing.xs),
                    )
                    IconButton(onClick = onCancelEdit) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.chat_cancel_edit),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
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
                    recording = recording.tick(0.1)
                    val amplitude = activeVoiceRecorder?.let { runCatching { it.maxAmplitude }.getOrNull() }
                    if (amplitude != null) {
                        recording = recording.meter(MicAmplitudeDecibels.toDecibels(amplitude))
                    }
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
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (!isEditing) {
                        if (ladderTiles.isNotEmpty()) {
                            IconButton(onClick = { attachmentTrayOpen = !attachmentTrayOpen }) {
                                Icon(
                                    imageVector = if (attachmentTrayOpen) Icons.Filled.Close else Icons.Filled.Add,
                                    contentDescription = stringResource(R.string.chat_attach_open),
                                    tint = if (attachmentTrayOpen) accentColor else MeeshyTheme.tokens.textSecondary,
                                )
                            }
                        }
                        IconButton(onClick = onOpenEffects) {
                            Icon(
                                imageVector = Icons.Filled.AutoAwesome,
                                contentDescription = stringResource(R.string.chat_effects_open),
                                tint = if (hasEffects) accentColor else MeeshyTheme.tokens.textSecondary,
                            )
                        }
                        ComposerLanguagePill(
                            languageCode = languageCode,
                            accentColor = accentColor,
                            onPick = onPickLanguage,
                        )
                    }
                    OutlinedTextField(
                        value = fieldValue,
                        onValueChange = { newValue ->
                            fieldValue = newValue
                            onDraftChange(newValue.text)
                        },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(stringResource(R.string.chat_message_placeholder)) },
                        maxLines = 4,
                        trailingIcon = if (sentiment != null) {
                            {
                                val description = stringResource(R.string.chat_composer_sentiment)
                                Text(
                                    text = sentiment.emoji,
                                    modifier = Modifier.semantics { contentDescription = description },
                                )
                            }
                        } else {
                            null
                        },
                    )
                    if (!isEditing && draft.isBlank() && clipboardContent == null &&
                        affordances.canSendAudios
                    ) {
                        IconButton(onClick = ::requestVoiceRecording) {
                            Icon(
                                imageVector = Icons.Filled.Mic,
                                contentDescription = stringResource(R.string.chat_record_voice),
                                tint = MeeshyTheme.tokens.textSecondary,
                            )
                        }
                    } else {
                        IconButton(onClick = onSend, enabled = canSend && (isEditing || slowMode.canSend)) {
                            Icon(
                                imageVector = if (isEditing) Icons.Filled.Check else Icons.AutoMirrored.Filled.Send,
                                contentDescription = stringResource(R.string.chat_send),
                            )
                        }
                    }
                }
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

/**
 * The composer's live language pill — the "smart context zone" affordance. Shows
 * the flag of the resolved source language ([ChatUiState.composerLanguageCode]),
 * following on-device detection as the viewer types, and opens a picker so they can
 * override it (long messages lock the detection, exactly like iOS). Thin,
 * coverage-exempt Compose glue over the pure [me.meeshy.sdk.model.ComposerLanguageState];
 * the picker offers the curated [LanguageData.commonLanguageCodes] set.
 */
@Composable
private fun ComposerLanguagePill(
    languageCode: String,
    accentColor: Color,
    onPick: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val description = stringResource(R.string.chat_composer_language)
    Box {
        Text(
            text = ComposerLanguage.flag(languageCode),
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshySpacing.sm))
                .clickable { expanded = true }
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)
                .semantics { contentDescription = description },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            LanguageData.commonLanguageCodes.forEach { code ->
                val info = LanguageData.info(code) ?: return@forEach
                DropdownMenuItem(
                    text = { Text("${info.flag}  ${info.nativeName}") },
                    onClick = {
                        expanded = false
                        onPick(code)
                    },
                    trailingIcon = if (code == languageCode) {
                        {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = null,
                                tint = accentColor,
                            )
                        }
                    } else {
                        null
                    },
                )
            }
        }
    }
}

/**
 * Read-only composer state for a participant whose permissions deny sending text
 * (a share-link guest with `canSendMessages = false`). The thin, coverage-exempt
 * Compose glue over [ComposerAffordances.isReadOnly] — a muted lock row that
 * replaces the input entirely so the guest can read but never post.
 */
@Composable
private fun ComposerReadOnlyNotice(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = stringResource(R.string.chat_composer_read_only),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(start = MeeshySpacing.xs),
        )
    }
}

/**
 * The live slow-mode posture for the composer, ticked once a second while a
 * cooldown is running. The ViewModel's [ChatViewModel.send] gate is authoritative;
 * this is the thin, coverage-exempt Compose glue that animates the countdown so the
 * send button re-enables the instant the interval clears. The ticker only spins
 * while slow mode is active for the viewer, so a normal conversation never pays for
 * a recomposition loop.
 */
@Composable
internal fun rememberComposerSlowMode(state: ChatUiState): SlowModeState {
    val throttled = (state.slowModeSeconds ?: 0) > 0 && !state.slowModeExempt
    val now by produceState(
        initialValue = System.currentTimeMillis(),
        throttled,
        state.lastSelfSentAtMillis,
    ) {
        value = System.currentTimeMillis()
        while (throttled) {
            delay(500)
            value = System.currentTimeMillis()
        }
    }
    return state.slowModeState(now)
}

/**
 * A subtle countdown row shown above the composer while slow mode blocks the next
 * send — an hourglass and the remaining seconds. Prisme discretion: it informs
 * without a modal or a banner, and self-clears when [remainingSeconds] reaches the
 * cleared window. SOTA over iOS, which never surfaces the cooldown at all.
 */
@Composable
private fun ComposerSlowModeNotice(remainingSeconds: Int, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.HourglassEmpty,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = stringResource(R.string.chat_slow_mode_wait, remainingSeconds),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(start = MeeshySpacing.xs),
        )
    }
}

/**
 * Preview chip for a large paste captured into a clipboard-content attachment —
 * the thin, coverage-exempt Compose glue over the pure [ClipboardContent] (parité
 * iOS `clipboardContentPreview`: doc glyph, title, truncated body, char count, and
 * an accent-tinted remove button).
 */
@Composable
private fun ClipboardContentPreview(
    clip: ClipboardContent,
    accentColor: Color,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Description,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(20.dp),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = MeeshySpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.chat_clipboard_title),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = clip.truncatedPreview,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(R.string.chat_clipboard_char_count, clip.charCount),
                style = MaterialTheme.typography.labelSmall,
                color = accentColor,
            )
        }
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.chat_clipboard_remove),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
