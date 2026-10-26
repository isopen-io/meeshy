package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.MessageDeletability
import me.meeshy.sdk.model.MessageEditability
import me.meeshy.sdk.model.MessagePinToggle
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.viewer.MeeshyImageViewer
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Sheets layer: every overlay of the chat screen (image gallery, message actions, file
 * download, conversation sheets, report, language explorer, emoji picker, reactions, pins,
 * effects, reply thread, forward), drawn in the order they were stacked before the split.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ChatSheetsHost(host: ChatHostContext) {
    val state = host.state
    val actions = host.actions
    val sheets = host.sheets
    val accentColor = host.accentColor
    val bubbleFrames = host.bubbleFrames
    val gallery = state.imageViewer
    val localRoute = rememberLocalDetailRoute()
    if (gallery != null) {
        val relativeStrings = rememberRelativeTimeStrings()
        val galleryNow = remember(gallery) { System.currentTimeMillis() }
        val galleryZone = ZoneId.systemDefault()
        val galleryLocale = Locale.getDefault()
        val galleryTimestamps = remember(gallery, relativeStrings) {
            gallery.createdAtIsos.map { iso ->
                iso?.let { isoToEpochMillisOrNull(it) }?.let { millis ->
                    RelativeTimeFormat.short(
                        epochMillis = millis,
                        referenceMillis = galleryNow,
                        zone = galleryZone,
                        locale = galleryLocale,
                        strings = relativeStrings,
                    )
                }
            }
        }
        val galleryContext = LocalContext.current
        val savedMessage = stringResource(R.string.image_saved_to_gallery)
        val saveFailedMessage = stringResource(R.string.image_save_failed)
        MeeshyImageViewer(
            imageUrls = gallery.imageUrls,
            initialIndex = gallery.startIndex,
            onDismiss = actions.dismissImageViewer,
            captions = gallery.captions,
            authors = gallery.senderNames,
            timestamps = galleryTimestamps,
            thumbnailUrls = gallery.thumbnailUrls,
            altTexts = gallery.altTexts,
            exportable = gallery.exportable,
            onImageSaved = { result ->
                val message = if (result.isSuccess) savedMessage else saveFailedMessage
                Toast.makeText(galleryContext, message, Toast.LENGTH_SHORT).show()
            },
        )
    }

    val actionTarget = state.actionMessageId?.let { id ->
        state.messages.firstOrNull { it.messageId == id }
    }
    if (actionTarget != null) {
        val nowMillis = System.currentTimeMillis()
        val createdAtMillis = isoToEpochMillisOrNull(actionTarget.createdAtIso)
        bubbleFrames[actionTarget.messageId]?.let { frame ->
            MessageOverlayPreviewHero(
                frame = frame,
                content = actionTarget,
                accentColor = accentColor,
            )
        }
        MessageActionsSheet(
            bubble = actionTarget,
            canEdit = !state.isEndToEnd && MessageEditability.canEdit(
                isOwn = actionTarget.isOutgoing,
                createdAtMillis = createdAtMillis,
                nowMillis = nowMillis,
            ),
            canDeleteForEveryone = MessageDeletability.canDeleteForEveryone(
                isOwn = actionTarget.isOutgoing,
                createdAtMillis = createdAtMillis,
                nowMillis = nowMillis,
            ),
            pinAction = MessagePinToggle.resolve(
                isDeleted = actionTarget.isDeleted,
                pinnedAtIso = actionTarget.pinnedAtIso,
            ),
            ownReactions = state.ownReactions[actionTarget.messageId] ?: emptySet(),
            quickReactions = state.quickReactions,
            accentColor = accentColor,
            onReact = { emoji -> actions.toggleReaction(actionTarget.messageId, emoji) },
            onExpandPicker = { actions.openEmojiPicker(actionTarget.messageId) },
            onEdit = { actions.startEdit(actionTarget.messageId) },
            onDeleteForEveryone = { actions.deleteForEveryone(actionTarget.messageId) },
            onDeleteForMe = { actions.deleteForMe(actionTarget.messageId) },
            onReply = { actions.startReply(actionTarget.messageId) },
            onForward = { actions.openForward(actionTarget.messageId) },
            onPin = { actions.togglePin(actionTarget.messageId) },
            onStar = { actions.toggleStar(actionTarget.messageId) },
            onToggleOriginal = { actions.toggleShowOriginal(actionTarget.messageId) },
            onExploreLanguages = { actions.openLanguageExplorer(actionTarget.messageId) },
            onReport = { actions.openReport(actionTarget.messageId) },
            onOpenFile = { actions.onFileAttachmentOpen(actionTarget.messageId, null) },
            onShareFile = { actions.onFileAttachmentShare(actionTarget.messageId, null) },
            onDismiss = actions.dismissMessageActions,
            hostedEntries = HOSTED_DETAIL_ENTRIES,
            onViews = { localRoute.open(MessageDetailRoute.Views(actionTarget.messageId)) },
            onHistory = { localRoute.open(MessageDetailRoute.History(actionTarget.messageId)) },
            onSentiment = { localRoute.open(MessageDetailRoute.Sentiment(actionTarget.messageId)) },
            canWrite = state.viewerMayWrite,
        )
    }

    FileAttachmentDownloadOverlay(
        download = state.fileDownload,
        onDismiss = actions.dismissFileDownload,
        onRetry = { download ->
            val attachmentId = download.attachmentId.takeIf { it.isNotBlank() }
            if (download.openWhenDone) actions.onFileAttachmentOpen(download.messageId, attachmentId)
            else actions.onFileAttachmentShare(download.messageId, attachmentId)
        },
    )

    if (sheets.settings) {
        ConversationSettingsSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            onDismiss = { sheets.settings = false },
        )
    }

    if (sheets.members) {
        ConversationMembersSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            onDismiss = { sheets.members = false },
        )
    }

    if (sheets.stats) {
        val statsZone = remember { ZoneId.systemDefault() }
        val clientMessages = remember(state.messages) {
            state.messages.filterNot { it.isDeleted }.map { it.toClientStatMessage(statsZone) }
        }
        ConversationStatsSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            clientMessages = clientMessages,
            onDismiss = { sheets.stats = false },
        )
    }

    if (sheets.analysis) {
        ConversationAnalysisSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            onDismiss = { sheets.analysis = false },
        )
    }

    val detailRoute = MessageDetailRoutes.fromChatState(
        reportMessageId = state.reportForm?.messageId,
        languagesMessageId = state.explorerMessageId.takeIf { state.languageExplorer != null },
        reactionsMessageId = state.reactionDetails?.messageId,
    ) ?: localRoute.current
    MessageDetailHost(
        route = detailRoute,
        onDismiss = { route ->
            when (route) {
                is MessageDetailRoute.Report -> actions.dismissReport()
                is MessageDetailRoute.Languages -> actions.dismissLanguageExplorer()
                is MessageDetailRoute.Reactions -> actions.closeReactionDetails()
                else -> localRoute.close(route)
            }
        },
        reactions = {
            state.reactionDetails?.let { details ->
                ReactionDetailsSheet(
                    details = details,
                    accentColor = accentColor,
                    onSelectTab = actions.selectReactionTab,
                    onReact = { emoji -> actions.addReactionFromDetails(details.messageId, emoji) },
                    onOpenFullPicker = { actions.openEmojiPicker(details.messageId) },
                    modifier = Modifier.navigationBarsPadding(),
                )
            }
        },
        languages = { route ->
            state.languageExplorer?.let { explorer ->
                MessageLanguageExplorerSheet(
                    explorer = explorer,
                    accentColor = accentColor,
                    onSelectLanguage = { code -> actions.onFlagTap(route.messageId, code) },
                    onRetranslate = { code -> actions.onExplorerRetranslate(route.messageId, code) },
                    onDismiss = actions.dismissLanguageExplorer,
                )
            }
        },
        report = {
            state.reportForm?.let { form ->
                ReportMessageSheet(
                    form = form,
                    accentColor = accentColor,
                    onSelectReason = actions.selectReportReason,
                    onDetailsChange = actions.onReportDetailsChange,
                    onSubmit = actions.submitReport,
                    onConfirmSubmit = actions.confirmReportSubmit,
                    onCancelConfirm = actions.cancelReportConfirmation,
                    onDismiss = actions.dismissReport,
                )
            }
        },
    )

    val pickerMessageId = state.emojiPickerMessageId
    if (pickerMessageId != null) {
        androidx.compose.ui.window.Dialog(
            onDismissRequest = actions.dismissEmojiPicker,
            properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
        ) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) { detectTapGestures { actions.dismissEmojiPicker() } },
            ) {
                me.meeshy.ui.component.ReactionCategorySheet(
                    onReact = { emoji ->
                        actions.toggleReaction(pickerMessageId, emoji)
                        actions.dismissEmojiPicker()
                    },
                    onDismiss = actions.dismissEmojiPicker,
                    accentColor = accentColor,
                    modifier = Modifier.align(androidx.compose.ui.Alignment.BottomCenter),
                )
            }
        }
    }

    if (state.isPinnedSheetOpen) {
        ModalBottomSheet(
            onDismissRequest = actions.closePinnedSheet,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            PinnedMessagesSheet(
                pins = state.pinnedMessages,
                accentColor = accentColor,
                onTap = actions.onPinnedMessageTap,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    if (state.isEffectsPickerOpen) {
        ModalBottomSheet(
            onDismissRequest = actions.dismissEffectsPicker,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            EffectsPickerSheet(
                effects = state.pendingEffects,
                accentColor = accentColor,
                onToggle = actions.toggleEffect,
                onSelectDuration = actions.selectEphemeralDuration,
                onClear = actions.clearEffects,
                onDone = actions.dismissEffectsPicker,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    val replyThread = state.replyThreadOverlay
    if (replyThread != null) {
        ModalBottomSheet(
            onDismissRequest = actions.closeReplyThread,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            ReplyThreadSheet(
                overlay = replyThread,
                accentColor = accentColor,
                onReplyTap = actions.onReplyThreadReplyTap,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    val forward = state.forward
    if (forward != null) {
        ModalBottomSheet(
            onDismissRequest = actions.closeForward,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            ForwardPickerSheet(
                forward = forward,
                accentColor = accentColor,
                onQueryChange = actions.onForwardQueryChange,
                onForwardTo = actions.forwardTo,
                onDismiss = actions.closeForward,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }
}

/** Detail/selection entries the chat host can serve today; each joins once its fiche renderer exists. */
private val HOSTED_DETAIL_ENTRIES: Set<MessageAction> = emptySet()
