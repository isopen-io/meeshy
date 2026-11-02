package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.story.StoryReplyRules
import me.meeshy.ui.component.ReactionCategorySheet
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Les feuilles, boîtes de dialogue et sélecteurs
 * qui recouvrent le lecteur, et l'état qui dit lesquels sont ouverts ([StoryViewerChromeState]). Un lot qui
 * ajoute une feuille (réglages, partage, signalement enrichi) la monte ICI, avec son propre drapeau.
 */
@Stable
internal class StoryViewerChromeState {
    var showViewers by mutableStateOf(false)
    var showComments by mutableStateOf(false)
    var showReply by mutableStateOf(false)
    var showSendTo by mutableStateOf(false)
    var showOptions by mutableStateOf(false)
    var showReportDialog by mutableStateOf(false)
    var showDeleteDialog by mutableStateOf(false)

    val sheetOpen: Boolean get() = showViewers || showComments || showReply || showSendTo
    val dialogOpen: Boolean get() = showReportDialog || showDeleteDialog
}

@Composable
internal fun rememberStoryViewerChromeState(): StoryViewerChromeState = remember { StoryViewerChromeState() }

@Composable
internal fun StoryViewerSheetsHost(
    state: StoryViewerUiState,
    chrome: StoryViewerChromeState,
    rail: StoryRailController,
    viewModel: StoryViewerViewModel,
    slide: StorySlideView?,
    accent: String,
    commentThread: PostCommentsViewModel?,
    currentItem: StoryItem?,
    onClose: () -> Unit,
) {
    if (chrome.showDeleteDialog) {
        StoryDeleteDialog(
            onDismiss = { chrome.showDeleteDialog = false },
            onConfirm = {
                chrome.showDeleteDialog = false
                viewModel.deleteCurrentStory(onEmpty = onClose)
            },
        )
    }
    if (chrome.showReportDialog) {
        StoryReportDialog(
            onDismiss = { chrome.showReportDialog = false },
            onPick = { reason ->
                viewModel.reportCurrentStory(reason)
                chrome.showReportDialog = false
            },
        )
    }
    if (rail.showFullEmojiPicker) {
        StoryFullEmojiPicker(
            onDismiss = { rail.showFullEmojiPicker = false },
            onReact = { emoji ->
                rail.showFullEmojiPicker = false
                rail.sendReaction(emoji, from = null)
            },
        )
    }

    state.languageExplorer?.let { explorer ->
        StoryLanguageSheet(
            explorer = explorer,
            onSelectLanguage = viewModel::selectLanguage,
            onTranslate = viewModel::requestStoryTranslation,
            onDismiss = viewModel::closeLanguageExplorer,
        )
    }

    val viewersStoryId = state.currentStoryId
    if (chrome.showViewers && viewersStoryId != null) {
        StoryViewersSheet(
            storyId = viewersStoryId,
            accentHex = accent,
            onDismiss = { chrome.showViewers = false },
        )
    }

    val replyStoryId = state.currentStoryId
    val replyAuthorId = state.authorUserId
    if (chrome.showReply && replyStoryId != null && replyAuthorId != null) {
        StoryReplySheet(
            quote = StoryReplyQuote(
                storyId = replyStoryId,
                authorId = replyAuthorId,
                authorName = state.authorName,
                preview = StoryReplyRules.quotePreview(slide?.text),
                thumbnailUrl = slide?.imageUrl,
                accentHex = accent,
            ),
            onDismiss = { chrome.showReply = false },
        )
    }

    if (chrome.showComments && commentThread != null) {
        StoryCommentsThreadSheet(
            thread = commentThread,
            serverCommentCount = currentItem?.commentCount ?: 0,
            onDismiss = { chrome.showComments = false },
        )
    }
}

@Composable
private fun StoryDeleteDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.stories_delete_confirm_title)) },
        text = { Text(stringResource(R.string.stories_delete_confirm_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.stories_action_delete), color = MeeshyPalette.Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.stories_cancel)) }
        },
    )
}

@Composable
private fun StoryReportDialog(onDismiss: () -> Unit, onPick: (ReportReason) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.stories_report_title)) },
        text = {
            Column {
                ReportReason.entries.forEach { reason ->
                    Text(
                        text = reportReasonLabel(reason),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyPalette.White,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(reason) }
                            .padding(vertical = MeeshySpacing.md),
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.stories_cancel)) }
        },
    )
}

@Composable
private fun reportReasonLabel(reason: ReportReason): String = when (reason) {
    ReportReason.SPAM -> stringResource(R.string.stories_report_reason_spam)
    ReportReason.HARASSMENT -> stringResource(R.string.stories_report_reason_harassment)
    ReportReason.INAPPROPRIATE -> stringResource(R.string.stories_report_reason_inappropriate)
    ReportReason.VIOLENCE -> stringResource(R.string.stories_report_reason_violence)
    ReportReason.HATE_SPEECH -> stringResource(R.string.stories_report_reason_hate_speech)
    ReportReason.IMPERSONATION -> stringResource(R.string.stories_report_reason_impersonation)
    ReportReason.OTHER -> stringResource(R.string.stories_report_reason_other)
}

@Composable
private fun StoryFullEmojiPicker(onDismiss: () -> Unit, onReact: (String) -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) { detectTapGestures { onDismiss() } },
        ) {
            ReactionCategorySheet(
                onReact = onReact,
                onDismiss = onDismiss,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}
