package me.meeshy.app.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.PendingSendMenu
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'overflow en haut a droite de chaque card — rendu bete de [PostActionMenu],
 * qui decide seul de la liste et de l'ordre (verrouille par test).
 */
@Composable
internal fun PostOptionsButton(
    isOwn: Boolean,
    isBookmarked: Boolean,
    hasText: Boolean,
    onShare: (() -> Unit)?,
    onCopyLink: (() -> Unit)?,
    onCopyText: (() -> Unit)?,
    onRepost: (() -> Unit)?,
    onQuote: (() -> Unit)?,
    onBookmarkToggle: (() -> Unit)?,
    onPin: (() -> Unit)?,
    onReport: (() -> Unit)?,
    onDelete: (() -> Unit)?,
    tint: androidx.compose.ui.graphics.Color = MeeshyTheme.tokens.textSecondary,
    onImager: (() -> Unit)? = null,
    onOpen: (() -> Unit)? = null,
    pendingSend: PendingSendActions? = null,
) {
    var expanded by remember { mutableStateOf(false) }
    val haptics = rememberMeeshyHaptics()
    val context = PostActionContext(
        isOwn = isOwn,
        isBookmarked = isBookmarked,
        hasText = hasText,
        imageable = onImager != null,
        canOpen = onOpen != null,
        pendingSend = pendingSend?.let { PendingSendMenu(canRetry = it.canRetry, canReopen = it.canReopen) },
    )
    // Sans effet, une entrée n'est pas offerte ; sans entrée, le bouton « ⋯ » n'est pas dessiné (#12234, #13244).
    val wired: (PostAction) -> Boolean = { action ->
        when (action) {
            PostAction.Share -> onShare != null
            PostAction.CopyLink -> onCopyLink != null
            PostAction.CopyText -> onCopyText != null
            PostAction.Repost -> onRepost != null
            PostAction.Quote -> onQuote != null
            PostAction.Bookmark, PostAction.Unbookmark -> onBookmarkToggle != null
            PostAction.Pin -> onPin != null
            PostAction.Report -> onReport != null
            PostAction.Delete -> onDelete != null
            PostAction.SaveMedia, PostAction.ViewViewers, PostAction.Edit, PostAction.NearHere -> false
            else -> true
        }
    }
    val offered = PostActionMenu.actions(context).filter(wired)
    if (offered.isEmpty()) return
    Box {
        IconButton(onClick = { expanded = true }) {
            Icon(
                imageVector = Icons.Filled.MoreVert,
                contentDescription = stringResource(R.string.feed_post_options),
                tint = tint,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            offered.forEach { action ->
                val (label, handler) = when (action) {
                    PostAction.Open -> stringResource(R.string.feed_post_open) to { haptics.light(); (onOpen ?: {})() }
                    PostAction.Share -> stringResource(R.string.feed_action_share) to { haptics.light(); onShare?.invoke(); Unit }
                    PostAction.CopyLink -> stringResource(R.string.feed_action_copy_link) to { haptics.success(); onCopyLink?.invoke(); Unit }
                    PostAction.CopyText -> stringResource(R.string.feed_action_copy_text) to { haptics.success(); onCopyText?.invoke(); Unit }
                    PostAction.Repost -> stringResource(R.string.feed_action_repost) to { onRepost?.invoke(); Unit }
                    PostAction.Quote -> stringResource(R.string.feed_action_quote) to { onQuote?.invoke(); Unit }
                    PostAction.Bookmark -> stringResource(R.string.feed_action_bookmark) to { haptics.light(); onBookmarkToggle?.invoke(); Unit }
                    PostAction.Unbookmark -> stringResource(R.string.feed_action_unbookmark) to { haptics.light(); onBookmarkToggle?.invoke(); Unit }
                    PostAction.Imager -> stringResource(R.string.feed_comment_imagine) to (onImager ?: {})
                    PostAction.Pin -> stringResource(R.string.feed_action_pin) to { haptics.light(); onPin?.invoke(); Unit }
                    PostAction.Report -> stringResource(R.string.feed_action_report) to { haptics.medium(); onReport?.invoke(); Unit }
                    PostAction.Delete -> stringResource(R.string.feed_action_delete) to { haptics.medium(); onDelete?.invoke(); Unit }
                    PostAction.RetrySend -> stringResource(R.string.feed_unsent_retry) to { haptics.light(); pendingSend?.onRetry?.invoke(); Unit }
                    PostAction.ReopenSend -> stringResource(R.string.feed_unsent_reopen) to { haptics.light(); pendingSend?.onReopen?.invoke(); Unit }
                    PostAction.CancelSend -> stringResource(R.string.feed_pending_cancel_send) to { haptics.medium(); pendingSend?.onCancel?.invoke(); Unit }
                    PostAction.SaveMedia, PostAction.ViewViewers, PostAction.Edit, PostAction.NearHere -> return@forEach
                }
                DropdownMenuItem(
                    text = {
                        Text(
                            text = label,
                            color = if (action == PostAction.Delete || action == PostAction.CancelSend) MeeshyPalette.Error else MeeshyTheme.tokens.textPrimary,
                        )
                    },
                    onClick = {
                        expanded = false
                        handler()
                    },
                )
            }
        }
    }
}

/** Choix de la raison de signalement — memes raisons wire que le report utilisateur. */
@Composable
internal fun ReportPostDialog(
    onDismiss: () -> Unit,
    onReport: (ReportReason) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feed_report_title)) },
        text = {
            Column {
                ReportReason.entries.filterNot { it == ReportReason.FAKE_PROFILE }.forEach { reason ->
                    val label = when (reason) {
                        ReportReason.SPAM -> stringResource(R.string.feed_report_reason_spam)
                        ReportReason.HARASSMENT -> stringResource(R.string.feed_report_reason_harassment)
                        ReportReason.INAPPROPRIATE -> stringResource(R.string.feed_report_reason_inappropriate)
                        ReportReason.VIOLENCE -> stringResource(R.string.feed_report_reason_violence)
                        ReportReason.HATE_SPEECH -> stringResource(R.string.feed_report_reason_hate_speech)
                        ReportReason.IMPERSONATION -> stringResource(R.string.feed_report_reason_impersonation)
                        ReportReason.OTHER, ReportReason.FAKE_PROFILE -> stringResource(R.string.feed_report_reason_other)
                    }
                    Text(
                        text = label,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyTheme.tokens.textPrimary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onReport(reason) }
                            .padding(vertical = MeeshySpacing.md),
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.feed_delete_cancel)) }
        },
    )
}

/** Confirmation de suppression d'un de ses propres posts. */
@Composable
internal fun DeletePostDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feed_delete_confirm_title)) },
        text = { Text(stringResource(R.string.feed_delete_confirm_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.feed_delete_confirm), color = MeeshyPalette.Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.feed_delete_cancel))
            }
        },
    )
}
