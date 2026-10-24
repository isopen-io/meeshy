package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Quoted preview of the story/mood a message replies to — Android render of the
 * iOS `BubbleStoryReplyPreview` / `BubbleMoodReplyPreview`. A mood shows its
 * emoji + preview text; a story shows a camera glyph, the "Story" label, its
 * optional thumbnail, and its reaction/comment/share metrics.
 */
@Composable
internal fun StoryReplyPreview(
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
                MoodReplyLine(story = story, accentColor = accentColor)
            } else {
                StoryReplyLines(story = story, accentColor = accentColor)
            }
        }
    }
}

@Composable
private fun MoodReplyLine(story: BubbleStoryReply, accentColor: Color) {
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
}

/** The "Story" label row then, when any is positive, the engagement metrics row (column children). */
@Composable
private fun StoryReplyLines(story: BubbleStoryReply, accentColor: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = MeeshyIcons.Camera,
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
                    icon = MeeshyIcons.HeartFilled,
                    value = story.reactionCount,
                    label = stringResource(R.string.bubble_story_reactions, story.reactionCount),
                    accentColor = accentColor,
                )
            }
            if (story.commentCount > 0) {
                StoryMetric(
                    icon = Icons.Filled.ChatBubble,
                    value = story.commentCount,
                    label = stringResource(R.string.bubble_story_comments, story.commentCount),
                    accentColor = accentColor,
                )
            }
            if (story.shareCount > 0) {
                StoryMetric(
                    icon = Icons.Filled.Share,
                    value = story.shareCount,
                    label = stringResource(R.string.bubble_story_shares, story.shareCount),
                    accentColor = accentColor,
                )
            }
        }
    }
}

@Composable
private fun StoryMetric(
    icon: ImageVector,
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
