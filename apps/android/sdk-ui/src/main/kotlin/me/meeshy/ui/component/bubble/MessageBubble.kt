package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalFoundationApi::class)
@Composable
public fun MessageBubble(
    content: BubbleContent,
    modifier: Modifier = Modifier,
    outgoingColor: Color = MeeshyPalette.Indigo500,
    onLongPress: (() -> Unit)? = null,
    onReactionClick: ((String) -> Unit)? = null,
    onReactionLongPress: (() -> Unit)? = null,
    onImageClick: ((Int) -> Unit)? = null,
    onLocationClick: ((BubbleLocation) -> Unit)? = null,
    onAudioClick: ((BubbleAudio) -> Unit)? = null,
    onReplyPreviewClick: (() -> Unit)? = null,
    onFlagTap: ((String) -> Unit)? = null,
    mentionDisplayNames: Map<String, String>? = null,
    highlightTerm: String? = null,
    trackedLinks: Map<String, String>? = null,
    effects: MessageEffects? = null,
    hasPlayedAppearance: Boolean = false,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                start = MeeshySpacing.lg,
                end = MeeshySpacing.lg,
                // Consecutive-sender runs stack tightly: only the first message of a
                // run gets a top gap and only the last a bottom gap, so a run reads
                // as one visual block while distinct messages keep their 4dp breathing
                // room (isFirst && isLast).
                top = if (content.isFirstInGroup) MeeshySpacing.xs else MeeshySpacing.none,
                bottom = if (content.isLastInGroup) MeeshySpacing.xs else MeeshySpacing.none,
            ),
        horizontalArrangement = if (content.isOutgoing) Arrangement.End else Arrangement.Start,
    ) {
        val isFreeEmoji =
            content.emojiOnlyCount > 0 && content.replyToText == null && !content.isDeleted
        val onColor = when {
            isFreeEmoji -> MeeshyTheme.tokens.textPrimary
            content.isOutgoing -> MeeshyPalette.White
            else -> MeeshyTheme.tokens.textPrimary
        }
        val bubbleBackground = when {
            isFreeEmoji -> Color.Transparent
            content.isOutgoing -> outgoingColor
            else -> MeeshyTheme.tokens.backgroundTertiary
        }
        Column(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .messageEffects(
                    effects = effects ?: MessageEffects(),
                    hasPlayedAppearance = hasPlayedAppearance,
                    shape = RoundedCornerShape(MeeshyRadius.xl),
                )
                .clip(RoundedCornerShape(MeeshyRadius.xl))
                .background(bubbleBackground)
                .let { base ->
                    if (onLongPress == null) base
                    else base.combinedClickable(onClick = {}, onLongClick = onLongPress)
                }
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        ) {
            if (content.isForwarded) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = null,
                        tint = onColor.copy(alpha = 0.6f),
                        modifier = Modifier.size(13.dp),
                    )
                    Text(
                        text = stringResource(R.string.bubble_forwarded),
                        style = MaterialTheme.typography.labelSmall,
                        fontStyle = FontStyle.Italic,
                        color = onColor.copy(alpha = 0.6f),
                        modifier = Modifier.padding(start = 3.dp),
                    )
                }
            }

            if (content.showSenderName && content.senderName != null) {
                Text(
                    text = content.senderName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = onColor,
                )
            }

            if (content.replyToText != null || content.replyToDeleted) {
                val mediaLabel = when (content.replyToMediaKind) {
                    ReplyMediaKind.Image -> stringResource(R.string.bubble_reply_photo)
                    ReplyMediaKind.File -> stringResource(R.string.bubble_reply_attachment)
                    ReplyMediaKind.None -> null
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
                    modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                )
            }

            if (content.storyReply != null) {
                StoryReplyPreview(
                    story = content.storyReply,
                    accentColor = onColor,
                    modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                )
            }

            if (!content.isDeleted && content.images.isNotEmpty()) {
                BubbleImageGrid(
                    images = content.images,
                    onImageClick = onImageClick,
                    modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                )
            }

            if (!content.isDeleted && content.files.isNotEmpty()) {
                content.files.forEach { file ->
                    BubbleFileRow(
                        file = file,
                        onColor = onColor,
                        modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                    )
                }
            }

            if (!content.isDeleted && content.locations.isNotEmpty()) {
                content.locations.forEach { location ->
                    LocationPreview(
                        location = location,
                        onColor = onColor,
                        onClick = onLocationClick?.takeIf { location.hasCoordinates }
                            ?.let { { it(location) } },
                        modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                    )
                }
            }

            if (!content.isDeleted && content.audios.isNotEmpty()) {
                content.audios.forEach { audio ->
                    AudioBubble(
                        audio = audio,
                        onColor = onColor,
                        onClick = onAudioClick?.takeIf { audio.isPlayable }
                            ?.let { { it(audio) } },
                        modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                    )
                }
            }

            val hasAttachments = content.images.isNotEmpty() ||
                content.files.isNotEmpty() ||
                content.locations.isNotEmpty() ||
                content.audios.isNotEmpty()
            if (content.isDeleted) {
                Text(
                    text = stringResource(R.string.bubble_message_deleted),
                    style = MaterialTheme.typography.bodyMedium,
                    fontStyle = FontStyle.Italic,
                    color = onColor.copy(alpha = 0.6f),
                )
            } else if (content.text.isNotBlank() || !hasAttachments) {
                val emojiFontSize = EmojiDetector.fontSizeSp(content.emojiOnlyCount)
                if (emojiFontSize != null) {
                    Text(
                        text = content.text,
                        fontSize = emojiFontSize.sp,
                        lineHeight = (emojiFontSize + 8).sp,
                        modifier = if (content.replyToText != null) {
                            Modifier.align(Alignment.CenterHorizontally)
                        } else {
                            Modifier
                        },
                    )
                } else {
                    RichMessageText(
                        text = content.text,
                        color = onColor,
                        style = MaterialTheme.typography.bodyMedium,
                        highlightColor = MeeshyPalette.Warning.copy(alpha = 0.45f),
                        mentionDisplayNames = mentionDisplayNames,
                        highlightTerm = highlightTerm,
                        trackedLinks = trackedLinks,
                    )
                }
            }

            if (!content.isDeleted && content.languageStrip.isNotEmpty()) {
                LanguageStrip(
                    chips = content.languageStrip,
                    onColor = onColor,
                    onFlagTap = onFlagTap,
                    modifier = Modifier.padding(top = MeeshySpacing.xs),
                )
            }

            if (content.reactions.isNotEmpty()) {
                ReactionStrip(
                    reactions = content.reactions,
                    onReactionClick = onReactionClick,
                    onReactionLongPress = onReactionLongPress,
                    modifier = Modifier.padding(top = MeeshySpacing.xs),
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MeeshySpacing.xs),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (content.isStarred && !content.isDeleted) {
                        Icon(
                            imageVector = Icons.Filled.Bookmark,
                            contentDescription = stringResource(R.string.bubble_starred),
                            tint = onColor.copy(alpha = 0.7f),
                            modifier = Modifier
                                .size(14.dp)
                                .padding(end = MeeshySpacing.xs),
                        )
                    }
                    if (content.isTranslated) {
                        Icon(
                            imageVector = Icons.Filled.Translate,
                            contentDescription = stringResource(R.string.bubble_translated),
                            tint = onColor.copy(alpha = 0.7f),
                            modifier = Modifier.size(14.dp),
                        )
                    }
                    if (content.isEdited) {
                        Text(
                            text = stringResource(R.string.bubble_edited),
                            style = MaterialTheme.typography.labelSmall,
                            color = onColor.copy(alpha = 0.7f),
                            modifier = Modifier.padding(start = MeeshySpacing.xs),
                        )
                    }
                }

                if (content.isOutgoing) {
                    DeliveryStatusIcon(
                        status = content.deliveryStatus,
                        onColor = onColor,
                    )
                }
            }
        }
    }
}

/**
 * Discrete Prisme flag strip under a translated bubble — the original language
 * plus each configured content language that has content, projected by
 * [MessageLanguageStrip]. The active language reads its native name in its own
 * accent colour; the others show flag-only. When [onFlagTap] is present each chip
 * is tappable to switch the bubble's displayed language (the active flag reverts
 * to the default resolution); without it the strip stays a read-only indicator.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LanguageStrip(
    chips: List<LanguageChip>,
    onColor: Color,
    modifier: Modifier = Modifier,
    onFlagTap: ((String) -> Unit)? = null,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        chips.forEach { chip ->
            val accent = chip.info?.colorHex
                ?.let(::hexColor)
                ?.takeIf { it != Color.Unspecified }
                ?: onColor
            val flag = chip.info?.flag ?: chip.code.uppercase()
            val label = chip.info?.name ?: chip.code
            // A translatable chip (a configured language with no content yet) reads
            // as a dimmed flag with a "+" affordance — tapping requests it. Content
            // chips render at full strength; the active one shows its native name.
            val flagAlpha = if (chip.isTranslatable) 0.55f else 1f
            val chipLabel = if (chip.isTranslatable) "$label — translate" else label
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(
                        if (chip.isActive) accent.copy(alpha = 0.16f) else Color.Transparent,
                    )
                    .let { base ->
                        if (onFlagTap == null) base
                        else base
                            .clickable { onFlagTap(chip.code) }
                            .semantics { role = Role.Button }
                    }
                    .padding(horizontal = 6.dp, vertical = 2.dp)
                    .semantics(mergeDescendants = true) { contentDescription = chipLabel },
            ) {
                Text(
                    text = flag,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.alpha(flagAlpha),
                )
                if (chip.isTranslatable) {
                    Text(
                        text = "+",
                        style = MaterialTheme.typography.labelSmall,
                        color = onColor.copy(alpha = 0.7f),
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 2.dp),
                    )
                } else if (chip.isActive && chip.info != null) {
                    Text(
                        text = chip.info.nativeName,
                        style = MaterialTheme.typography.labelSmall,
                        color = accent,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 3.dp),
                    )
                }
            }
        }
    }
}

private const val MAX_GRID_IMAGES = 4

@Composable
private fun BubbleImageGrid(
    images: List<BubbleImage>,
    onImageClick: ((Int) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    when {
        images.size == 1 -> {
            val image = images.first()
            val ratio = imageAspectRatio(image)
            AsyncImage(
                model = image.url,
                contentDescription = stringResource(R.string.bubble_image_description),
                contentScale = ContentScale.Crop,
                modifier = modifier
                    .width(252.dp)
                    .aspectRatio(ratio)
                    .clip(shape)
                    .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
                    .let { base ->
                        if (onImageClick == null) base
                        else base.clickable { onImageClick(0) }.semantics { role = Role.Button }
                    },
            )
        }
        else -> {
            val visible = images.take(MAX_GRID_IMAGES)
            val hiddenCount = images.size - visible.size
            Column(
                modifier = modifier.width(252.dp),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                visible.chunked(2).forEachIndexed { rowIndex, row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                        row.forEachIndexed { columnIndex, image ->
                            val imageIndex = rowIndex * 2 + columnIndex
                            val isLastCell =
                                hiddenCount > 0 && imageIndex == visible.lastIndex
                            Box(
                                modifier = Modifier
                                    .size(124.dp)
                                    .clip(shape)
                                    .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
                                    .let { base ->
                                        if (onImageClick == null) base
                                        else base.clickable { onImageClick(imageIndex) }
                                            .semantics { role = Role.Button }
                                    },
                            ) {
                                AsyncImage(
                                    model = image.thumbnailUrl ?: image.url,
                                    contentDescription = stringResource(R.string.bubble_image_description),
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(124.dp),
                                )
                                if (isLastCell) {
                                    val hiddenLabel = stringResource(R.string.bubble_hidden_images, hiddenCount)
                                    Box(
                                        modifier = Modifier
                                            .size(124.dp)
                                            .background(Color.Black.copy(alpha = 0.45f))
                                            .clearAndSetSemantics { contentDescription = hiddenLabel },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            text = "+$hiddenCount",
                                            color = MeeshyPalette.White,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 20.sp,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun imageAspectRatio(image: BubbleImage): Float {
    val width = image.width ?: return 1f
    val height = image.height ?: return 1f
    if (width <= 0 || height <= 0) return 1f
    return (width.toFloat() / height.toFloat()).coerceIn(0.6f, 1.8f)
}

@Composable
private fun BubbleFileRow(
    file: BubbleFile,
    onColor: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.AttachFile,
            contentDescription = null,
            tint = onColor.copy(alpha = 0.8f),
            modifier = Modifier.size(16.dp),
        )
        Column {
            Text(
                text = file.name ?: stringResource(R.string.bubble_attachment_file_fallback),
                style = MaterialTheme.typography.bodySmall,
                color = onColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val size = file.sizeBytes?.let { formatFileSize(it) }
            if (size != null) {
                Text(
                    text = size,
                    style = MaterialTheme.typography.labelSmall,
                    color = onColor.copy(alpha = 0.7f),
                )
            }
        }
    }
}

/**
 * Compact preview of a shared-location attachment — Android render of the iOS
 * `LocationMessageView` / "Position partagée" placeholder. Shows a pin, the place
 * name (or a generic label), and the coordinates when present; tapping hands the
 * location's `geo:` URI to the host to open in an external maps app.
 */
@Composable
private fun LocationPreview(
    location: BubbleLocation,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val openLabel = stringResource(R.string.bubble_location_open)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = openLabel
                }
            }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.LocationOn,
            contentDescription = null,
            tint = onColor.copy(alpha = 0.8f),
            modifier = Modifier.size(20.dp),
        )
        Column {
            Text(
                text = location.placeName ?: stringResource(R.string.bubble_location_shared),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = onColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (location.hasCoordinates) {
                Text(
                    text = "${location.latitude}, ${location.longitude}",
                    style = MaterialTheme.typography.labelSmall,
                    color = onColor.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * Compact audio-message player row — Android render of the iOS `AudioPlayerView`
 * message-bubble context. Shows a play affordance, the `m:ss` duration (or the
 * download size when the clip isn't yet available), and the Prisme-resolved
 * transcription line under it. Tapping a playable clip hands its URL to the host.
 */
@Composable
private fun AudioBubble(
    audio: BubbleAudio,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val playLabel = stringResource(R.string.bubble_audio_play)
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = playLabel
                }
            }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = if (audio.isPlayable) Icons.Filled.PlayArrow else Icons.Filled.Download,
                contentDescription = null,
                tint = onColor.copy(alpha = 0.9f),
                modifier = Modifier.size(24.dp),
            )
            val meta = audio.formattedDuration
                ?: audio.sizeBytes?.takeIf { it > 0 }?.let { formatFileSize(it) }
            if (meta != null) {
                Text(
                    text = meta,
                    style = MaterialTheme.typography.bodySmall,
                    color = onColor,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        if (audio.hasTranscription) {
            Text(
                text = audio.transcriptionText.orEmpty(),
                style = MaterialTheme.typography.labelSmall,
                color = onColor.copy(alpha = 0.75f),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
    }
}

@Composable
@ReadOnlyComposable
internal fun formatFileSize(bytes: Int): String = when {
    bytes >= 1_048_576 ->
        stringResource(R.string.bubble_file_size_mb, "%.1f".format(bytes / 1_048_576f))
    bytes >= 1_024 ->
        stringResource(R.string.bubble_file_size_kb, "%.0f".format(bytes / 1_024f))
    else -> stringResource(R.string.bubble_file_size_bytes, bytes.toString())
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
                    ReplyMediaKind.Image -> Icons.Filled.Image
                    ReplyMediaKind.File -> Icons.Filled.AttachFile
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
    }
}

/**
 * Quoted preview of the story/mood a message replies to — Android render of the
 * iOS `BubbleStoryReplyPreview` / `BubbleMoodReplyPreview`. A mood shows its
 * emoji + preview text; a story shows a camera glyph, the "Story" label, its
 * optional thumbnail, and its reaction/comment/share metrics.
 */
@Composable
private fun StoryReplyPreview(
    story: BubbleStoryReply,
    accentColor: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
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
        if (!story.isMood && story.thumbnailUrl != null) {
            AsyncImage(
                model = story.thumbnailUrl,
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
            modifier = Modifier.padding(start = MeeshySpacing.xs, end = MeeshySpacing.sm),
        ) {
            if (story.isMood) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = story.moodEmoji.orEmpty(),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (story.previewText.isNotBlank()) {
                        Text(
                            text = story.previewText,
                            style = MaterialTheme.typography.bodySmall,
                            color = accentColor.copy(alpha = 0.8f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = MeeshySpacing.xs),
                        )
                    }
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.PhotoCamera,
                        contentDescription = null,
                        tint = accentColor.copy(alpha = 0.8f),
                        modifier = Modifier
                            .padding(end = 2.dp)
                            .size(14.dp),
                    )
                    Text(
                        text = stringResource(R.string.bubble_reply_story),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = accentColor.copy(alpha = 0.8f),
                    )
                }
                if (story.hasMetrics) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                    ) {
                        if (story.reactionCount > 0) {
                            StoryMetric(
                                icon = Icons.Filled.Favorite,
                                value = story.reactionCount,
                                label = stringResource(
                                    R.string.bubble_story_reactions,
                                    story.reactionCount,
                                ),
                                accentColor = accentColor,
                            )
                        }
                        if (story.commentCount > 0) {
                            StoryMetric(
                                icon = Icons.Filled.ChatBubble,
                                value = story.commentCount,
                                label = stringResource(
                                    R.string.bubble_story_comments,
                                    story.commentCount,
                                ),
                                accentColor = accentColor,
                            )
                        }
                        if (story.shareCount > 0) {
                            StoryMetric(
                                icon = Icons.Filled.Share,
                                value = story.shareCount,
                                label = stringResource(
                                    R.string.bubble_story_shares,
                                    story.shareCount,
                                ),
                                accentColor = accentColor,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StoryMetric(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    value: Int,
    label: String,
    accentColor: Color,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.semantics { contentDescription = label },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = accentColor.copy(alpha = 0.7f),
            modifier = Modifier
                .padding(end = 2.dp)
                .size(11.dp),
        )
        Text(
            text = value.toString(),
            style = MaterialTheme.typography.labelSmall,
            color = accentColor.copy(alpha = 0.7f),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReactionStrip(
    reactions: List<ReactionEntry>,
    onReactionClick: ((String) -> Unit)?,
    onReactionLongPress: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        reactions.forEach { entry ->
            ReactionChip(
                entry = entry,
                onClick = onReactionClick?.let { { it(entry.emoji) } },
                onLongClick = onReactionLongPress,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReactionChip(entry: ReactionEntry, onClick: (() -> Unit)?, onLongClick: (() -> Unit)? = null) {
    val background =
        if (entry.includesMe) MeeshyPalette.Indigo500.copy(alpha = 0.22f)
        else MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.6f)
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(background)
            .let { base ->
                if (entry.includesMe) {
                    base.border(1.dp, MeeshyPalette.Indigo400, RoundedCornerShape(MeeshyRadius.pill))
                } else {
                    base
                }
            }
            .let { base ->
                if (onClick == null && onLongClick == null) {
                    base
                } else {
                    base.combinedClickable(
                        onClick = onClick ?: {},
                        onLongClick = onLongClick,
                    ).semantics { role = Role.Button }
                }
            }
            .padding(horizontal = MeeshySpacing.xs, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = entry.emoji,
            fontSize = 12.sp,
        )
        Text(
            text = entry.count.toString(),
            style = MaterialTheme.typography.labelSmall,
            color = if (entry.includesMe) MeeshyPalette.Indigo400 else MeeshyTheme.tokens.textPrimary,
            fontWeight = if (entry.includesMe) FontWeight.SemiBold else null,
        )
    }
}

@Composable
private fun DeliveryStatusIcon(
    status: DeliveryStatus,
    onColor: Color,
) {
    when (status) {
        DeliveryStatus.Pending -> Icon(
            imageVector = Icons.Filled.Schedule,
            contentDescription = stringResource(R.string.bubble_status_pending),
            tint = onColor.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Sent -> Icon(
            imageVector = Icons.Filled.Done,
            contentDescription = stringResource(R.string.bubble_status_sent),
            tint = onColor.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Delivered -> Icon(
            imageVector = Icons.Filled.DoneAll,
            contentDescription = stringResource(R.string.bubble_status_delivered),
            tint = onColor.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Read -> Icon(
            imageVector = Icons.Filled.DoneAll,
            contentDescription = stringResource(R.string.bubble_status_read),
            tint = MeeshyTheme.tokens.info,
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Failed -> Icon(
            imageVector = Icons.Filled.ErrorOutline,
            contentDescription = stringResource(R.string.bubble_status_failed),
            tint = MeeshyPalette.Error,
            modifier = Modifier.size(16.dp),
        )
    }
}
