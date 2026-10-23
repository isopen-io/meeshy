package me.meeshy.app.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun PostStatsRow(
    post: FeedPostPresentation,
    onLike: () -> Unit,
    onBookmark: () -> Unit,
    onComments: () -> Unit,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = Modifier.fillMaxWidth(),
    ) {
        val likeLabel = stringResource(if (post.isLiked) R.string.feed_unlike else R.string.feed_like)
        StatAction(
            icon = if (post.isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            count = post.likeCount,
            contentDescription = likeLabel,
            tint = if (post.isLiked) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
            onClick = onLike,
        )
        StatAction(
            icon = Icons.Outlined.ChatBubbleOutline,
            count = post.commentCount,
            contentDescription = stringResource(R.string.feed_comments),
            tint = MeeshyTheme.tokens.textSecondary,
            onClick = onComments,
        )
        RepostStatAction(count = post.repostCount, onRepost = onRepost, onQuote = onQuote)
        Spacer(Modifier.weight(1f))
        val bookmarkLabel =
            stringResource(if (post.isBookmarked) R.string.feed_unbookmark else R.string.feed_bookmark)
        StatAction(
            icon = if (post.isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
            count = post.bookmarkCount,
            contentDescription = bookmarkLabel,
            tint = if (post.isBookmarked) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary,
            onClick = onBookmark,
        )
    }
}

@Composable
private fun StatAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
    contentDescription: String,
    tint: Color,
    onClick: (() -> Unit)?,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterHorizontally),
        modifier = Modifier
            .defaultMinSize(minWidth = MIN_ACTION_TARGET, minHeight = MIN_ACTION_TARGET)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics { role = Role.Button }
            }
            .padding(horizontal = MeeshySpacing.xs)
            .semantics { this.contentDescription = contentDescription },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        if (count > 0) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

/** iOS `FeedPostActionsBar`: the 44 pt frame every action of the bar keeps. */
private val MIN_ACTION_TARGET = 44.dp

/**
 * The repost action of the bar: a tap offers Repost / Quote — the same choice as the "…" menu
 * and the post detail (iOS `FeedPostActionsBar` repost confirmation).
 */
@Composable
private fun RepostStatAction(count: Int, onRepost: () -> Unit, onQuote: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        StatAction(
            icon = Icons.Filled.Repeat,
            count = count,
            contentDescription = stringResource(R.string.feed_reposts),
            tint = MeeshyTheme.tokens.textSecondary,
            onClick = { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.feed_action_repost)) },
                onClick = {
                    expanded = false
                    onRepost()
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.feed_action_quote)) },
                onClick = {
                    expanded = false
                    onQuote()
                },
            )
        }
    }
}
