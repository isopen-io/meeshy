package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The reply banner above the composer field — port of iOS `composerReplyBannerBody`: an
 * accent-tinted card, a 3 dp bar in the author's colour (the accent for my own message),
 * « Author: preview » flowing on two lines, the kind glyph of a quoted media, and one
 * TalkBack sentence « Réponse à X : aperçu ».
 */
@Composable
internal fun ComposerReplyRow(banner: ComposerReplyBanner, accentColor: Color, onCancel: () -> Unit) {
    val title = when (val author = banner.author) {
        ReplyBannerAuthor.Me -> stringResource(R.string.chat_composer_reply_you)
        is ReplyBannerAuthor.Named -> author.name
        ReplyBannerAuthor.Unknown -> null
    }
    val authorColor = when (val author = banner.author) {
        is ReplyBannerAuthor.Named -> hexColor(DynamicColorGenerator.colorForName(author.name), accentColor)
        else -> accentColor
    }
    val kindLabel = replyKindLabel(banner.kind)
    val preview = banner.preview ?: kindLabel
    val spoken = stringResource(
        R.string.chat_composer_reply_a11y,
        title ?: stringResource(R.string.chat_composer_reply_unknown),
        preview.orEmpty(),
    )
    val tokens = MeeshyTheme.tokens
    val flow = buildAnnotatedString {
        if (title != null) {
            withStyle(SpanStyle(color = authorColor, fontWeight = FontWeight.SemiBold)) { append(title) }
            if (preview != null) append(": ")
        }
        if (preview != null) withStyle(SpanStyle(color = tokens.textSecondary)) { append(preview) }
        if (title == null && preview == null) {
            withStyle(SpanStyle(color = tokens.textSecondary)) {
                append(stringResource(R.string.chat_replying_to, stringResource(R.string.chat_composer_reply_unknown)))
            }
        }
    }
    ComposerBannerCard(
        tint = accentColor,
        barColor = authorColor,
        modifier = Modifier.clearAndSetSemantics { contentDescription = spoken },
        onCancel = onCancel,
        cancelLabel = stringResource(R.string.chat_cancel_reply),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            replyKindIcon(banner.kind)?.let { icon ->
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tokens.textSecondary,
                    modifier = Modifier
                        .padding(end = MeeshySpacing.xs, top = 2.dp)
                        .size(14.dp),
                )
            }
            Text(
                text = flow,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * The edit banner — port of iOS `composerEditBanner`: warning-coloured bar and pencil,
 * « Modifier le message » and the original text on one line, on a warning-tinted card.
 */
@Composable
internal fun ComposerEditRow(originalText: String?, onCancel: () -> Unit) {
    val warning = MeeshyTheme.tokens.warning
    ComposerBannerCard(
        tint = warning,
        barColor = warning,
        onCancel = onCancel,
        cancelLabel = stringResource(R.string.chat_cancel_edit),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Edit,
                contentDescription = null,
                tint = warning,
                modifier = Modifier
                    .padding(end = MeeshySpacing.xs)
                    .size(14.dp),
            )
            Text(
                text = stringResource(R.string.chat_composer_edit_title),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = warning,
            )
        }
        if (!originalText.isNullOrBlank()) {
            Text(
                text = originalText,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ComposerBannerCard(
    tint: Color,
    barColor: Color,
    onCancel: () -> Unit,
    cancelLabel: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .clip(shape)
            .background(tint.copy(alpha = 0.10f))
            .border(1.dp, tint.copy(alpha = 0.30f), shape)
            .padding(start = MeeshySpacing.md, top = MeeshySpacing.sm, bottom = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(36.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(barColor),
        )
        Column(
            modifier = modifier
                .weight(1f)
                .padding(start = MeeshySpacing.sm),
        ) { content() }
        IconButton(onClick = onCancel) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = cancelLabel,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun replyKindLabel(kind: ReplyBannerKind): String? = when (kind) {
    ReplyBannerKind.Photo -> stringResource(R.string.chat_composer_reply_photo)
    ReplyBannerKind.Video -> stringResource(R.string.chat_composer_reply_video)
    ReplyBannerKind.Voice -> stringResource(R.string.chat_composer_reply_voice)
    ReplyBannerKind.File -> stringResource(R.string.chat_composer_reply_file)
    ReplyBannerKind.Location -> stringResource(R.string.chat_composer_reply_location)
    ReplyBannerKind.Text, ReplyBannerKind.Unloaded -> null
}

private fun replyKindIcon(kind: ReplyBannerKind): ImageVector? = when (kind) {
    ReplyBannerKind.Photo -> Icons.Filled.Image
    ReplyBannerKind.Video -> Icons.Filled.Videocam
    ReplyBannerKind.Voice -> Icons.Filled.Mic
    ReplyBannerKind.File -> Icons.Filled.Description
    ReplyBannerKind.Location -> Icons.Filled.Place
    ReplyBannerKind.Text, ReplyBannerKind.Unloaded -> null
}

/**
 * Preview chip for a large paste captured into a clipboard-content attachment —
 * the thin, coverage-exempt Compose glue over the pure [ClipboardContent] (parité
 * iOS `clipboardContentPreview`: doc glyph, title, truncated body, char count, and
 * an accent-tinted remove button).
 */
@Composable
internal fun ClipboardContentPreview(
    clip: ClipboardContent,
    accentColor: Color,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Description,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(20.dp),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = MeeshySpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.chat_clipboard_title),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = clip.truncatedPreview,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(R.string.chat_clipboard_char_count, clip.charCount),
                style = MaterialTheme.typography.labelSmall,
                color = accentColor,
            )
        }
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.chat_clipboard_remove),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

