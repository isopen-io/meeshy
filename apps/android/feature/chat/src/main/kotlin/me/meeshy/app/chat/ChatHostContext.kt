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
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.HeaderCallEntry
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentsState
import me.meeshy.sdk.model.report.ReportReason

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
    /** [ChatViewModel.callEntry]: which call buttons the header may show. */
    val callEntry: HeaderCallEntry? = null,
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
)

@Composable
internal fun rememberChatHostContext(
    state: ChatUiState,
    composerText: StateFlow<ComposerTextState>,
    pending: PendingAttachmentsState,
    accentColor: Color,
    actions: ChatHostActions,
    navigation: ChatNavigationActions,
): ChatHostContext {
    val sheets = remember { ChatSheetVisibility() }
    // A plain map, not snapshot state: written from onGloballyPositioned without forcing
    // recomposition, read only when the overlay opens.
    val bubbleFrames = remember { mutableMapOf<String, Rect>() }
    return ChatHostContext(state, composerText, pending, accentColor, actions, navigation, sheets, bubbleFrames)
}

/** The ViewModel's user-intent entry points, as plain callbacks. */
internal class ChatHostActions(
    val refreshActiveCall: () -> Unit,
    val onScrollHandled: () -> Unit,
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
    val forwardTo: (String) -> Unit,
    val stageFile: (File, String?) -> Unit = { _, _ -> },
    val stageCapturedUris: suspend (List<Uri>) -> Unit = {},
    /** Une pièce en attente retouchée (#12735) : elle est remplacée à sa place. */
    val replacePendingAttachment: (id: String, bytes: ByteArray, fileName: String?, mimeType: String?) -> Unit = { _, _, _, _ -> },
    val readPendingBytes: suspend (PendingAttachment) -> ByteArray? = { null },
    /** Une vidéo en attente retouchée (#12735) : son rendu la remplace à sa place, puis s'efface. */
    val replacePendingVideo: (id: String, file: File) -> Unit = { _, file -> file.delete() },
    /** L'auteur que les cadres de la retouche écrivent (#12734). */
    val selfAuthor: () -> me.meeshy.sdk.model.composer.look.ComposerLookPerson? = { null },
    val trayNotices: Flow<String> = emptyFlow(),
)

internal fun ChatViewModel.hostActions(): ChatHostActions = ChatHostActions(
    refreshActiveCall = this::refreshActiveCall,
    onScrollHandled = this::onScrollHandled,
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
    pickFile = this::onPickFile,
    removePendingAttachment = { id -> controllers.find<ComposerTrayController>()?.remove(id) },
    stagePendingUris = { uris -> controllers.find<ComposerTrayController>()?.stageUris(uris) },
    stageFile = { file, mime -> controllers.find<ComposerTrayController>()?.stageFile(file, mime) },
    stageCapturedUris = { uris -> controllers.find<ComposerTrayController>()?.stageUrisAndWait(uris) },
    replacePendingAttachment = { id, bytes, name, mime -> controllers.find<ComposerTrayController>()?.replace(id, bytes, name, mime) },
    readPendingBytes = { item -> controllers.find<ComposerTrayController>()?.readBytes(item) },
    replacePendingVideo = { id, file -> controllers.find<ComposerTrayController>()?.replaceFile(id, file, ChatRetouchDelivery.VIDEO_MIME) ?: file.delete() },
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
    forwardTo = this::forwardTo,
)
