package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.format.shortDateTimeLabel
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.ZoneId
import java.util.Locale

/**
 * The embedded quote cell for a reposted / quoted post rendered inside a feed
 * card or the post-detail screen. Accent-coherent (Indigo-tinted, bordered),
 * read-only, and its tap opens the ORIGINAL reposted post ([RepostEmbedPresentation.id]),
 * never the outer card — mirrors iOS `FeedPostCard.repostTapTargetId`.
 *
 * A full story/reel canvas embed is out of scope for this slice: STORY/REEL
 * reposts render the same quote block with a discreet kind badge (there is no
 * Android story-canvas renderer yet).
 */
@Composable
fun RepostEmbedCell(
    embed: RepostEmbedPresentation,
    onOpen: (String) -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    val header = stringResource(
        if (embed.isQuote) R.string.feed_repost_quoted else R.string.feed_repost_reposted,
    )
    val openLabel = stringResource(R.string.feed_repost_open)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .border(
                width = 1.dp,
                color = MeeshyPalette.Indigo500.copy(alpha = 0.25f),
                shape = RoundedCornerShape(MeeshyRadius.md),
            )
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.05f))
            .clickable(role = Role.Button) { onOpen(embed.id) }
            .semantics { contentDescription = openLabel }
            .padding(MeeshySpacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Repeat,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(14.dp),
            )
            Spacer(Modifier.width(MeeshySpacing.xs))
            Text(
                text = header,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.Indigo500,
            )
            embed.kindBadge()?.let { badge ->
                Spacer(Modifier.width(MeeshySpacing.xs))
                KindBadge(badge)
            }
        }

        Spacer(Modifier.height(MeeshySpacing.sm))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(contentAlignment = Alignment.Center) {
                MeeshyAvatar(name = embed.authorName ?: unknownAuthor, size = 28.dp)
                if (!embed.authorAvatarUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = embed.authorAvatarUrl,
                        contentDescription = null,
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape),
                    )
                }
            }
            Spacer(Modifier.width(MeeshySpacing.sm))
            Column(Modifier.weight(1f)) {
                Text(
                    text = embed.authorName ?: unknownAuthor,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                embed.createdAtIso?.let {
                    Text(
                        text = embedRelativeTime(it),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
            if (embed.isTranslated) {
                Icon(
                    imageVector = Icons.Filled.Translate,
                    contentDescription = stringResource(R.string.feed_translated),
                    tint = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.size(14.dp),
                )
            }
        }

        if (embed.content.isNotBlank()) {
            Spacer(Modifier.height(MeeshySpacing.sm))
            Text(
                text = embed.content,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
        }

        embed.previewImageUrl?.let { url ->
            Spacer(Modifier.height(MeeshySpacing.sm))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.6f)
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f)),
            ) {
                AsyncImage(
                    model = url,
                    contentDescription = stringResource(R.string.feed_image_description),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(1.6f),
                )
                if (embed.extraMediaCount > 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(MeeshySpacing.xs)
                            .clip(RoundedCornerShape(MeeshyRadius.sm))
                            .background(Color.Black.copy(alpha = 0.55f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.feed_repost_more_media, embed.extraMediaCount),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MeeshyPalette.White,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun KindBadge(label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.14f))
            .padding(horizontal = 6.dp, vertical = 1.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.PlayCircle,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(11.dp),
        )
        Spacer(Modifier.width(3.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyPalette.Indigo500,
        )
    }
}

@Composable
private fun RepostEmbedPresentation.kindBadge(): String? = when {
    isStory -> stringResource(R.string.feed_repost_story)
    isReel -> stringResource(R.string.feed_reel)
    else -> null
}

@Composable
private fun embedRelativeTime(iso: String): String {
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
