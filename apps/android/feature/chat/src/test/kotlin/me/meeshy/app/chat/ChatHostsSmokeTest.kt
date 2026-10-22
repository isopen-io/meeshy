package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Smoke spec for the hosts the chat screen is assembled from (#11819): each one composes
 * from a minimal [ChatUiState] without a ViewModel, and the composer's context rows show their
 * label — the split must not change what the user sees.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatHostsSmokeTest {

    @get:Rule
    val compose = createComposeRule()

    private fun noopActions() = ChatHostActions(
        refreshActiveCall = { },
        onScrollHandled = { },
        loadOlder = { },
        refresh = { },
        openSearch = { },
        onSearchQueryChange = { _ -> },
        previousSearchMatch = { },
        nextSearchMatch = { },
        closeSearch = { },
        startReply = { _ -> },
        onMessageLongPress = { _ -> },
        toggleReaction = { _, _ -> },
        openReactionDetails = { _ -> },
        openImageViewer = { _, _ -> },
        onFileAttachmentOpen = { _, _ -> },
        onFileAttachmentShare = { _, _ -> },
        onReplyPreviewTap = { _ -> },
        onFlagTap = { _, _ -> },
        onReplyCountTap = { _ -> },
        openReplyThread = { _ -> },
        retryMessage = { _ -> },
        onPinnedBannerTap = { },
        openPinnedSheet = { },
        onMentionSelected = { _ -> },
        onDraftChange = { _ -> },
        onComposerLanguagePicked = { _ -> },
        send = { },
        openEffectsPicker = { },
        cancelEdit = { },
        cancelReply = { },
        removeClipboardContent = { },
        sendFileAttachment = { _, _, _ -> },
        dismissImageViewer = { },
        openEmojiPicker = { _ -> },
        startEdit = { _ -> },
        deleteForEveryone = { _ -> },
        deleteForMe = { _ -> },
        openForward = { _ -> },
        togglePin = { _ -> },
        toggleStar = { _ -> },
        toggleShowOriginal = { _ -> },
        openLanguageExplorer = { _ -> },
        openReport = { _ -> },
        dismissMessageActions = { },
        dismissFileDownload = { },
        selectReportReason = { _ -> },
        onReportDetailsChange = { _ -> },
        submitReport = { },
        confirmReportSubmit = { },
        cancelReportConfirmation = { },
        addReactionFromDetails = { _, _ -> },
        dismissReport = { },
        onExplorerRetranslate = { _, _ -> },
        dismissLanguageExplorer = { },
        dismissEmojiPicker = { },
        closeReactionDetails = { },
        selectReactionTab = { _ -> },
        closePinnedSheet = { },
        onPinnedMessageTap = { _ -> },
        dismissEffectsPicker = { },
        toggleEffect = { _ -> },
        selectEphemeralDuration = { _ -> },
        clearEffects = { },
        closeReplyThread = { },
        onReplyThreadReplyTap = { _ -> },
        closeForward = { },
        onForwardQueryChange = { _ -> },
        forwardTo = { _ -> },
    )

    private fun host(state: ChatUiState = ChatUiState(conversationTitle = "Équipe")) = ChatHostContext(
        state = state,
        accentColor = MeeshyPalette.Indigo500,
        actions = noopActions(),
        navigation = ChatNavigationActions(
            onBack = {},
            onStartCall = { _, _ -> },
            onRejoinCall = { _, _ -> },
            onCreateShareLink = {},
            hasLocalLiveCall = false,
        ),
        sheets = ChatSheetVisibility(),
        bubbleFrames = mutableMapOf(),
    )

    @Test
    fun `the header host shows the conversation title`() {
        compose.setContent { MeeshyTheme(darkTheme = false) { ChatHeaderHost(host()) } }
        compose.onNodeWithText("Équipe").assertExists()
    }

    @Test
    fun `the sheets host composes with nothing open`() {
        compose.setContent { MeeshyTheme(darkTheme = false) { Column { ChatSheetsHost(host()) } } }
        compose.waitForIdle()
    }

    @Test
    fun `the list host composes the empty notice on an empty conversation`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ChatListHost(host(ChatUiState(showSkeleton = false)))
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the composer reply row shows who is being answered`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ComposerReplyRow(label = "Awa", accentColor = Color.Blue, onCancel = {})
            }
        }
        compose.onNodeWithText("Replying to Awa").assertExists()
    }

    @Test
    fun `the composer edit row announces the edit`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) { ComposerEditRow(accentColor = Color.Blue, onCancel = {}) }
        }
        compose.onNodeWithText("Editing message").assertExists()
    }
}
