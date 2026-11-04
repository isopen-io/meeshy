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
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@Composable
internal fun PostStatsRow(
    post: FeedPostPresentation,
    onLike: (() -> Unit)?,
    onBookmark: (() -> Unit)?,
    onComments: (() -> Unit)?,
    onRepost: (() -> Unit)?,
    onQuote: (() -> Unit)?,
    modifier: Modifier = Modifier,
    overMedia: Boolean = false,
    onSend: (() -> Unit)? = null,
) {
    val neutral = if (overMedia) MeeshyPalette.White else MeeshyTheme.tokens.textSecondary
    val accent = if (overMedia) null else post.accentHex?.let { hexColor(it) }?.takeIf { it != Color.Unspecified }
    val resources = LocalContext.current.resources
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = modifier.fillMaxWidth(),
    ) {
        // Une action n'est dessinée que si son hôte lui passe son effet : jamais un bouton inerte (#13244).
        val likeLabel = stringResource(if (post.isLiked) R.string.feed_unlike else R.string.feed_like)
        val hasLikes = post.likeCount > 0
        if (onLike != null) StatAction(
            icon = if (post.isLiked || hasLikes) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            count = post.likeCount,
            contentDescription = likeLabel,
            stateDescription = resources.getQuantityString(R.plurals.feed_post_stat_likes, post.likeCount, post.likeCount),
            tint = when {
                post.isLiked -> MeeshyPalette.Error
                hasLikes && accent != null -> accent
                else -> neutral
            },
            active = post.isLiked,
            heart = true,
            accentBorder = accent.takeIf { post.isLiked },
            countColor = if (post.isLiked) MeeshyPalette.Error else if (hasLikes && accent != null) accent else neutral,
            onClick = onLike,
        )
        if (onComments != null) StatAction(
            icon = Icons.Outlined.ChatBubbleOutline,
            count = post.commentCount,
            contentDescription = stringResource(R.string.feed_comments),
            stateDescription = resources.getQuantityString(R.plurals.feed_post_stat_comments, post.commentCount, post.commentCount),
            tint = neutral,
            countColor = neutral,
            onClick = onComments,
        )
        RepostStatAction(
            count = post.repostCount,
            reposted = post.isReposted,
            tint = neutral,
            stateDescription = resources.getQuantityString(R.plurals.feed_post_stat_reposts, post.repostCount, post.repostCount),
            onRepost = onRepost,
            onQuote = onQuote,
        )
        Spacer(Modifier.weight(1f))
        val bookmarkLabel =
            stringResource(if (post.isBookmarked) R.string.feed_unbookmark else R.string.feed_bookmark)
        if (onBookmark != null) StatAction(
            icon = if (post.isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
            count = post.bookmarkCount,
            contentDescription = bookmarkLabel,
            stateDescription = resources.getString(R.string.feed_post_stat_saves, post.bookmarkCount),
            tint = if (post.isBookmarked) MeeshyPalette.Warning else neutral,
            active = post.isBookmarked,
            countColor = if (post.isBookmarked) MeeshyPalette.Warning else neutral,
            onClick = onBookmark,
        )
        // « Envoyer » (#14315, iOS `FeedPostActionsBar`) : la feuille Meeshy, avec le lien de l'utilisateur ;
        // « Partager », hors de Meeshy, vit dans le menu « ⋯ ». Son compteur est celui des partages du post.
        onSend?.let { send ->
            StatAction(
                icon = MeeshyIcons.Send,
                count = post.shareCount,
                contentDescription = stringResource(R.string.feed_action_send),
                stateDescription = resources.getString(R.string.feed_post_stat_shares, post.shareCount),
                tint = neutral,
                countColor = neutral,
                onClick = send,
            )
        }
    }
}

@Composable
private fun StatAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
    contentDescription: String,
    tint: Color,
    onClick: (() -> Unit)?,
    stateDescription: String? = null,
    active: Boolean = false,
    heart: Boolean = false,
    accentBorder: Color? = null,
    countColor: Color = MeeshyTheme.tokens.textSecondary,
) {
    val haptics = rememberMeeshyHaptics()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterHorizontally),
        modifier = Modifier
            .defaultMinSize(minWidth = MIN_ACTION_TARGET, minHeight = MIN_ACTION_TARGET)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = { haptics.light(); onClick() }).semantics { role = Role.Button }
            }
            .padding(horizontal = MeeshySpacing.xs)
            .semantics(mergeDescendants = true) {
                this.contentDescription = contentDescription
                stateDescription?.let { this.stateDescription = it }
                if (active) selected = true
            },
    ) {
        EngagementGlyph(active = active, tint = tint, burst = heart, tilt = heart) {
            Box(contentAlignment = Alignment.Center) {
                Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(GLYPH_SIZE))
                // La bordure d'accent du cœur plein (iOS : un `heart` vide, teinté d'accent, par-dessus le plein).
                accentBorder?.let { border ->
                    Icon(imageVector = Icons.Filled.FavoriteBorder, contentDescription = null, tint = border, modifier = Modifier.size(GLYPH_SIZE))
                }
            }
        }
        EngagementCount(count = count, color = countColor)
    }
}

private val GLYPH_SIZE = 18.dp

/** Cible tactile de chaque action de la barre : 48 dp (TalkBack, Material) — iOS en garde 44 pt (HIG). */
private val MIN_ACTION_TARGET = 48.dp

/**
 * The repost action of the bar: a tap offers [RepostChoiceDialog] — the same choice as the post detail and the reels
 * player (iOS `FeedPostActionsBar` + `RepostChoiceDialog`). The reposted state shows on the glyph. With neither writer,
 * the button is not drawn: never an inert control (#12234).
 */
@Composable
private fun RepostStatAction(
    count: Int,
    reposted: Boolean,
    tint: Color,
    stateDescription: String,
    onRepost: (() -> Unit)?,
    onQuote: (() -> Unit)?,
) {
    if (RepostChoice.offeredBy(onRepost, onQuote).isEmpty()) return
    var choosing by remember { mutableStateOf(false) }
    Box {
        StatAction(
            icon = Icons.Filled.Repeat,
            count = count,
            contentDescription = stringResource(R.string.feed_reposts),
            stateDescription = stateDescription,
            tint = if (reposted) MeeshyPalette.Success else tint,
            active = reposted,
            countColor = if (reposted) MeeshyPalette.Success else tint,
            onClick = { choosing = true },
        )
    }
    if (choosing) RepostChoiceDialog(onRepost = onRepost, onQuote = onQuote, onDismiss = { choosing = false })
}
