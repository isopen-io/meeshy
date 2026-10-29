package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La carte d'un réel, plein cadre (iOS `ReelFeedCard`) : la couverture — vignette, scène muette ou aplat — recouvre TOUTE
 * la carte, et l'auteur, la légende et les actions se posent par-dessus, en bas, sur un dégradé qui les garde lisibles.
 * Un réel republié montre le réel source, signé de son auteur d'origine (« Republié par … »), et ouvre ce réel-là.
 *
 * [showsActions] retire la rangée d'actions quand l'écran porte déjà la sienne (détail du post) ; [captionLines] borne la légende.
 */
@Composable
internal fun ReelPostCard(
    post: FeedPostPresentation,
    cover: ReelCover,
    onOpenReel: (String) -> Unit,
    modifier: Modifier = Modifier,
    isOwn: Boolean = false,
    showsActions: Boolean = true,
    captionLines: Int = 2,
    onLike: () -> Unit = {},
    onBookmark: () -> Unit = {},
    onComments: () -> Unit = {},
    onRepost: () -> Unit = {},
    onQuote: () -> Unit = {},
    onShare: () -> Unit = {},
    onCopyLink: () -> Unit = {},
    onCopyText: () -> Unit = {},
    onPin: () -> Unit = {},
    onReport: () -> Unit = {},
    onDelete: () -> Unit = {},
    onOpenProfile: ((String) -> Unit)? = null,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    val source = post.republishedReel
    val authorName = source?.authorName ?: post.authorName ?: unknownAuthor
    val authorAvatar = if (source != null) source.authorAvatarUrl else post.authorAvatarUrl
    val authorId = if (source != null) source.authorId else post.authorId
    val cardLabel = stringResource(R.string.feed_reel_card_a11y, authorName)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(post.reelAspect)
            .clip(RoundedCornerShape(MeeshyRadius.xl))
            .testTag(REEL_CARD_TAG)
            .semantics { contentDescription = cardLabel },
    ) {
        Box(Modifier.fillMaxSize().testTag(REEL_CARD_COVER_TAG), contentAlignment = Alignment.Center) {
            ReelCoverView(
                cover = cover,
                authorName = authorName,
                onOpen = { onOpenReel(post.reelOpenId) },
                modifier = Modifier.fillMaxSize(),
            )
        }
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = SCRIM_ALPHA))))
                .testTag(REEL_CARD_OVERLAY_TAG)
                .padding(MeeshySpacing.md),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Spacer(Modifier.size(MeeshySpacing.lg))
            source?.let { origin ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(MeeshyIcons.Repeat, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = stringResource(R.string.feed_reel_republished_by, post.authorName ?: unknownAuthor),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyPalette.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                MeeshyAvatar(
                    name = authorName,
                    size = 32.dp,
                    imageUrl = authorAvatar,
                    modifier = Modifier.opensAuthorProfile(authorId, onOpenProfile),
                )
                Spacer(Modifier.width(MeeshySpacing.sm))
                Text(
                    text = authorName,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false).opensAuthorProfile(authorId, onOpenProfile),
                )
            }
            post.content.takeIf { it.isNotBlank() }?.let { caption ->
                Text(
                    text = caption,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyPalette.White,
                    maxLines = captionLines,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag(REEL_CARD_CAPTION_TAG),
                )
            }
            if (showsActions) {
                PostStatsRow(
                    post = post,
                    onLike = onLike,
                    onBookmark = onBookmark,
                    onComments = onComments,
                    onRepost = onRepost,
                    onQuote = onQuote,
                    overMedia = true,
                )
            }
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(MeeshySpacing.xs),
        ) {
            PostOptionsButton(
                isOwn = isOwn,
                isBookmarked = post.isBookmarked,
                hasText = post.content.isNotBlank(),
                onShare = onShare,
                onCopyLink = onCopyLink,
                onCopyText = onCopyText,
                onRepost = onRepost,
                onQuote = onQuote,
                onBookmarkToggle = onBookmark,
                onPin = onPin,
                onReport = onReport,
                onDelete = onDelete,
                tint = MeeshyPalette.White,
            )
        }
    }
}

internal const val REEL_CARD_TAG = "reel_card"
internal const val REEL_CARD_COVER_TAG = "reel_card_cover"
internal const val REEL_CARD_OVERLAY_TAG = "reel_card_overlay"
internal const val REEL_CARD_CAPTION_TAG = "reel_card_caption"
private const val SCRIM_ALPHA = 0.7f
