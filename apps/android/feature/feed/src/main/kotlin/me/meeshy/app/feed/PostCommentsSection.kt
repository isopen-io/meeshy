package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The comment thread beneath a post in [PostDetailScreen]. Hosts its own
 * [PostCommentsViewModel] (scoped to the same nav entry, so it reads the same `postId`)
 * and renders — top to bottom — a section header, the projected comments (each Prisme-
 * resolved, an optimistic row dimmed until confirmed), an optional "show more" affordance,
 * and a pinned composer. Accent-coherent (Indigo) with the post card above it.
 */
@Composable
internal fun PostCommentsSection(
    viewModel: PostCommentsViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.post_comments_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(bottom = MeeshySpacing.sm),
        )

        when {
            state.showSkeleton -> CommentsSkeleton()
            state.isEmpty -> Text(
                text = stringResource(R.string.post_comments_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(vertical = MeeshySpacing.md),
            )
            else -> Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                state.comments.forEach { comment ->
                    CommentRow(
                        comment = comment,
                        onToggleLike = viewModel::toggleLike,
                        onReply = viewModel::beginReply,
                    )
                    ReplyThread(
                        comment = comment,
                        thread = state.replyThreads[comment.id],
                        onToggleReplies = viewModel::toggleReplies,
                        onToggleLike = viewModel::toggleLike,
                        onReply = viewModel::beginReply,
                    )
                }
            }
        }

        if (state.canLoadMore) {
            TextButton(
                onClick = viewModel::loadMore,
                enabled = !state.isLoadingMore,
            ) {
                Text(stringResource(R.string.post_comments_load_more), color = MeeshyPalette.Indigo500)
            }
        }

        Spacer(Modifier.height(MeeshySpacing.md))
        CommentComposer(
            isSubmitting = state.isSubmitting,
            replyTarget = state.replyTarget,
            onSubmit = viewModel::submit,
            onCancelReply = viewModel::cancelReply,
        )
    }
}

@Composable
private fun CommentRow(
    comment: CommentPresentation,
    onToggleLike: (String) -> Unit,
    onReply: (String) -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (comment.isPending) 0.5f else 1f),
    ) {
        Box(contentAlignment = Alignment.Center) {
            MeeshyAvatar(name = comment.authorName ?: unknownAuthor, size = 32.dp)
            if (!comment.authorAvatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = comment.authorAvatarUrl,
                    contentDescription = comment.authorName ?: unknownAuthor,
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape),
                )
            }
        }
        Spacer(Modifier.width(MeeshySpacing.sm))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = comment.authorName ?: unknownAuthor,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                if (comment.isReply) {
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = stringResource(R.string.post_comments_reply_badge),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyPalette.Indigo500,
                        modifier = Modifier
                            .clip(RoundedCornerShape(MeeshyRadius.sm))
                            .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
                comment.createdAtIso?.let {
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = detailRelativeTime(it),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
            SelectionContainer {
                Text(
                    text = comment.content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                CommentLikeButton(comment = comment, onToggleLike = onToggleLike)
                CommentReplyButton(comment = comment, onReply = onReply)
            }
        }
    }
}

@Composable
private fun CommentReplyButton(comment: CommentPresentation, onReply: (String) -> Unit) {
    val label = stringResource(R.string.post_comments_reply_action)
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier
            .padding(top = MeeshySpacing.xs)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(enabled = !comment.isPending) { onReply(comment.id) }
            .semantics { role = Role.Button; contentDescription = label }
            .padding(vertical = 2.dp, horizontal = 4.dp),
    )
}

/**
 * The 1-level reply thread beneath a top-level [comment]. Three states:
 * - **preview** (loaded but collapsed — auto-preloaded, or a collapsed thread falling back to its
 *   taste): shows the first replies inline, then a "View all N replies" affordance when more exist;
 * - **expanded**: the full indented reply list plus a "Hide replies" toggle;
 * - **collapsed, not yet loaded**: just a "View N replies" toggle (a discreet spinner while it
 *   fetches). Renders nothing when the comment has no replies, no preview, and isn't expanded.
 * Accent-coherent (Indigo) with the thread; the preview means sub-comments are never hidden
 * behind a mandatory tap.
 */
@Composable
private fun ReplyThread(
    comment: CommentPresentation,
    thread: ReplyThreadUiState?,
    onToggleReplies: (String) -> Unit,
    onToggleLike: (String) -> Unit,
    onReply: (String) -> Unit,
) {
    val isExpanded = thread?.isExpanded == true
    val isPreview = thread?.isPreview == true
    if (comment.replyCount <= 0 && !isExpanded && !isPreview) return

    Column(modifier = Modifier.padding(start = 40.dp, top = MeeshySpacing.xs)) {
        if (isPreview && thread != null) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                thread.replies.forEach { reply ->
                    CommentRow(comment = reply, onToggleLike = onToggleLike, onReply = onReply)
                }
            }
            Spacer(Modifier.height(MeeshySpacing.xs))
        }

        val showToggle = isExpanded || !isPreview || (thread?.hiddenReplyCount ?: 0) > 0
        if (showToggle) {
            val label = when {
                isExpanded -> stringResource(R.string.post_comments_hide_replies)
                isPreview -> pluralStringResource(
                    R.plurals.post_comments_view_all_replies,
                    comment.replyCount,
                    comment.replyCount,
                )
                else -> pluralStringResource(
                    R.plurals.post_comments_view_replies,
                    comment.replyCount,
                    comment.replyCount,
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .clickable { onToggleReplies(comment.id) }
                    .semantics { role = Role.Button; contentDescription = label }
                    .padding(vertical = 2.dp, horizontal = 2.dp),
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.Indigo500,
                )
                if (thread?.isLoading == true) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        strokeWidth = 2.dp,
                        color = MeeshyPalette.Indigo500,
                    )
                }
            }
        }

        if (isExpanded && thread != null) {
            Spacer(Modifier.height(MeeshySpacing.sm))
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                thread.replies.forEach { reply ->
                    CommentRow(comment = reply, onToggleLike = onToggleLike, onReply = onReply)
                }
            }
        }
    }
}

@Composable
private fun CommentLikeButton(comment: CommentPresentation, onToggleLike: (String) -> Unit) {
    val label = stringResource(if (comment.isLiked) R.string.feed_unlike else R.string.feed_like)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .padding(top = MeeshySpacing.xs)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(enabled = !comment.isPending) { onToggleLike(comment.id) }
            .semantics { role = Role.Button; contentDescription = label }
            .padding(vertical = 2.dp, horizontal = 2.dp),
    ) {
        Icon(
            imageVector = if (comment.isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            contentDescription = null,
            tint = if (comment.isLiked) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(16.dp),
        )
        if (comment.likeCount > 0) {
            Text(
                text = comment.likeCount.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = if (comment.isLiked) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun CommentComposer(
    isSubmitting: Boolean,
    replyTarget: ReplyTarget?,
    onSubmit: (String) -> Unit,
    onCancelReply: () -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    val isReply = replyTarget != null
    Column {
        if (isReply) {
            ReplyTargetChip(target = replyTarget, onCancelReply = onCancelReply)
            Spacer(Modifier.height(MeeshySpacing.xs))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = {
                    Text(
                        stringResource(
                            if (isReply) R.string.post_comments_reply_hint else R.string.post_comments_input_hint,
                        ),
                    )
                },
                modifier = Modifier.weight(1f),
                maxLines = 4,
            )
            Spacer(Modifier.width(MeeshySpacing.sm))
            if (isSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = MeeshyPalette.Indigo500,
                )
            } else {
                IconButton(
                    onClick = {
                        onSubmit(draft)
                        draft = ""
                    },
                    enabled = draft.isNotBlank(),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(R.string.post_comments_send),
                        tint = if (draft.isNotBlank()) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
        }
    }
}

/**
 * The "Replying to @name" chip pinned above the composer while a [ReplyTarget] is active,
 * with a discreet close affordance to drop back to a top-level comment. Accent-coherent Indigo.
 */
@Composable
private fun ReplyTargetChip(target: ReplyTarget, onCancelReply: () -> Unit) {
    val label = target.authorName
        ?.let { stringResource(R.string.post_comments_replying_to, it) }
        ?: stringResource(R.string.post_comments_replying_to_generic)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.10f))
            .padding(start = 10.dp, end = 2.dp, top = 2.dp, bottom = 2.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyPalette.Indigo500,
        )
        val cancelLabel = stringResource(R.string.post_comments_cancel_reply)
        IconButton(
            onClick = onCancelReply,
            modifier = Modifier.size(24.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = cancelLabel,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun CommentsSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        repeat(3) {
            Row(Modifier.fillMaxWidth()) {
                me.meeshy.ui.component.MeeshySkeletonBox(
                    modifier = Modifier.size(32.dp),
                    shape = CircleShape,
                )
                Spacer(Modifier.width(MeeshySpacing.sm))
                me.meeshy.ui.component.MeeshySkeletonBox(
                    modifier = Modifier
                        .weight(1f)
                        .height(36.dp),
                    shape = RoundedCornerShape(MeeshyRadius.md),
                )
            }
        }
    }
}
