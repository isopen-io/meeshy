package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import coil.compose.AsyncImage
import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.theme.MeeshyRadius
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.search.PostSearchHit
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Une publication trouvée (#14620) : l'auteur, le genre (post, réel, story), le texte servi par
 * le Prisme. Un toucher ouvre le contenu.
 */
@Composable
internal fun PostHitRow(
    hit: PostSearchHit,
    resultsQuery: String,
    onClick: () -> Unit,
) {
    val kind = stringResource(hit.kind.labelRes())
    ResultCard(
        onClick = onClick,
        description = listOf(kind, hit.authorName, hit.text).filter { it.isNotBlank() }.joinToString(", "),
        hint = kind,
    ) {
        MeeshyAvatar(name = hit.authorName, size = 40.dp, imageUrl = hit.authorAvatar)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = hit.kind.icon(),
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(MeeshySpacing.xs))
                Text(
                    text = kind,
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyPalette.Indigo500,
                    maxLines = 1,
                )
            }
            Text(
                text = hit.authorName,
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            if (hit.text.isNotBlank()) {
                val highlighted = remember(hit.text, resultsQuery) {
                    washed(GlobalSearchRows.highlight(hit.text, resultsQuery), SEARCH_HIGHLIGHT_WASH)
                }
                Text(
                    text = highlighted,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
                )
            }
        }
        hit.thumbnailUrl?.let { url ->
            Spacer(Modifier.width(MeeshySpacing.md))
            PostHitThumbnail(url)
        }
    }
}

/** La vignette du premier média, à droite (iOS `PostSearchResultRow`, 52 pt) ; décorative pour le lecteur d'écran. */
@Composable
private fun PostHitThumbnail(url: String) {
    val baseUrl = LocalMediaBaseUrl.current
    val model = remember(url, baseUrl) { resolveMediaUrl(url, baseUrl) }
    AsyncImage(
        model = model,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .size(THUMBNAIL_SIZE)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyTheme.tokens.textMuted.copy(alpha = 0.15f))
            .testTag(POST_THUMBNAIL_TAG),
    )
}

private val THUMBNAIL_SIZE = 52.dp

internal const val POST_THUMBNAIL_TAG = "global_search_post_thumbnail"

private fun PostType.labelRes(): Int = when (this) {
    PostType.REEL -> R.string.global_search_post_kind_reel
    PostType.STORY -> R.string.global_search_post_kind_story
    else -> R.string.global_search_post_kind_post
}

private fun PostType.icon(): ImageVector = when (this) {
    PostType.REEL -> MeeshyIcons.Movie
    PostType.STORY -> MeeshyIcons.Slideshow
    else -> MeeshyIcons.GridViewFilled
}
