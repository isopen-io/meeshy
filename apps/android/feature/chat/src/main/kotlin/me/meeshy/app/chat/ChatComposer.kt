package me.meeshy.app.chat

import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.media.MediaIntake
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
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
import me.meeshy.ui.component.composer.ComposerStickerPick
import me.meeshy.ui.component.composer.LocalComposerStickerSheet
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.sdk.model.EphemeralChoice
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.guest.GuestAttachmentAllowance
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.composer.ComposerCapability
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.sdk.model.composer.ComposerFieldAfterSend
import me.meeshy.sdk.model.composer.ComposerSendAlignment
import me.meeshy.sdk.model.composer.ComposerTextFormat
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
    closure: me.meeshy.sdk.model.ComposerClosure? = null,
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
    onPickFile: (file: File, fileName: String, mimeType: String?) -> Unit,
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
    onSelectEphemeralChoice: (EphemeralChoice?) -> Unit = {},
    quickEmojis: List<String> = ComposerToolbarLaw.QUICK_EMOJI_DEFAULTS,
    onQuickEmoji: ((String) -> Unit)? = null,
    pendingSlot: (@Composable () -> Unit)? = null,
    pendingAttachmentCount: Int = 0,
    /** Ouvre le sélecteur de lieu ; `null` = la tuile « Lieu » n'est pas offerte. */
    onLocationRequest: (() -> Unit)? = null,
    /** Les familles que le lien d'un invité ouvre ; restreintes, la porte « Fichier » ouvre la feuille de l'invité (#10006). */
    guestAllowance: GuestAttachmentAllowance = GuestAttachmentAllowance.UNRESTRICTED,
    conversationTitle: String = "",
    /** Le réglage du composeur universel (#14265) : une porte qu'il ferme ne s'affiche pas ; la conversation les ouvre toutes. */
    configuration: ComposerConfiguration = ComposerConfiguration.CONVERSATION,
    /** Le texte indicatif du champ ; `null` = celui d'un message. */
    placeholder: String? = null,
    /**
     * Une conversation envoie le sticker choisi d'un geste, avec sa recette (#14334, iOS `sendStickerImage`) ; `null` (un
     * commentaire) : son image rejoint les pièces.
     */
    onSendSticker: ((ComposerStickerPick) -> Unit)? = null,
) {
    val context = LocalContext.current
    var guestSheetOpen by rememberSaveable { mutableStateOf(false) }
    val ioScope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }
    val receivePicked: (List<Uri>) -> Unit = receive@{ uris ->
        if (uris.isEmpty()) return@receive
        if (onPickUris != null) return@receive onPickUris(uris)
        ioScope.launch {
            val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, uris.first()) } ?: return@launch
            onPickFile(picked.file, picked.fileName, picked.mimeType)
        }
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents(), receivePicked)
    // La photothèque est le sélecteur de photos du système (#14286), comme la grille des médias récents — jamais
    // celui des fichiers, qui ouvrait documentsui.
    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(RecentMediaSource.HEAD_SAMPLE_COUNT),
        receivePicked,
    )
    val openPhotos: () -> Unit = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) }
    PasteContentReceiverEffect(onPickFile)
    val voice = rememberComposerVoice(onStageVoiceFile, onPickFile, conversationTitle = conversationTitle)
    me.meeshy.ui.component.permission.PermissionFlowHost(voice.permissions, accent = accentColor)
    var minimized by rememberSaveable { mutableStateOf(false) }
    var fieldFocused by remember { mutableStateOf(false) }
    val isComposing = ConversationComposerFold.isComposing(isFocused = fieldFocused, isRecording = voice.isRecording)
    // Clavier baissé (retour système) = le champ rend la main, comme `resignFirstResponder` sur
    // iOS : sans cela le champ resterait focalisé et le ⌄ ne reviendrait jamais.
    val dock = rememberComposerDock(rememberComposerKeyboardState())
    val attachmentTrayOpen = dock.attachmentPanelOpen
    val emojiPickerOpen = dock.emojiPanelOpen
    val density = LocalDensity.current
    val imeVisible = WindowInsets.ime.getBottom(density) > 0
    var imeWasVisible by remember { mutableStateOf(false) }
    LaunchedEffect(imeVisible) {
        if (imeWasVisible && !imeVisible) dock.keyboardHidden()
        if (imeWasVisible && !imeVisible && fieldFocused) focusManager.clearFocus()
        imeWasVisible = imeVisible
    }
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
    me.meeshy.app.chat.camera.ComposerCameraPrewarm(offered = configuration.offers(ComposerCapability.CAMERA))
    val ladderTiles = remember(affordances, onLocationRequest != null, guestAllowance, configuration) {
        ComposerAttachmentLadder.tiles(
            affordances,
            hasRecentMediaStrip = true,
            showCamera = true,
            showContact = guestAllowance.offersContactsAndPlaces,
            showLocation = onLocationRequest != null,
            showEmoji = true,
            configuration = configuration,
        )
    }
    val pickContactCard = rememberContactCardPicker(onCard = onPickFile)
    // Cursor-aware mirror of `draft` so the Emoji tile inserts at the caret; `draft` stays the source of truth.
    var fieldValue by remember { mutableStateOf(TextFieldValue(draft, selection = TextRange(draft.length))) }
    LaunchedEffect(draftRevision) { fieldValue = TextFieldValue(draft, selection = TextRange(draft.length)) }
    fun insertEmoji(emoji: String) {
        val r = ComposerEmojiInsertion.insert(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end, emoji)
        fieldValue = TextFieldValue(r.text, TextRange(r.cursor))
        onDraftChange(r.text)
    }
    val returnKey = remember { ComposerReturnKeyHandler() }
    var awaitingHostEmpty by remember { mutableStateOf(false) }
    LaunchedEffect(draft, awaitingHostEmpty) {
        if (awaitingHostEmpty && ComposerSendAlignment.shouldClearLocalText(hostText = draft, localText = fieldValue.text)) {
            fieldValue = TextFieldValue(ComposerFieldAfterSend.resolve(fieldValue.text, draft, ComposerFieldAfterSend.Sender.HOST))
            awaitingHostEmpty = false
        }
    }
    fun applyEmphasis(style: ComposerTextFormat.Style) {
        val text = fieldValue.text
        val start = ComposerTextFormat.graphemeIndex(text, fieldValue.selection.min)
        val end = ComposerTextFormat.graphemeIndex(text, fieldValue.selection.max)
        val r = ComposerTextFormat.toggle(text, start, end, style)
        if (configuration.bounded(r.text) != r.text) return
        fieldValue = TextFieldValue(
            r.text,
            TextRange(ComposerTextFormat.utf16Offset(r.text, r.start), ComposerTextFormat.utf16Offset(r.text, r.end)),
        )
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
        val stage = onStageCapturedUris ?: return onPickFile(withContext(Dispatchers.IO) { context.writeRetouchedCaptureFile(file) }, file.fileName, file.mimeType)
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
            withContext(Dispatchers.IO) { MediaIntake.adopt(file, context.cacheDir, file.name, ChatRetouchDelivery.VIDEO_MIME) }?.let { item ->
                (item.source as? MediaUploadSource.OnDisk)?.let { onPickFile(it.file, file.name, ChatRetouchDelivery.VIDEO_MIME) }
            }
        }
        withContext(Dispatchers.IO) { pending.discard() }
    }
    val handleCapture: suspend (Uri, Boolean) -> Unit = { uri, isVideo ->
        val stage = onStageCapturedUris
        val picked = if (isVideo) null else withContext(Dispatchers.IO) { readPickedAttachment(context, uri) }
        val pending = picked?.let { withContext(Dispatchers.Default) { ChatRetouchPending.of(it.bytes, it.fileName, it.mimeType) } }
        val video = if (isVideo) ChatVideoRetouchPending.of(context, uri, System.currentTimeMillis()) else null
        if (video != null || pending != null || stage != null) picked?.file?.delete()
        when {
            video != null -> videoRetouch = video
            pending != null -> retouch = pending
            stage != null -> stage(listOf(uri))
            else -> (picked ?: withContext(Dispatchers.IO) { readPickedAttachment(context, uri) })?.let { file ->
                onPickFile(file.file, file.fileName, file.mimeType)
            }
        }
    }
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
    val showMic = !isEditing && draft.isBlank() && clipboardContent == null && !hasPendingAttachments && affordances.canSendAudios &&
        configuration.offers(ComposerCapability.VOICE)
    val canCapture = affordances.canSendImages || affordances.canSendVideos
    val interact = hostCallbacks.onAnyInteraction
    fun sendFromKeyboard() {
        if (!(hasContent || isEditing) || !(canSend && (isEditing || slowMode.canSend))) return
        interact()
        haptics.light()
        awaitingHostEmpty = true
        onSend()
    }
    val stickerSheet = LocalComposerStickerSheet.current
    var stickerSheetOpen by rememberSaveable { mutableStateOf(false) }
    val openStickers: (() -> Unit)? = if (stickerSheet != null && affordances.canSendImages) {
        { interact(); haptics.light(); stickerSheetOpen = true }
    } else {
        null
    }
    if (stickerSheetOpen && stickerSheet != null) {
        stickerSheet(
            { pick ->
                stickerSheetOpen = false
                onSendSticker?.invoke(pick) ?: onPickFile(pick.file, pick.file.name, pick.mimeType)
            },
            { stickerSheetOpen = false },
        )
    }
    // Le ⌄ (iOS `CommentComposerFoldModifier.fold`) : ferme le clavier et ce qui est ouvert dans le
    // verre, haptique légère, puis replie. Brouillon, réponse et pièces jointes vivent au-dessus.
    val fold: () -> Unit = {
        interact()
        focusManager.clearFocus()
        haptics.light()
        dock.closePanels()
        ephemeralRailOpen = false
        effectsPanelOpen = false
        cameraChooserOpen = false
        dock.closePanels()
        fieldFocused = false
        minimized = true
    }

    ComposerDropBand(
        enabled = canSend && !affordances.isReadOnly,
        accentColor = accentColor,
        onPickFile = onPickFile,
        onText = ::insertEmoji,
    ) {
    ComposerShellLayout(
        minimized = minimized,
        canMinimize = canMinimize,
        onMinimizeOutcome = { outcome ->
            when (outcome) {
                ComposerMinimizeOutcome.MINIMIZE -> {
                    dock.closePanels()
                    focusManager.clearFocus()
                    minimized = true
                }
                ComposerMinimizeOutcome.DISMISS_SURFACES -> {
                    dock.closePanels()
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
                    ComposerViewfinderHost(
                        canSendImages = affordances.canSendImages,
                        canSendVideos = affordances.canSendVideos,
                        captureScope = ioScope,
                        onCaptured = handleCapture,
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
                        selected = EphemeralChoice.of(effects),
                        accentColor = accentColor,
                        onPick = { choice ->
                            haptics.light()
                            onSelectEphemeralChoice(choice)
                            ephemeralRailOpen = false
                        },
                    )
                }
                if (inputAvailable && !isEditing && effectsPanelOpen) {
                    MessageEffectsPanel(
                        effects = effects,
                        accentColor = accentColor,
                        onToggle = onToggleEffect,
                        onClear = onClearEffects,
                        sections = configuration.effectSections,
                        modifier = Modifier.padding(start = MeeshySpacing.sm, end = MeeshySpacing.sm, top = MeeshySpacing.sm),
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
                                onSelectEphemeralChoice(null)
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
                        onLibrary = if (canCapture && configuration.offers(ComposerCapability.PHOTO_LIBRARY)) {
                            { interact(); openPhotos() }
                        } else {
                            null
                        },
                        onCamera = if (canCapture && configuration.offers(ComposerCapability.CAMERA)) {
                            { interact(); cameraChooserOpen = true }
                        } else {
                            null
                        },
                        accentColor = accentColor,
                        onFold = if (foldable && configuration.offersFold(minimized, isComposing)) fold else null,
                        configuration = configuration,
                        onSticker = openStickers,
                        counter = me.meeshy.sdk.model.composer.ComposerCounterLaw.state(draft.length, configuration.maxLength),
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
                    closure != null -> ComposerClosureNotice(
                        closure = closure,
                        accentColor = accentColor,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
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
                        if (fieldFocused && !fieldValue.selection.collapsed) {
                            ComposerFormatBar(
                                accentColor = accentColor,
                                onFormat = { style ->
                                    interact()
                                    haptics.light()
                                    applyEmphasis(style)
                                },
                                modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
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
                            onQuickEmoji = onQuickEmoji?.takeIf { configuration.offers(ComposerCapability.QUICK_EMOJIS) }?.let { send ->
                                { emoji: String ->
                                    interact()
                                    haptics.light()
                                    send(emoji)
                                }
                            },
                            onQuickEmojiLongPress = {
                                interact()
                                focusManager.clearFocus()
                                dock.openEmojiPanel()
                            },
                            focusRequester = focusRequester,
                            placeholder = placeholder,
                            onFocusChange = { focused ->
                                fieldFocused = focused
                                if (focused) {
                                    interact()
                                    dock.fieldFocused()
                                }
                            },
                            onToggleTray = {
                                interact()
                                if (attachmentTrayOpen) {
                                    dock.closePanels()
                                    runCatching { focusRequester.requestFocus() }
                                } else {
                                    focusManager.clearFocus()
                                    dock.toggleAttachmentPanel()
                                }
                            },
                            onFieldChange = { typed ->
                                val resolved = returnKey.resolve(fieldValue, typed)
                                val kept = resolved.value
                                val bounded = configuration.bounded(kept.text)
                                val newValue = if (bounded == kept.text) kept else TextFieldValue(bounded, TextRange(bounded.length))
                                if (newValue.text != fieldValue.text && dock.state.isPanelOpen) dock.fieldFocused()
                                if (newValue.text != fieldValue.text) awaitingHostEmpty = false
                                fieldValue = newValue
                                onDraftChange(newValue.text)
                                if (resolved.sends) sendFromKeyboard()
                            },
                            fieldModifier = returnKey.hardwareKeys { sendFromKeyboard() },
                            onRequestVoice = {
                                interact()
                                voice.request()
                            },
                            onSend = {
                                interact()
                                haptics.light()
                                awaitingHostEmpty = true
                                onSend()
                            },
                        )
                    }
                }
                if (attachmentTrayOpen && ladderTiles.isNotEmpty() && !voice.isRecording && !affordances.isReadOnly) {
                    val recentStrip: @Composable () -> Unit = {
                        ComposerRecentMedia(
                            canCapture = canCapture,
                            accentColor = accentColor,
                            onPickFile = onPickFile,
                            onPickUri = onPickUris?.let { stage -> { uri: Uri -> stage(listOf(uri)) } },
                            onEdit = { picked ->
                                dock.closePanels()
                                ioScope.launch {
                                    val now = System.currentTimeMillis()
                                    val opened = when {
                                        picked.mimeType?.startsWith("video") == true ->
                                            ChatVideoRetouchPending.of(context, picked.file, now)?.also { videoRetouch = it }
                                        else -> withContext(Dispatchers.Default) { ChatRetouchPending.of(picked.bytes, picked.fileName, picked.mimeType) }
                                            ?.also { retouch = it }
                                    }
                                    if (opened == null) onPickFile(picked.file, picked.fileName, picked.mimeType) else picked.file.delete()
                                }
                            },
                        )
                    }
                    ComposerPanelSlot(minHeight = dock.attachmentPanelHeight()) {
                    ComposerAttachmentTray(
                        tiles = ladderTiles,
                        recentMedia = recentStrip.takeIf { configuration.offers(ComposerCapability.PHOTO_LIBRARY) },
                        handle = {
                            ComposerPanelHandle(
                                onOpenFullLibrary = { dock.closePanels(); openPhotos() },
                                onClose = { dock.closePanels() },
                            )
                        },
                        onTileClick = { kind ->
                            dock.closePanels()
                            when (kind) {
                                AttachmentTileKind.Photo -> openPhotos()
                                AttachmentTileKind.File ->
                                    if (guestAllowance.isRestricted) guestSheetOpen = true else filePicker.launch("*/*")
                                AttachmentTileKind.Voice -> voice.request()
                                AttachmentTileKind.Camera -> cameraChooserOpen = true
                                AttachmentTileKind.Emoji -> dock.openEmojiPanel()
                                AttachmentTileKind.Location -> onLocationRequest?.invoke()
                                AttachmentTileKind.Contact -> pickContactCard()
                            }
                        },
                    )
                    }
                }
                if (emojiPickerOpen && !voice.isRecording && !affordances.isReadOnly) {
                    ComposerEmojiPanel(accentColor = accentColor, onSelect = ::insertEmoji)
                }
            }
        },
    )
    }
    if (guestSheetOpen) {
        GuestAttachmentSheet(
            conversationTitle = conversationTitle,
            allowance = guestAllowance,
            onAccepted = { uris ->
                if (onPickUris != null) {
                    onPickUris(uris)
                } else {
                    ioScope.launch {
                        val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, uris.first()) } ?: return@launch
                        onPickFile(picked.file, picked.fileName, picked.mimeType)
                    }
                }
            },
            onDismiss = { guestSheetOpen = false },
        )
    }
}

/** Au-delà, une prise vocale qui n'a pas rejoint le plateau n'est plus envoyée d'office. */
private const val VOICE_SEND_TIMEOUT_MS = 15_000L

/** Les frames laissées au champ pour revenir d'une barre repliée avant de lui donner le focus. */
private const val FOCUS_RETRY_FRAMES = 6
