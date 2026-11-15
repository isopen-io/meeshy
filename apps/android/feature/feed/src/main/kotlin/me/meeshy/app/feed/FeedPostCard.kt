package me.meeshy.app.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

@Composable
internal fun PostCard(
    post: FeedPostPresentation,
    onLike: () -> Unit,
    onBookmark: () -> Unit,
    onFlagTap: (String) -> Unit,
    onClick: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit = onOpenPost,
    onImageTap: (Int) -> Unit,
    isOwn: Boolean = false,
    onShare: (() -> Unit)? = null,
    onSend: (() -> Unit)? = null,
    onCopyLink: (() -> Unit)? = null,
    onCopyText: (() -> Unit)? = null,
    onOpenProfile: ((String) -> Unit)? = null,
    onRepost: (() -> Unit)? = null,
    onQuote: (() -> Unit)? = null,
    onPin: (() -> Unit)? = null,
    onReport: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    onComments: () -> Unit = onClick,
    onReplyToComment: (String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
    translatingCodes: Set<String> = emptySet(),
    onSelectLanguage: (String) -> Unit = onFlagTap,
    pendingSend: PendingSendActions? = null,
    modifier: Modifier = Modifier,
    onToggleComments: (() -> Unit)? = null,
) {
    val reelCover = post.reelCover?.takeIf { post.showsReelCard && pendingSend == null }
    if (reelCover != null) {
        ReelPostCard(
            post = post,
            cover = reelCover,
            onOpenReel = onOpenReel,
            modifier = modifier,
            isOwn = isOwn,
            onLike = onLike,
            onBookmark = onBookmark,
            onComments = onComments,
            onRepost = onRepost,
            onQuote = onQuote,
            onShare = onShare,
            onSend = onSend,
            onCopyLink = onCopyLink,
            onCopyText = onCopyText,
            onPin = onPin,
            onReport = onReport,
            onDelete = onDelete,
            onOpenProfile = onOpenProfile,
            onToggleComments = onToggleComments,
        )
        return
    }
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.xl),
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(Modifier.padding(MeeshySpacing.lg)) {
            FeedPostCardHeader(
                post = post,
                isOwn = isOwn,
                onShare = onShare,
                onCopyLink = onCopyLink,
                onCopyText = onCopyText,
                onOpenProfile = onOpenProfile,
                onRepost = onRepost,
                onQuote = onQuote,
                onBookmark = onBookmark,
                onPin = onPin,
                onReport = onReport,
                onDelete = onDelete,
                onOpen = onClick,
                pendingSend = pendingSend,
                onToggleComments = onToggleComments,
            )
            FeedPostCardBody(
                post = post,
                onFlagTap = onFlagTap,
                onOpenHashtag = onOpenHashtag,
                onOpenProfile = onOpenProfile,
                translatingCodes = translatingCodes,
                onSelectLanguage = onSelectLanguage,
            )
            FeedPostCardMediaSlot(post = post, onImageTap = onImageTap, onOpenPost = onOpenPost, onOpenReel = onOpenReel)
            if (pendingSend != null) {
                FeedPendingPublicationChip(pendingSend)
                return@Column
            }
            FeedPostCardFooter(
                post = post,
                onLike = onLike,
                onBookmark = onBookmark,
                onComments = onComments,
                onRepost = onRepost,
                onQuote = onQuote,
                onSend = onSend,
            )
            post.commentsPreview?.let { FeedCommentsPreview(preview = it, onOpen = onComments, onReplyTo = onReplyToComment, onOpenProfile = onOpenProfile) }
        }
    }
}
