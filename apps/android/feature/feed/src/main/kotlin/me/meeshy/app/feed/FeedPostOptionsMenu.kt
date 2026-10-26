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
import me.meeshy.sdk.model.report.ReportReason
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
    onShare: () -> Unit,
    onCopyLink: () -> Unit,
    onCopyText: () -> Unit,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
    onBookmarkToggle: () -> Unit,
    onPin: () -> Unit,
    onReport: () -> Unit,
    onDelete: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }) {
            Icon(
                imageVector = Icons.Filled.MoreVert,
                contentDescription = stringResource(R.string.feed_post_options),
                tint = MeeshyTheme.tokens.textSecondary,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            PostActionMenu.actions(PostActionContext(isOwn = isOwn, isBookmarked = isBookmarked, hasText = hasText)).forEach { action ->
                val (label, handler) = when (action) {
                    PostAction.Share -> stringResource(R.string.feed_action_share) to onShare
                    PostAction.CopyLink -> stringResource(R.string.feed_action_copy_link) to onCopyLink
                    PostAction.CopyText -> stringResource(R.string.feed_action_copy_text) to onCopyText
                    PostAction.Repost -> stringResource(R.string.feed_action_repost) to onRepost
                    PostAction.Quote -> stringResource(R.string.feed_action_quote) to onQuote
                    PostAction.Bookmark -> stringResource(R.string.feed_action_bookmark) to onBookmarkToggle
                    PostAction.Unbookmark -> stringResource(R.string.feed_action_unbookmark) to onBookmarkToggle
                    PostAction.Pin -> stringResource(R.string.feed_action_pin) to onPin
                    PostAction.Report -> stringResource(R.string.feed_action_report) to onReport
                    PostAction.Delete -> stringResource(R.string.feed_action_delete) to onDelete
                }
                DropdownMenuItem(
                    text = {
                        Text(
                            text = label,
                            color = if (action == PostAction.Delete) MeeshyPalette.Error else MeeshyTheme.tokens.textPrimary,
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
                ReportReason.entries.forEach { reason ->
                    val label = when (reason) {
                        ReportReason.SPAM -> stringResource(R.string.feed_report_reason_spam)
                        ReportReason.HARASSMENT -> stringResource(R.string.feed_report_reason_harassment)
                        ReportReason.INAPPROPRIATE -> stringResource(R.string.feed_report_reason_inappropriate)
                        ReportReason.VIOLENCE -> stringResource(R.string.feed_report_reason_violence)
                        ReportReason.HATE_SPEECH -> stringResource(R.string.feed_report_reason_hate_speech)
                        ReportReason.IMPERSONATION -> stringResource(R.string.feed_report_reason_impersonation)
                        ReportReason.OTHER -> stringResource(R.string.feed_report_reason_other)
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
