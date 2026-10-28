package me.meeshy.app.feed

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val TILE_HEIGHT_DP = 44
private const val SCENE_ASPECT = 9f / 16f
private const val DELETE_TARGET_DP = 28
private const val DELETE_GLYPH_DP = 16
private const val NOT_CURRENT = -1

/**
 * The slide rail of the post and the reel on the plateau (iOS `ComposerSlideRail` mounted by `slideRailSlot`): one tile per
 * slide — in a post a slide is a media — the current one ringed in the brand colour, a tap to switch, the bin on the
 * current tile. Tiles slide into place when one arrives or leaves (the ring eases between tiles too), and each switch
 * ticks. Same geometry and wording as the story's rail (`composer.slide.rail*`); no (+) and no reorder, as on iOS's document
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
    val haptics = rememberMeeshyHaptics()
    val select by rememberUpdatedState(onSelect)
    val remove by rememberUpdatedState(onRemove)
    val currentIndex = media.indexOfFirst { it.id == currentId }.coerceAtLeast(0)
    val tileWidth = (TILE_HEIGHT_DP * SCENE_ASPECT).dp
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
            PostSlideTile(
                item = item,
                index = index,
                count = media.size,
                isCurrent = isCurrent,
                tileWidth = tileWidth,
                onSelect = { if (!isCurrent) haptics.selection(); select(item.id) },
                onDelete = { haptics.light(); remove(item.id) },
                modifier = Modifier.animateItem(),
            )
        }
    }
}

@Composable
private fun PostSlideTile(
    item: UploadedMedia,
    index: Int,
    count: Int,
    isCurrent: Boolean,
    tileWidth: androidx.compose.ui.unit.Dp,
    onSelect: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val navigates = PostSlideLaw.tilesNavigate(count)
    val showsBin = PostSlideLaw.showsDelete(index, currentIndex = if (isCurrent) index else NOT_CURRENT, count = count)
    val position = stringResource(R.string.feed_composer_slide_rail_position, index + 1, count)
    val deleteLabel = stringResource(R.string.feed_composer_slide_rail_delete, index + 1)
    val ringColor by animateColorAsState(
        if (isCurrent) MaterialTheme.colorScheme.primary else LocalContentColor.current.copy(alpha = 0.25f),
        label = "postSlideRing",
    )
    val ringWidth by animateDpAsState(if (isCurrent) 1.5.dp else 0.5.dp, label = "postSlideRingWidth")
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(width = tileWidth, height = TILE_HEIGHT_DP.dp)
                .clip(RoundedCornerShape(MeeshyRadius.xxs))
                .border(ringWidth, ringColor, RoundedCornerShape(MeeshyRadius.xxs))
                .clickable(enabled = navigates, role = Role.Button, onClick = onSelect)
                .clearAndSetSemantics {
                    contentDescription = position
                    selected = isCurrent
                    if (navigates) role = Role.Button
                    customActions = if (showsBin) {
                        listOf(CustomAccessibilityAction(deleteLabel) { onDelete(); true })
                    } else emptyList()
                },
            contentAlignment = Alignment.Center,
        ) {
            if (item.hasThumbnailPreview) {
                AsyncImage(
                    model = item.thumbnailUrl ?: item.url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(width = tileWidth, height = TILE_HEIGHT_DP.dp),
                )
            } else {
                Box(Modifier.size(width = tileWidth, height = TILE_HEIGHT_DP.dp).background(MaterialTheme.colorScheme.surfaceVariant), Alignment.Center) {
                    Icon(MeeshyIcons.Document, contentDescription = null, modifier = Modifier.size(16.dp))
                }
            }
        }
        if (showsBin) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = MeeshySpacing.xs, y = -MeeshySpacing.xs)
                    .size(DELETE_TARGET_DP.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = onDelete)
                    .clearAndSetSemantics { contentDescription = deleteLabel; role = Role.Button },
                contentAlignment = Alignment.TopEnd,
            ) {
                Box(
                    Modifier.size(DELETE_GLYPH_DP.dp).clip(CircleShape).background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = null, tint = ComposerPlateauInk.primary, modifier = Modifier.size(10.dp))
                }
            }
        }
    }
}
