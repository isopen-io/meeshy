package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.text.input.TextFieldValue
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.PendingAttachmentsState
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
        pickFile = { _, _, _ -> },
        removePendingAttachment = { _ -> },
        stagePendingUris = { _ -> },
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
        composerText = kotlinx.coroutines.flow.MutableStateFlow(ComposerTextState()),
        pending = PendingAttachmentsState(),
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
    fun `the header host names the conversation on its avatar, as iOS's collapsed band`() {
        compose.setContent { MeeshyTheme(darkTheme = false) { ChatHeaderHost(host()) } }
        // Replié (par défaut, comme iOS), l'en-tête ne montre pas le nom : l'avatar le porte.
        compose.onNodeWithContentDescription("Équipe", substring = true).assertExists()
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
    fun `the composer reply row names the author and announces the quoted preview`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ComposerReplyRow(
                    banner = ComposerReplyBanner(ReplyBannerAuthor.Named("Awa"), "On se voit ?", ReplyBannerKind.Text),
                    accentColor = Color.Blue,
                    onCancel = {},
                )
            }
        }
        compose.onNodeWithContentDescription("Replying to Awa: On se voit ?").assertExists()
    }

    @Test
    fun `replying to my own voice note reads You and the kind of the piece`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ComposerReplyRow(
                    banner = ComposerReplyBanner(ReplyBannerAuthor.Me, null, ReplyBannerKind.Voice),
                    accentColor = Color.Blue,
                    onCancel = {},
                )
            }
        }
        compose.onNodeWithContentDescription("Replying to You: Voice message").assertExists()
    }

    @Test
    fun `a reply whose quoted message is not loaded reads Replying to a message`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ComposerReplyRow(banner = ComposerReplyBanner.of(null), accentColor = Color.Blue, onCancel = {})
            }
        }
        compose.onNodeWithContentDescription("Replying to a message").assertExists()
    }

    @Test
    fun `the composer edit row shows the title and the original text`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) { ComposerEditRow(originalText = "typo", onCancel = {}) }
        }
        compose.onNodeWithText("Edit the message").assertExists()
        compose.onNodeWithText("typo").assertExists()
    }

    @Test
    fun `the keyboard send key sends the message`() {
        var sent = 0
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ComposerInputRow(
                    isEditing = false,
                    hasAttachmentTiles = false,
                    attachmentTrayOpen = false,
                    fieldValue = TextFieldValue("Bonjour"),
                    showMic = false,
                    hasSomethingToSend = true,
                    sendEnabled = true,
                    accentColor = Color.Blue,
                    onToggleTray = {},
                    onFieldChange = {},
                    onRequestVoice = {},
                    onSend = { sent += 1 },
                )
            }
        }
        compose.onNode(hasSetTextAction()).performImeAction()
        assertThat(sent).isEqualTo(1)
    }
}
