package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The quoted-message section of a bubble: shown when the message replies to another one (even a
 * deleted one). A blank quoted text falls back to the media label ("Photo", "Attachment"), then to
 * the deleted label. The preview is tappable only when the quoted message id is known.
 */
@Composable
internal fun BubbleReplySection(
    content: BubbleContent,
    onColor: Color,
    onReplyPreviewClick: (() -> Unit)?,
    onQuotedAudioClick: ((BubbleAudio) -> Unit)? = null,
) {
    if (content.replyToText == null && !content.replyToDeleted) return
    val voice = content.replyToAudio?.takeIf { !content.replyToDeleted }
    val mediaLabel = when {
        voice != null -> stringResource(R.string.media_label_audio)
        content.replyToMediaKind == ReplyMediaKind.Image -> stringResource(R.string.bubble_reply_photo)
        content.replyToMediaKind == ReplyMediaKind.File -> stringResource(R.string.bubble_reply_attachment)
        else -> null
    }
    val replyText = content.replyToText?.takeIf { it.isNotBlank() }
        ?: mediaLabel
        ?: stringResource(R.string.bubble_message_deleted)
    ReplyPreview(
        senderName = content.replyToSenderName,
        previewText = replyText,
        mediaKind = if (content.replyToDeleted) ReplyMediaKind.None else content.replyToMediaKind,
        thumbnailUrl = content.replyToThumbnailUrl,
        accentColor = onColor,
        onClick = onReplyPreviewClick?.takeIf { content.replyToId != null },
        onPlayVoice = voice?.let { audio -> onQuotedAudioClick?.let { click -> { click(audio) } } },
        modifier = Modifier.padding(bottom = MeeshySpacing.xs),
    )
}

@Composable
private fun ReplyPreview(
    senderName: String?,
    previewText: String,
    mediaKind: ReplyMediaKind,
    thumbnailUrl: String?,
    accentColor: Color,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onPlayVoice: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .let { base -> if (onClick == null) base else base.clickable(onClick = onClick) }
            .background(accentColor.copy(alpha = 0.12f))
            .padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(2.dp)
                .fillMaxHeight()
                .background(accentColor),
        )
        if (thumbnailUrl != null) {
            AsyncImage(
                model = thumbnailUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .padding(start = MeeshySpacing.xs)
                    .size(32.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(accentColor.copy(alpha = 0.15f)),
            )
        }
        Column(
            modifier = Modifier.padding(
                start = MeeshySpacing.xs,
                end = MeeshySpacing.sm,
            ),
        ) {
            if (senderName != null) {
                Text(
                    text = senderName,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                val mediaIcon = when (mediaKind) {
                    ReplyMediaKind.Image -> MeeshyIcons.PhotoFilled
                    ReplyMediaKind.File -> MeeshyIcons.AttachFile
                    ReplyMediaKind.None -> null
                }
                if (mediaIcon != null && thumbnailUrl == null) {
                    Icon(
                        imageVector = mediaIcon,
                        contentDescription = null,
                        tint = accentColor.copy(alpha = 0.8f),
                        modifier = Modifier
                            .padding(end = 2.dp)
                            .size(14.dp),
                    )
                }
                Text(
                    text = previewText,
                    style = MaterialTheme.typography.bodySmall,
                    color = accentColor.copy(alpha = 0.8f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (onPlayVoice != null) {
            IconButton(onClick = onPlayVoice, modifier = Modifier.size(QUOTED_VOICE_TOUCH_TARGET)) {
                Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = stringResource(R.string.media_audio_play),
                    tint = accentColor,
                )
            }
        }
    }
}

/** La cible tactile du ▶ d'une citation de vocal : 48 dp, la même que tout bouton de la bulle. */
private val QUOTED_VOICE_TOUCH_TARGET = 48.dp
