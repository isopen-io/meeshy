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
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.composer.ComposerToolbarLaw
import me.meeshy.sdk.model.composer.ComposerMinimizeOutcome
import me.meeshy.sdk.model.composer.ConversationComposerFold
import me.meeshy.ui.component.recording.VoiceRecordingPill
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La barre de composition : un simple assemblage autour d'UNE plaque de verre ([ComposerGlassPlate])
 * qui porte bandeaux, plateau, rails et rangée de saisie, et d'un état minimisé en bouton flottant.
 * L'hôte (le chat, ou une autre surface) la pilote par ses rappels : [hostCallbacks] (interaction,
 * contenu présent), [focusTrigger] (focus à la demande), [emojiInjection] et [externalAttachments]
 * (injections externes), [foldSlot] (chevron de repli en surimpression), [foldable] (le ⌄ de la
 * conversation tout à droite de la rangée d'outils, iOS #9955). Le texte externe (édition, brouillon) passe
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
    isEndToEnd: Boolean = false,
    replyBanner: ComposerReplyBanner?,
    clipboardContent: ClipboardContent?,
    languageCode: String,
    accentColor: Color,
    onDraftChange: (String) -> Unit,
    onPickLanguage: (String) -> Unit,
    onSend: () -> Unit,
    onClearEffects: () -> Unit = {},
    onCancelEdit: () -> Unit,
    onCancelReply: () -> Unit,
    onRemoveClipboard: () -> Unit,
    onPickFile: (bytes: ByteArray, fileName: String, mimeType: String?) -> Unit,
    hasPendingAttachments: Boolean = false,
    onPickUris: ((List<Uri>) -> Unit)? = null,
    editingOriginalText: String? = null,
    onStageVoiceFile: ((File) -> Unit)? = null,
    onStageCapturedUris: (suspend (List<Uri>) -> Unit)? = null,
    selfAuthor: me.meeshy.sdk.model.composer.look.ComposerLookPerson? = null,
    secondaryColor: Color = MeeshyPalette.Indigo600,
    hostCallbacks: ComposerHostCallbacks = ComposerHostCallbacks(),
    focusTrigger: Int = 0,
    emojiInjection: ComposerEmojiInjection? = null,
    externalAttachments: ComposerExternalAttachments? = null,
    foldSlot: (@Composable () -> Unit)? = null,
    canMinimize: Boolean = false,
    foldable: Boolean = false,
    effects: MessageEffects = MessageEffects(),
    onToggleEffect: (Long) -> Unit = {},
    onSelectEphemeralDuration: (EphemeralDuration) -> Unit = {},
    quickEmojis: List<String> = ComposerToolbarLaw.QUICK_EMOJI_DEFAULTS,
    onQuickEmoji: ((String) -> Unit)? = null,
    pendingSlot: (@Composable () -> Unit)? = null,
    pendingAttachmentCount: Int = 0,
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
    var fieldFocused by remember { mutableStateOf(false) }
    val isComposing = ConversationComposerFold.isComposing(isFocused = fieldFocused, isRecording = voice.isRecording)
    // Clavier baissé (retour système) = le champ rend la main, comme `resignFirstResponder` sur
    // iOS : sans cela le champ resterait focalisé et le ⌄ ne reviendrait jamais.
    val density = LocalDensity.current
    val imeVisible = WindowInsets.ime.getBottom(density) > 0
    var imeWasVisible by remember { mutableStateOf(false) }
    LaunchedEffect(imeVisible) {
        if (imeWasVisible && !imeVisible && fieldFocused) focusManager.clearFocus()
        imeWasVisible = imeVisible
    }
    var attachmentTrayOpen by remember { mutableStateOf(false) }
    var ephemeralRailOpen by remember { mutableStateOf(false) }
    var effectsPanelOpen by remember { mutableStateOf(false) }
    // La flèche de la pilule d'enregistrement envoie TOUT DE SUITE (iOS) : la prise rejoint le
    // plateau, puis part dès que sa préparation est finie ; le stop, lui, la laisse au plateau.
    var sendVoiceWhenStaged by remember { mutableStateOf(false) }
    var pendingCountAtVoiceSend by remember { mutableStateOf(0) }
    LaunchedEffect(sendVoiceWhenStaged, pendingAttachmentCount, canSend) {
        if (!sendVoiceWhenStaged) return@LaunchedEffect
        if (pendingAttachmentCount > pendingCountAtVoiceSend && canSend) {
            sendVoiceWhenStaged = false
            onSend()
        } else {
            kotlinx.coroutines.delay(VOICE_SEND_TIMEOUT_MS)
            sendVoiceWhenStaged = false
        }
    }
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
            // Une saisie demandée (réponse, édition) rouvre une barre repliée (iOS `reopens`) ; le
            // champ ne revient qu'à la frame suivante, d'où l'attente avant de lui donner le focus.
            val wasFolded = minimized
            minimized = false
            repeat(if (wasFolded) FOCUS_RETRY_FRAMES else 1) {
                if (runCatching { focusRequester.requestFocus() }.isSuccess) return@LaunchedEffect
                withFrameNanos { }
            }
        }
    }
    LaunchedEffect(emojiInjection?.nonce) { emojiInjection?.let { insertEmoji(it.emoji) } }
    LaunchedEffect(externalAttachments?.nonce) {
        externalAttachments?.takeIf { it.uris.isNotEmpty() }?.let { onPickUris?.invoke(it.uris) }
    }
    var retouch by remember { mutableStateOf<ChatRetouchPending?>(null) }
    suspend fun deliverCapture(file: ChatRetouchedFile) {
        val stage = onStageCapturedUris ?: return onPickFile(file.bytes, file.fileName, file.mimeType)
        val uri = context.writeRetouchedCapture(file)
        stage(listOf(uri))
        withContext(Dispatchers.IO) { runCatching { context.contentResolver.delete(uri, null, null) } }
    }
    var videoRetouch by remember { mutableStateOf<ChatVideoRetouchPending?>(null) }
    suspend fun deliverVideo(pending: ChatVideoRetouchPending, file: File) {
        val stage = onStageCapturedUris
        if (stage != null) {
            stage(listOf(context.captureUri(file)))
        } else {
            withContext(Dispatchers.IO) { runCatching { file.readBytes() }.getOrNull() }?.let { bytes ->
                onPickFile(bytes, file.name, ChatRetouchDelivery.VIDEO_MIME)
            }
        }
        withContext(Dispatchers.IO) { pending.discard() }
    }
    val chatCameraCapture = rememberChatCameraCapture(
        onCaptured = { uri, isVideo ->
            val stage = onStageCapturedUris
            val picked = if (isVideo) null else withContext(Dispatchers.IO) { readPickedAttachment(context, uri) }
            val pending = picked?.let { withContext(Dispatchers.Default) { ChatRetouchPending.of(it.bytes, it.fileName, it.mimeType) } }
            val video = if (isVideo) ChatVideoRetouchPending.of(context, uri, System.currentTimeMillis()) else null
            when {
                video != null -> videoRetouch = video
                pending != null -> retouch = pending
                stage != null -> stage(listOf(uri))
                else -> (picked ?: withContext(Dispatchers.IO) { readPickedAttachment(context, uri) })?.let { file ->
                    onPickFile(file.bytes, file.fileName, file.mimeType)
                }
            }
        },
    )
    retouch?.let { pending ->
        ChatCaptureRetouchHost(
            pending = pending,
            person = selfAuthor,
            onDeliver = { file ->
                ioScope.launch { deliverCapture(file) }
                retouch = null
            },
            onDismiss = { retouch = null },
        )
    }
    videoRetouch?.let { pending ->
        ChatVideoRetouchHost(
            pending = pending,
            person = selfAuthor,
            onDeliver = { file ->
                ioScope.launch { deliverVideo(pending, file) }
                videoRetouch = null
            },
            onDismiss = {
                pending.discard()
                videoRetouch = null
            },
        )
    }
    val showMic = !isEditing && draft.isBlank() && clipboardContent == null && !hasPendingAttachments && affordances.canSendAudios
    val interact = hostCallbacks.onAnyInteraction
    // Le ⌄ (iOS `CommentComposerFoldModifier.fold`) : ferme le clavier et ce qui est ouvert dans le
    // verre, haptique légère, puis replie. Brouillon, réponse et pièces jointes vivent au-dessus.
    val fold: () -> Unit = {
        interact()
        focusManager.clearFocus()
        haptics.light()
        attachmentTrayOpen = false
        ephemeralRailOpen = false
        effectsPanelOpen = false
        cameraChooserOpen = false
        emojiPickerOpen = false
        fieldFocused = false
        minimized = true
    }

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
            ComposerUnfoldButton(
                onTap = {
                    interact()
                    haptics.light()
                    minimized = false
                },
            )
        },
        expandedContent = {
            val protection = ComposerToolbarLaw.dominant(effects.flags)
            val protectionTint = protection?.let { composerProtectionColor(it) }
            val iconTint = composerIconTint(effects.flags)
            ComposerGlassPlate(foldSlot = foldSlot, protectionTint = protectionTint) {
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
                pendingSlot?.invoke()
                if (clipboardContent != null) {
                    ClipboardContentPreview(
                        clip = clipboardContent,
                        accentColor = accentColor,
                        onRemove = onRemoveClipboard,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
                    )
                }
                val inputAvailable = !voice.isRecording && !isEndToEnd && !affordances.isReadOnly
                if (inputAvailable && !isEditing && ephemeralRailOpen) {
                    ComposerEphemeralRail(
                        selected = EphemeralDuration.fromSeconds(effects.ephemeralDuration)
                            ?.takeIf { MessageEffectFlags.has(effects.flags, MessageEffectFlags.EPHEMERAL) },
                        onPick = { duration ->
                            if (!MessageEffectFlags.has(effects.flags, MessageEffectFlags.EPHEMERAL)) {
                                onToggleEffect(MessageEffectFlags.EPHEMERAL)
                            }
                            onSelectEphemeralDuration(duration)
                            ephemeralRailOpen = false
                        },
                    )
                }
                if (inputAvailable && !isEditing && effectsPanelOpen) {
                    EffectsPickerSheet(
                        effects = effects,
                        accentColor = accentColor,
                        onToggle = onToggleEffect,
                        onSelectDuration = onSelectEphemeralDuration,
                        onClear = onClearEffects,
                        onDone = { effectsPanelOpen = false },
                        inline = true,
                        modifier = Modifier
                            .padding(start = MeeshySpacing.sm, end = MeeshySpacing.sm, top = MeeshySpacing.sm)
                            .clip(RoundedCornerShape(MeeshyRadius.lg))
                            .background(if (MeeshyTheme.isDark) Color.Black.copy(alpha = 0.3f) else Color.White.copy(alpha = 0.9f)),
                    )
                }
                if (inputAvailable && !isEditing) {
                    ComposerToolbar(
                        effects = effects,
                        languageCode = languageCode,
                        showEphemeralRail = ephemeralRailOpen,
                        onEphemeral = {
                            interact()
                            haptics.light()
                            if (MessageEffectFlags.has(effects.flags, MessageEffectFlags.EPHEMERAL)) {
                                onToggleEffect(MessageEffectFlags.EPHEMERAL)
                                ephemeralRailOpen = false
                            } else {
                                effectsPanelOpen = false
                                ephemeralRailOpen = !ephemeralRailOpen
                            }
                        },
                        onVeil = { veil ->
                            interact()
                            haptics.light()
                            ComposerToolbarLaw.veilToggles(effects.flags, veil).forEach(onToggleEffect)
                        },
                        onEffects = {
                            interact()
                            ephemeralRailOpen = false
                            effectsPanelOpen = !effectsPanelOpen
                        },
                        onPickLanguage = onPickLanguage,
                        onLibrary = if (affordances.canSendImages || affordances.canSendVideos) {
                            { interact(); filePicker.launch("image/*") }
                        } else {
                            null
                        },
                        onCamera = if (affordances.canSendImages || affordances.canSendVideos) {
                            { interact(); cameraChooserOpen = true }
                        } else {
                            null
                        },
                        accentColor = accentColor,
                        onFold = if (foldable && ConversationComposerFold.offersFoldButton(minimized, isComposing)) fold else null,
                    )
                }
                when {
                    voice.isRecording -> VoiceRecordingPill(
                        session = voice.session,
                        accentColor = accentColor,
                        onCancel = voice.cancel,
                        onStop = voice.finish,
                        onSend = {
                            pendingCountAtVoiceSend = pendingAttachmentCount
                            voice.finish()
                            sendVoiceWhenStaged = true
                        },
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
                    )
                    isEndToEnd -> ComposerEndToEndNotice(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
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
                            fieldValue = fieldValue,
                            showMic = showMic,
                            hasSomethingToSend = hasContent || isEditing,
                            sendEnabled = canSend && (isEditing || slowMode.canSend),
                            accentColor = accentColor,
                            secondaryColor = secondaryColor,
                            iconTint = iconTint,
                            protectionTint = protectionTint,
                            quickEmojis = quickEmojis,
                            onQuickEmoji = onQuickEmoji?.let { send ->
                                { emoji: String ->
                                    interact()
                                    haptics.light()
                                    send(emoji)
                                }
                            },
                            onQuickEmojiLongPress = {
                                interact()
                                emojiPickerOpen = true
                            },
                            focusRequester = focusRequester,
                            onFocusChange = { focused ->
                                fieldFocused = focused
                                if (focused) {
                                    interact()
                                    attachmentTrayOpen = false
                                }
                            },
                            onToggleTray = {
                                interact()
                                if (attachmentTrayOpen) {
                                    attachmentTrayOpen = false
                                    runCatching { focusRequester.requestFocus() }
                                } else {
                                    focusManager.clearFocus()
                                    attachmentTrayOpen = true
                                }
                            },
                            onFieldChange = { newValue ->
                                if (newValue.text != fieldValue.text) attachmentTrayOpen = false
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
                if (attachmentTrayOpen && ladderTiles.isNotEmpty() && !voice.isRecording && !affordances.isReadOnly) {
                    ComposerAttachmentTray(
                        tiles = ladderTiles,
                        recentMedia = {
                            ComposerRecentMedia(
                                canCapture = affordances.canSendImages || affordances.canSendVideos,
                                accentColor = accentColor,
                                onPickFile = onPickFile,
                                onPickUri = onPickUris?.let { stage -> { uri: Uri -> stage(listOf(uri)) } },
                                onEdit = { picked ->
                                    attachmentTrayOpen = false
                                    ioScope.launch {
                                        val now = System.currentTimeMillis()
                                        val opened = when {
                                            picked.mimeType?.startsWith("video") == true ->
                                                ChatVideoRetouchPending.of(context, picked.bytes, now)?.also { videoRetouch = it }
                                            else -> withContext(Dispatchers.Default) { ChatRetouchPending.of(picked.bytes, picked.fileName, picked.mimeType) }
                                                ?.also { retouch = it }
                                        }
                                        if (opened == null) onPickFile(picked.bytes, picked.fileName, picked.mimeType)
                                    }
                                },
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
            }
        },
    )
    if (emojiPickerOpen) {
        ComposerEmojiSheet(accentColor, onSelect = ::insertEmoji, onDismiss = { emojiPickerOpen = false })
    }
}

/** Au-delà, une prise vocale qui n'a pas rejoint le plateau n'est plus envoyée d'office. */
private const val VOICE_SEND_TIMEOUT_MS = 15_000L

/** Les frames laissées au champ pour revenir d'une barre repliée avant de lui donner le focus. */
private const val FOCUS_RETRY_FRAMES = 6
