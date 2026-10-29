package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.format.shortDateTimeLabel
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * En-tête de la carte : avatar, nom, humeur, date relative et menu d'options.
 */
@Composable
internal fun FeedPostCardHeader(
    post: FeedPostPresentation,
    isOwn: Boolean,
    onShare: () -> Unit,
    onCopyLink: () -> Unit,
    onCopyText: () -> Unit,
    onOpenProfile: ((String) -> Unit)? = null,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
    onBookmark: () -> Unit,
    onPin: () -> Unit,
    onReport: () -> Unit,
    onDelete: () -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    Row(verticalAlignment = Alignment.CenterVertically) {
        val profileTap = Modifier.opensAuthorProfile(post.authorId, onOpenProfile)
        MeeshyAvatar(
            name = post.authorName ?: unknownAuthor,
            size = 40.dp,
            imageUrl = post.authorAvatarUrl,
            presence = rememberPresence(post.authorId),
            modifier = profileTap,
        )
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = post.authorName ?: unknownAuthor,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = profileTap,
                )
                if (post.moodEmoji != null) {
                    Text(
                        text = post.moodEmoji,
                        modifier = Modifier.padding(start = MeeshySpacing.xs),
                    )
                }
                post.repostAttribution?.let { handle -> RepostAttribution(handle) }
            }
            post.createdAtIso?.let {
                Text(
                    text = postRelativeTime(it),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
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
        )
    }
}

/**
 * The feed post timestamp as a compact relative label ("5 min", "2 h", "3 j", …) rather than a
 * raw absolute date — the Prisme-style discreet framing. Falls back to the absolute short label
 * when the instant is absent/unparsable, so a malformed timestamp never blanks or crashes the row.
 */
@Composable
internal fun postRelativeTime(iso: String): String {
    val strings = rememberRelativeTimeStrings()
    val epochMillis = isoToEpochMillisOrNull(iso) ?: return shortDateTimeLabel(iso)
    return RelativeTimeFormat.short(
        epochMillis = epochMillis,
        referenceMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        strings = strings,
    )
}

/**
 * L'attribution de republication, juste après le nom : l'icône, puis l'AUTEUR D'ORIGINE, rien d'autre
 * (iOS `FeedPostCard+Header`). La phrase complète reste l'étiquette TalkBack ; l'icône est muette.
 */
@Composable
private fun RepostAttribution(handle: String) {
    val spoken = stringResource(R.string.feed_post_reposted_from, handle)
    Row(
        modifier = Modifier
            .padding(start = MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = MeeshyIcons.Repeat,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = "@$handle",
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = MeeshySpacing.xs),
        )
    }
}
