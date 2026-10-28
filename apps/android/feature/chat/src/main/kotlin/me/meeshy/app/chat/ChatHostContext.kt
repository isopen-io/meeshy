package me.meeshy.app.chat

import android.net.Uri
import java.io.File
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.HeaderCallEntry
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentsState
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.selection.MessageSelection

/**
 * Navigation-level callbacks the screen receives from its host (the nav graph): leaving the
 * chat, placing or rejoining a call, opening the share-link creator.
 */
internal class ChatNavigationActions(
    val onBack: () -> Unit,
    val onStartCall: (peerName: String, isVideo: Boolean) -> Unit,
    val onRejoinCall: (call: ActiveCallSession, peerName: String) -> Unit,
    val onCreateShareLink: () -> Unit,
    val hasLocalLiveCall: Boolean,
    /** Ouvre le post (story) cité par un message : la carte de citation du fil (#13296). */
    val onOpenCitedPost: (postId: String) -> Unit = {},
    /** [ChatViewModel.callEntry]: which call buttons the header may show. */
    val callEntry: HeaderCallEntry? = null,
    /** [ChatViewModel.mayInviteFriends]: whether the info sheet offers « Inviter mes amis ». */
    val mayInviteFriends: Boolean = false,
    /**
     * La feuille « Partage de position » ouverte par le (i) du sélecteur de lieu. Elle vit dans
     * `:feature:settings`, que `:feature:chat` ne voit pas : l'application la fournit.
     */
    val locationSettingsSheet: @Composable (accent: androidx.compose.ui.graphics.Color, onDismiss: () -> Unit) -> Unit = { _, _ -> },
)

/**
 * Local visibility of the conversation-level sheets opened from the header and rendered by the
 * sheets host. Plain UI state: nothing here belongs to the ViewModel.
 */
@Stable
internal class ChatSheetVisibility {
    var settings by mutableStateOf(false)
    var members by mutableStateOf(false)
    var stats by mutableStateOf(false)
    var analysis by mutableStateOf(false)

    /** La fiche Conversation, ouverte par l'avatar de l'en-tête (parité iOS `ConversationInfoSheet`). */
    var info by mutableStateOf(false)

    /** L'écran « Médias, liens et documents », ouvert depuis la fiche Conversation. */
    var media by mutableStateOf(false)

    /** « Fond et accent » : le choix personnel du fond de la conversation. */
    var appearance by mutableStateOf(false)

    /** La fiche Chiffrement (#13463). */
    var encryption by mutableStateOf(false)

    /** La vérification du numéro de sécurité d'un groupe chiffré de bout en bout (#13463). */
    var securityVerification by mutableStateOf(false)
}

/**
 * L'état du chrome partagé entre la liste et l'en-tête : la liste dit qu'elle défile, l'en-tête
 * efface alors sa grappe d'actions (iOS `hiddenWhileScrolling`).
 */
@Stable
internal class ChatChromeState {
    var isScrolling by mutableStateOf(false)
    /**
     * Un défilement parti du DOIGT est en cours (glissé puis son élan) — jamais un saut
     * programmé (nouveau message, recherche). En rangée plate il efface l'en-tête et le
     * composeur par opacité (iOS `FocalChromeReturn`).
     */
    var isUserScrolling by mutableStateOf(false)
    /** L'en-tête est déplié : la pastille de jour flottante se retire (iOS `isHeaderExpanded`). */
    var isHeaderExpanded by mutableStateOf(false)
}

/**
 * Everything the five hosts of the chat screen share: the collected [state], the composer's
 * [pending] attachments tray, the conversation
 * [accentColor], the ViewModel entry points reduced to [actions] (hosts never read the
 * ViewModel), the [navigation] callbacks, the [sheets] visibility and the window-space
 * [bubbleFrames] captured by the list for the long-press preview hero.
 */
@Stable
internal class ChatHostContext(
    val state: ChatUiState,
    val composerText: StateFlow<ComposerTextState>,
    val pending: PendingAttachmentsState,
    val accentColor: Color,
    val actions: ChatHostActions,
    val navigation: ChatNavigationActions,
    val sheets: ChatSheetVisibility,
    val bubbleFrames: MutableMap<String, Rect>,
    /** Ce que l'en-tête montre en plus de [state] : avatar, pair, non-lus des autres conversations. */
    val header: ChatHeaderState = ChatHeaderState(),
    val chrome: ChatChromeState = ChatChromeState(),
    /** Le mode de lecture et ses deux gestes (chip de l'en-tête) ; `null` tant qu'il n'est pas résolu. */
    val readingMode: ChatReadingModeBinding? = null,
    /** Le lieu choisi dans le sélecteur, en attente du prochain envoi. */
    val pendingPlace: me.meeshy.sdk.model.SharedPlace? = null,
    /** Le mode sélection multiple (#13294) : inactif tant qu'aucun appui long n'a choisi « Sélectionner ». */
    val selection: MessageSelection = MessageSelection.Inactive,
    /** La Flamme de l'en-tête (#13297) : l'instantané servi et l'annonce d'un envoi du lecteur. */
    val engagement: ChatEngagementBinding = ChatEngagementBinding.None,
)

/** Ce que l'en-tête lit du [ChatEngagementController], sans connaître le contrôleur. */
internal class ChatEngagementBinding(
    val snapshot: me.meeshy.sdk.model.ConversationEngagementSnapshot?,
    val sent: kotlinx.coroutines.flow.SharedFlow<Unit>,
) {
    companion object {
        val None = ChatEngagementBinding(null, NO_SENT)
    }
}

/** Le mode de lecture résolu à l'ouverture et les écritures du chip. */
internal class ChatReadingModeBinding(
    val state: ReadingModeUiState,
    val select: (me.meeshy.sdk.model.reading.mode.ConversationReadingMode) -> Unit,
    val resetToAuto: () -> Unit,
    /** Le Résumé vivant : l'enrichissement de l'agent, l'identité du lecteur, sa relance. */
    val summary: LivingSummaryBinding = LivingSummaryBinding.NONE,
)

/** Ce que le Résumé vivant lit du contrôleur, sans connaître le contrôleur. */
internal class LivingSummaryBinding(
    val agent: StateFlow<LivingSummaryAgentState>,
    val viewer: StateFlow<SummaryViewer?>,
    val refreshAgent: () -> Unit,
) {
    companion object {
        val NONE = LivingSummaryBinding(NO_SUMMARY_AGENT, NO_SUMMARY_VIEWER) {}
    }
}

@Composable
internal fun rememberChatHostContext(
    state: ChatUiState,
    composerText: StateFlow<ComposerTextState>,
    pending: PendingAttachmentsState,
    accentColor: Color,
    actions: ChatHostActions,
    navigation: ChatNavigationActions,
    header: ChatHeaderState = ChatHeaderState(),
    readingMode: ChatReadingModeBinding? = null,
    pendingPlace: me.meeshy.sdk.model.SharedPlace? = null,
    selection: MessageSelection = MessageSelection.Inactive,
    engagement: ChatEngagementBinding = ChatEngagementBinding.None,
): ChatHostContext {
    val sheets = remember { ChatSheetVisibility() }
    // A plain map, not snapshot state: written from onGloballyPositioned without forcing
    // recomposition, read only when the overlay opens.
    val bubbleFrames = remember { mutableMapOf<String, Rect>() }
    val chrome = remember { ChatChromeState() }
    return ChatHostContext(state, composerText, pending, accentColor, actions, navigation, sheets, bubbleFrames, header, chrome, readingMode, pendingPlace, selection, engagement)
}

/** The ViewModel's user-intent entry points, as plain callbacks. */
internal class ChatHostActions(
    val refreshActiveCall: () -> Unit,
    val onScrollHandled: () -> Unit,
    val scrollToMessage: (String) -> Unit = {},
    val loadOlder: () -> Unit,
    val refresh: () -> Unit,
    val openSearch: () -> Unit,
    val onSearchQueryChange: (String) -> Unit,
    val previousSearchMatch: () -> Unit,
    val nextSearchMatch: () -> Unit,
    val closeSearch: () -> Unit,
    val startReply: (String) -> Unit,
    val onMessageLongPress: (String) -> Unit,
    val toggleReaction: (String, String) -> Unit,
    val openReactionDetails: (String) -> Unit,
    val openImageViewer: (String, Int) -> Unit,
    val onFileAttachmentOpen: (String, String?) -> Unit,
    val onHubFileOpen: (String, ApiMessageAttachment) -> Unit,
    val onFileAttachmentShare: (String, String?) -> Unit,
    val onReplyPreviewTap: (String) -> Unit,
    val onFlagTap: (String, String) -> Unit,
    val onReplyCountTap: (String) -> Unit,
    val openReplyThread: (String) -> Unit,
    val retryMessage: (String) -> Unit,
    val onPinnedBannerTap: () -> Unit,
    val openPinnedSheet: () -> Unit,
    val onMentionSelected: (MentionCandidate) -> Unit,
    val onDraftChange: (String) -> Unit,
    val onComposerLanguagePicked: (String) -> Unit,
    val send: () -> Unit,
    val openEffectsPicker: () -> Unit,
    val cancelEdit: () -> Unit,
    val cancelReply: () -> Unit,
    val removeClipboardContent: () -> Unit,
    val setPendingPlace: (me.meeshy.sdk.model.SharedPlace) -> Unit,
    val clearPendingPlace: () -> Unit,
    val pickFile: (ByteArray, String, String?) -> Unit,
    val removePendingAttachment: (String) -> Unit,
    val stagePendingUris: (List<Uri>) -> Unit,
    val dismissImageViewer: () -> Unit,
    val openEmojiPicker: (String) -> Unit,
    val startEdit: (String) -> Unit,
    val deleteForEveryone: (String) -> Unit,
    val deleteForMe: (String) -> Unit,
    val openForward: (String) -> Unit,
    val togglePin: (String) -> Unit,
    val toggleStar: (String) -> Unit,
    val toggleShowOriginal: (String) -> Unit,
    val openLanguageExplorer: (String) -> Unit,
    val openReport: (String) -> Unit,
    val dismissMessageActions: () -> Unit,
    val dismissFileDownload: () -> Unit,
    val selectReportReason: (ReportReason) -> Unit,
    val onReportDetailsChange: (String) -> Unit,
    val submitReport: () -> Unit,
    val confirmReportSubmit: () -> Unit,
    val cancelReportConfirmation: () -> Unit,
    val addReactionFromDetails: (String, String) -> Unit,
    val dismissReport: () -> Unit,
    val onExplorerRetranslate: (String, String) -> Unit,
    val dismissLanguageExplorer: () -> Unit,
    val dismissEmojiPicker: () -> Unit,
    val closeReactionDetails: () -> Unit,
    val selectReactionTab: (Int) -> Unit,
    val closePinnedSheet: () -> Unit,
    val onPinnedMessageTap: (String) -> Unit,
    val dismissEffectsPicker: () -> Unit,
    val toggleEffect: (Long) -> Unit,
    val selectEphemeralDuration: (EphemeralDuration) -> Unit,
    val clearEffects: () -> Unit,
    val closeReplyThread: () -> Unit,
    val onReplyThreadReplyTap: (String) -> Unit,
    val closeForward: () -> Unit,
    val onForwardQueryChange: (String) -> Unit,
    /** The single share sheet (#13469): tick a recipient, caption, flame duration, then Send. */
    val toggleForwardRecipient: (String) -> Unit = {},
    val onForwardCaptionChange: (String) -> Unit = {},
    val onForwardDurationChange: (Int) -> Unit = {},
    val sendForward: () -> Unit = {},
    val stageFile: (File, String?) -> Unit = { _, _ -> },
    val stageCapturedUris: suspend (List<Uri>) -> Unit = {},
    /** Une pièce en attente retouchée (#12735) : elle est remplacée à sa place. */
    val replacePendingAttachment: (id: String, bytes: ByteArray, fileName: String?, mimeType: String?) -> Unit = { _, _, _, _ -> },
    val readPendingBytes: suspend (PendingAttachment) -> ByteArray? = { null },
    /** Une vidéo en attente retouchée (#12735) : son rendu la remplace à sa place, puis s'efface. */
    val replacePendingVideo: (id: String, file: File) -> Unit = { _, file -> file.delete() },
    /** Un son en attente édité (#13462) : le fichier rendu le remplace à sa place, puis s'efface. */
    val replacePendingAudio: (id: String, file: File) -> Unit = { _, file -> file.delete() },
    /** L'auteur que les cadres de la retouche écrivent (#12734). */
    val selfAuthor: () -> me.meeshy.sdk.model.composer.look.ComposerLookPerson? = { null },
    val trayNotices: Flow<String> = emptyFlow(),
    /** « Sélectionner » du menu d'appui long : entre dans le mode en semant ce message. */
    val beginSelection: (String) -> Unit = {},
    /** Coche ou décoche un message ; le verdict dit si le plafond de 100 est atteint. */
    val toggleSelection: (String) -> MessageSelection.Toggle = { MessageSelection.Toggle.Ignored },
    val endSelection: () -> Unit = {},
    /** Transférer la sélection (ids dans l'ordre du fil). */
    val forwardSelection: (List<String>) -> Unit = {},
    val deleteSelectionForEveryone: (List<String>) -> Unit = {},
    val deleteSelectionForMe: (List<String>) -> Unit = {},
    val toggleStars: (List<String>) -> Unit = {},
)

internal fun ChatViewModel.hostActions(): ChatHostActions = ChatHostActions(
    refreshActiveCall = this::refreshActiveCall,
    onScrollHandled = this::onScrollHandled,
    scrollToMessage = this::scrollToMessage,
    loadOlder = this::loadOlder,
    refresh = this::refresh,
    openSearch = this::openSearch,
    onSearchQueryChange = this::onSearchQueryChange,
    previousSearchMatch = this::previousSearchMatch,
    nextSearchMatch = this::nextSearchMatch,
    closeSearch = this::closeSearch,
    startReply = this::startReply,
    onMessageLongPress = this::onMessageLongPress,
    toggleReaction = this::toggleReaction,
    openReactionDetails = this::openReactionDetails,
    openImageViewer = this::openImageViewer,
    onFileAttachmentOpen = this::onFileAttachmentOpen,
    onHubFileOpen = this::onHubFileOpen,
    onFileAttachmentShare = this::onFileAttachmentShare,
    onReplyPreviewTap = this::onReplyPreviewTap,
    onFlagTap = this::onFlagTap,
    onReplyCountTap = this::onReplyCountTap,
    openReplyThread = this::openReplyThread,
    retryMessage = this::retryMessage,
    onPinnedBannerTap = this::onPinnedBannerTap,
    openPinnedSheet = this::openPinnedSheet,
    onMentionSelected = this::onMentionSelected,
    onDraftChange = this::onDraftChange,
    onComposerLanguagePicked = this::onComposerLanguagePicked,
    send = this::send,
    openEffectsPicker = this::openEffectsPicker,
    cancelEdit = this::cancelEdit,
    cancelReply = this::cancelReply,
    removeClipboardContent = this::removeClipboardContent,
    setPendingPlace = this::setPendingPlace,
    clearPendingPlace = this::clearPendingPlace,
    pickFile = this::onPickFile,
    removePendingAttachment = { id -> controllers.find<ComposerTrayController>()?.remove(id) },
    stagePendingUris = { uris -> controllers.find<ComposerTrayController>()?.stageUris(uris) },
    stageFile = { file, mime -> controllers.find<ComposerTrayController>()?.stageFile(file, mime) },
    stageCapturedUris = { uris -> controllers.find<ComposerTrayController>()?.stageUrisAndWait(uris) },
    replacePendingAttachment = { id, bytes, name, mime -> controllers.find<ComposerTrayController>()?.replace(id, bytes, name, mime) },
    readPendingBytes = { item -> controllers.find<ComposerTrayController>()?.readBytes(item) },
    replacePendingVideo = { id, file -> controllers.find<ComposerTrayController>()?.replaceFile(id, file, ChatRetouchDelivery.VIDEO_MIME) ?: file.delete() },
    replacePendingAudio = { id, file -> controllers.find<ComposerTrayController>()?.replaceFile(id, file, EDITED_AUDIO_MIME) ?: file.delete() },
    selfAuthor = this::selfAuthor,
    trayNotices = controllers.find<ComposerTrayController>()?.notices ?: emptyFlow(),
    dismissImageViewer = this::dismissImageViewer,
    openEmojiPicker = this::openEmojiPicker,
    startEdit = this::startEdit,
    deleteForEveryone = this::deleteForEveryone,
    deleteForMe = this::deleteForMe,
    openForward = this::openForward,
    togglePin = this::togglePin,
    toggleStar = this::toggleStar,
    toggleShowOriginal = this::toggleShowOriginal,
    openLanguageExplorer = this::openLanguageExplorer,
    openReport = this::openReport,
    dismissMessageActions = this::dismissMessageActions,
    dismissFileDownload = this::dismissFileDownload,
    selectReportReason = this::selectReportReason,
    onReportDetailsChange = this::onReportDetailsChange,
    submitReport = this::submitReport,
    confirmReportSubmit = this::confirmReportSubmit,
    cancelReportConfirmation = this::cancelReportConfirmation,
    addReactionFromDetails = this::addReactionFromDetails,
    dismissReport = this::dismissReport,
    onExplorerRetranslate = this::onExplorerRetranslate,
    dismissLanguageExplorer = this::dismissLanguageExplorer,
    dismissEmojiPicker = this::dismissEmojiPicker,
    closeReactionDetails = this::closeReactionDetails,
    selectReactionTab = this::selectReactionTab,
    closePinnedSheet = this::closePinnedSheet,
    onPinnedMessageTap = this::onPinnedMessageTap,
    dismissEffectsPicker = this::dismissEffectsPicker,
    toggleEffect = this::toggleEffect,
    selectEphemeralDuration = this::selectEphemeralDuration,
    clearEffects = this::clearEffects,
    closeReplyThread = this::closeReplyThread,
    onReplyThreadReplyTap = this::onReplyThreadReplyTap,
    closeForward = this::closeForward,
    onForwardQueryChange = this::onForwardQueryChange,
    toggleForwardRecipient = this::toggleForwardRecipient,
    onForwardCaptionChange = this::onForwardCaptionChange,
    onForwardDurationChange = this::onForwardDurationChange,
    sendForward = this::sendForward,
    beginSelection = { id -> controllers.find<MessageSelectionController>()?.begin(id) },
    toggleSelection = { id -> controllers.find<MessageSelectionController>()?.toggle(id) ?: MessageSelection.Toggle.Ignored },
    endSelection = { controllers.find<MessageSelectionController>()?.end() },
    forwardSelection = this::openForwardSelection,
    deleteSelectionForEveryone = this::deleteSelectionForEveryone,
    deleteSelectionForMe = this::deleteSelectionForMe,
    toggleStars = this::toggleStars,
)

/** Le rendu de l'éditeur audio est un m4a (AAC), comme la prise du micro. */
private const val EDITED_AUDIO_MIME = "audio/mp4"
