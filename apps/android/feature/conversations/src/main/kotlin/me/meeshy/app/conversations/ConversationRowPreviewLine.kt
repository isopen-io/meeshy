package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.media.rememberMediaKindStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Kind-aware preview line — the Compose surface for [RowPreview.kind]. Standard
 * typing/draft/last-message text renders as before (accent when live-activity,
 * secondary otherwise). Expired/hidden/view-once messages render italic with a
 * kind icon and a muted or accent tint that mirrors iOS
 * `ThemedConversationRow.lastMessagePreviewView`. Ephemeral-active shows the same
 * body text with a leading timer badge so a still-readable ephemeral is obvious.
 *
 * Compose glue — the kind classification (pure) is covered by [MessageSummaryKindTest]
 * / [MessageSummaryLineTest] / [ConversationRowPreviewKindTest]; the visual mapping
 * here is testable-exempt Compose per `TDD-COVERAGE.md`.
 */
@Composable
internal fun ConversationRowPreviewLine(
    preview: RowPreview,
    primaryAccent: Color,
) {
    val bodySmall = MaterialTheme.typography.bodySmall
    val textSecondary = MeeshyTheme.tokens.textSecondary
    val textMuted = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.65f)
    val standardColor = if (preview.isAccent) primaryAccent else textSecondary

    val (icon, contentDescriptionRes, tint, italic) = when (preview.kind) {
        MessageSummaryKind.EXPIRED -> RowPreviewKindStyle(
            icon = Icons.Filled.HourglassEmpty,
            contentDescriptionRes = R.string.conversations_preview_expired_content_description,
            tint = textMuted,
            italic = true,
        )
        MessageSummaryKind.HIDDEN -> RowPreviewKindStyle(
            icon = Icons.Filled.VisibilityOff,
            contentDescriptionRes = R.string.conversations_preview_hidden_content_description,
            tint = textSecondary,
            italic = true,
        )
        MessageSummaryKind.VIEW_ONCE -> RowPreviewKindStyle(
            icon = Icons.Filled.LocalFireDepartment,
            contentDescriptionRes = R.string.conversations_preview_view_once_content_description,
            tint = primaryAccent,
            italic = true,
        )
        MessageSummaryKind.EPHEMERAL_ACTIVE -> RowPreviewKindStyle(
            icon = Icons.Filled.Timer,
            contentDescriptionRes = R.string.conversations_preview_ephemeral_content_description,
            tint = standardColor,
            italic = false,
        )
        MessageSummaryKind.STANDARD -> RowPreviewKindStyle(
            icon = null,
            contentDescriptionRes = null,
            tint = standardColor,
            italic = false,
        )
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        preview.draftLabel?.let { label ->
            Text(
                text = label,
                style = bodySmall,
                color = MeeshyPalette.Error,
                maxLines = 1,
                modifier = Modifier.padding(end = MeeshySpacing.xs),
            )
        }
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescriptionRes?.let { stringResource(it) },
                tint = tint,
                modifier = Modifier
                    .size(14.dp)
                    .padding(end = MeeshySpacing.xs),
            )
        }
        Text(
            text = preview.text,
            style = bodySmall,
            color = tint,
            fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private data class RowPreviewKindStyle(
    val icon: androidx.compose.ui.graphics.vector.ImageVector?,
    val contentDescriptionRes: Int?,
    val tint: Color,
    val italic: Boolean,
)

@Composable
internal fun lastMessagePreviewLabels(): LastMessagePreviewLabels =
    LastMessagePreviewLabels(
        photo = "",
        video = "",
        voice = "",
        file = "",
        location = "",
        none = stringResource(R.string.conversations_no_messages),
        you = stringResource(R.string.conversations_preview_you),
        senderFormat = stringResource(R.string.conversations_preview_sender_format),
        draftPrefix = stringResource(R.string.conversations_preview_draft_prefix),
        draftLabel = stringResource(R.string.conversations_preview_draft_label),
        expired = stringResource(R.string.conversations_preview_expired),
        hidden = stringResource(R.string.conversations_preview_hidden),
        viewOnce = stringResource(R.string.conversations_preview_view_once),
    ).withMediaKinds(rememberMediaKindStrings())
