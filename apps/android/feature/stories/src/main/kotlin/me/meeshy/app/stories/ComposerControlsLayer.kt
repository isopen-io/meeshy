package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter

/**
 * The bottom-band tools toolbar — parity with iOS's composer FAB column + bottom band
 * (`Contenu` / `Effets`). Two FABs toggle a tools drawer that animates in above them;
 * the drawer shows the active [BandCategory]'s tools — Contenu's add-text / add-media
 * tiles, or Effets' visibility chips. Which category is showing, and whether the drawer
 * is open at all, is decided by the pure, unit-tested [ComposerBandState]; this
 * Composable only renders that state and forwards intents. The drawer is dismissable by
 * a downward swipe and swaps category on a horizontal swipe — natural gestures routed
 * through [onDismiss] / [onSwapCategory].
 */
@Composable
internal fun ComposerControlsLayer(
    band: ComposerBandState,
    visibility: StoryVisibility,
    selectedFilter: StoryFilter?,
    filterIntensity: Float,
    slideDurationSeconds: Double,
    selectedBackground: StoryBackgroundValue?,
    canAddText: Boolean,
    canAddSticker: Boolean,
    isUploadingMedia: Boolean,
    isMediaFull: Boolean,
    mediaCount: Int,
    hasMedia: Boolean,
    onFabTap: (BandCategory) -> Unit,
    onDismiss: () -> Unit,
    onSwapCategory: () -> Unit,
    onAddText: () -> Unit,
    onAddSticker: () -> Unit,
    onPickMedia: () -> Unit,
    onEnterDrawing: () -> Unit,
    onSelectVisibility: (StoryVisibility) -> Unit,
    onSelectFilter: (StoryFilter?) -> Unit,
    onFilterIntensityChange: (Float) -> Unit,
    onSlideDurationChange: (Double) -> Unit,
    onSelectBackground: (StoryBackgroundValue?) -> Unit,
) {
    val swipeThresholdPx = with(LocalDensity.current) { 48.dp.toPx() }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AnimatedVisibility(visible = band.isVisible) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .pointerInput(Unit) {
                        var total = 0f
                        detectVerticalDragGestures(
                            onDragStart = { total = 0f },
                            onDragEnd = { if (total > swipeThresholdPx) onDismiss() },
                        ) { change, dy -> change.consume(); total += dy }
                    }
                    .pointerInput(Unit) {
                        var total = 0f
                        detectHorizontalDragGestures(
                            onDragStart = { total = 0f },
                            onDragEnd = { if (abs(total) > swipeThresholdPx) onSwapCategory() },
                        ) { change, dx -> change.consume(); total += dx }
                    },
            ) {
                when (band.activeCategory) {
                    BandCategory.CONTENU -> ContentTilesRow(
                        canAddText = canAddText,
                        canAddSticker = canAddSticker,
                        isUploadingMedia = isUploadingMedia,
                        isMediaFull = isMediaFull,
                        mediaCount = mediaCount,
                        hasMedia = hasMedia,
                        onAddText = onAddText,
                        onAddSticker = onAddSticker,
                        onPickMedia = onPickMedia,
                        onEnterDrawing = onEnterDrawing,
                    )
                    BandCategory.EFFETS -> Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        BackgroundRow(
                            selected = selectedBackground,
                            onSelect = onSelectBackground,
                        )
                        FilterRow(
                            selected = selectedFilter,
                            intensity = filterIntensity,
                            onSelect = onSelectFilter,
                            onIntensityChange = onFilterIntensityChange,
                        )
                        DurationRow(
                            seconds = slideDurationSeconds,
                            onSecondsChange = onSlideDurationChange,
                        )
                        VisibilityRow(
                            selected = visibility,
                            onSelect = onSelectVisibility,
                        )
                    }
                    null -> Unit
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BandFab(
                icon = Icons.Filled.Add,
                label = stringResource(R.string.stories_composer_band_contenu),
                active = band.activeCategory == BandCategory.CONTENU,
                onClick = { onFabTap(BandCategory.CONTENU) },
            )
            BandFab(
                icon = Icons.Filled.Tune,
                label = stringResource(R.string.stories_composer_band_effets),
                active = band.activeCategory == BandCategory.EFFETS,
                onClick = { onFabTap(BandCategory.EFFETS) },
            )
        }
    }
}

/** One bottom-band FAB. Brand-coloured when its category's drawer is open. */
@Composable
internal fun BandFab(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    active: Boolean,
    onClick: () -> Unit,
) {
    val container = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer
    val content = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSecondaryContainer
    ExtendedFloatingActionButton(
        onClick = onClick,
        containerColor = container,
        contentColor = content,
        icon = { Icon(icon, contentDescription = null) },
        text = { Text(label) },
    )
}

/** The Contenu drawer's tiles — add-text and pick-media — rendered in [ComposerBand.contentTiles] order. */
@Composable
internal fun ContentTilesRow(
    canAddText: Boolean,
    canAddSticker: Boolean,
    isUploadingMedia: Boolean,
    isMediaFull: Boolean,
    mediaCount: Int,
    hasMedia: Boolean,
    onAddText: () -> Unit,
    onAddSticker: () -> Unit,
    onPickMedia: () -> Unit,
    onEnterDrawing: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ComposerBand.contentTiles.forEach { tile ->
            when (tile) {
                ComposerContentTile.TEXT -> BandTile(
                    icon = { Icon(Icons.Filled.TextFields, contentDescription = null) },
                    label = stringResource(R.string.stories_composer_add_text),
                    enabled = canAddText,
                    onClick = onAddText,
                    modifier = Modifier.weight(1f),
                )
                ComposerContentTile.MEDIA -> BandTile(
                    icon = {
                        if (isUploadingMedia) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null)
                        }
                    },
                    label = if (hasMedia) {
                        stringResource(R.string.stories_composer_add_media_count, mediaCount, StoryComposerDraft.MAX_MEDIA)
                    } else {
                        stringResource(R.string.stories_composer_add_media)
                    },
                    enabled = !isUploadingMedia && !isMediaFull,
                    onClick = onPickMedia,
                    modifier = Modifier.weight(1f),
                )
                ComposerContentTile.STICKER -> BandTile(
                    icon = { Icon(Icons.Filled.EmojiEmotions, contentDescription = null) },
                    label = stringResource(R.string.stories_composer_add_sticker),
                    enabled = canAddSticker,
                    onClick = onAddSticker,
                    modifier = Modifier.weight(1f),
                )
                ComposerContentTile.DRAW -> BandTile(
                    icon = { Icon(Icons.Filled.Brush, contentDescription = null) },
                    label = stringResource(R.string.stories_composer_draw),
                    enabled = true,
                    onClick = onEnterDrawing,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** A single content-drawer tile: an icon over a label, forwarding [onClick]. Glue. */
@Composable
internal fun BandTile(
    icon: @Composable () -> Unit,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier) {
        icon()
        Text(label, modifier = Modifier.padding(start = 8.dp))
    }
}
