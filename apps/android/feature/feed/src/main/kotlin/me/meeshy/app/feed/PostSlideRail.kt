package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.ui.component.composer.SlideRailTile
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The slide rail of the post and the reel on the plateau (iOS `ComposerSlideRail` mounted by `slideRailSlot`): one tile per
 * slide — in a post a slide is a media — the current one ringed in the brand colour, a tap to switch, the bin on the
 * current tile. Tiles slide into place when one arrives or leaves (the ring eases between tiles too), and each switch
 * ticks. The tile is the story's own ([SlideRailTile], sdk-ui); no (+) and no reorder, as on iOS's document
 * surface — the doors of the tool row add media.
 */
@Composable
internal fun PostSlideRail(
    media: List<UploadedMedia>,
    currentId: String?,
    onSelect: (String) -> Unit,
    onRemove: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!PostSlideLaw.showsRail(media.size)) return
    val currentIndex = media.indexOfFirst { it.id == currentId }.coerceAtLeast(0)
    val railName = stringResource(R.string.feed_composer_slide_rail)
    LazyRow(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = railName },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        contentPadding = PaddingValues(top = MeeshySpacing.xs, end = MeeshySpacing.sm),
    ) {
        itemsIndexed(media, key = { _, item -> item.id }) { index, item ->
            val isCurrent = index == currentIndex
            val showsBin = PostSlideLaw.showsDelete(index, currentIndex = currentIndex, count = media.size)
            val deleteLabel = stringResource(R.string.feed_composer_slide_rail_delete, index + 1)
            SlideRailTile(
                position = stringResource(R.string.feed_composer_slide_rail_position, index + 1, media.size),
                deleteLabel = deleteLabel,
                isCurrent = isCurrent,
                navigates = PostSlideLaw.tilesNavigate(media.size),
                showsBin = showsBin,
                onSelect = { onSelect(item.id) },
                onDelete = { onRemove(item.id) },
                modifier = Modifier.animateItem(),
                actions = if (showsBin) listOf(CustomAccessibilityAction(deleteLabel) { onRemove(item.id); true }) else emptyList(),
            ) {
                if (item.hasThumbnailPreview) {
                    AsyncImage(
                        model = item.thumbnailUrl ?: item.url,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant), Alignment.Center) {
                        Icon(MeeshyIcons.Document, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}
