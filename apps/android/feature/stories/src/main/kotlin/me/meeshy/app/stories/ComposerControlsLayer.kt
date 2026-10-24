package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material3.IconButton
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.StoryToolMode

/**
 * The open tool's panel under a resizable handle — parity with iOS, it slides over the
 * bottom of the stage ([ComposerStage]) and never resizes the scene. What is open is decided
 * by the pure [ComposerBandState]; this Composable only renders it and forwards intents. The
 * tool row itself is [ComposerToolBand].
 */
@Composable
internal fun ComposerToolPanel(
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
    onDismiss: () -> Unit,
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
    var panelHeightDp by remember { mutableFloatStateOf(DEFAULT_PANEL_HEIGHT_DP) }
    val activeTool = band.activeTool
    AnimatedVisibility(visible = activeTool != null) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                ComposerBandHandle(
                    heightDp = panelHeightDp,
                    onHeightChange = { panelHeightDp = it },
                    onDismiss = onDismiss,
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(panelHeightDp.dp)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    when (activeTool) {
                        StoryToolMode.MEDIA -> {
                            MediaTile(isUploadingMedia, isMediaFull, mediaCount, hasMedia, onPickMedia)
                            BandTile(
                                icon = { Icon(Icons.Filled.EmojiEmotions, contentDescription = null) },
                                label = stringResource(R.string.stories_composer_add_sticker),
                                enabled = canAddSticker,
                                onClick = onAddSticker,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        StoryToolMode.TEXT -> BandTile(
                            icon = { Icon(Icons.Filled.TextFields, contentDescription = null) },
                            label = stringResource(R.string.stories_composer_add_text),
                            enabled = canAddText,
                            onClick = onAddText,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        StoryToolMode.DRAWING -> BandTile(
                            icon = { Icon(Icons.Filled.Brush, contentDescription = null) },
                            label = stringResource(R.string.stories_composer_draw),
                            enabled = true,
                            onClick = onEnterDrawing,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        StoryToolMode.TEXTURE -> {
                            BackgroundRow(selected = selectedBackground, onSelect = onSelectBackground)
                            FilterRow(
                                selected = selectedFilter,
                                intensity = filterIntensity,
                                onSelect = onSelectFilter,
                                onIntensityChange = onFilterIntensityChange,
                            )
                            DurationRow(seconds = slideDurationSeconds, onSecondsChange = onSlideDurationChange)
                            VisibilityRow(selected = visibility, onSelect = onSelectVisibility)
                        }
                        else -> Unit
                    }
                }
            }
        }
    }
}

/**
 * The tool row of the band, under the stage — or, with the chrome voluntarily hidden, only a
 * ghost handle that gives the row back in one tap.
 */
@Composable
internal fun ComposerToolBand(
    band: ComposerBandState,
    badges: Map<StoryToolMode, Int>,
    onToolTap: (StoryToolMode) -> Unit,
    onToolSwipeUp: (StoryToolMode) -> Unit,
    onHideChrome: () -> Unit,
    onShowChrome: () -> Unit,
) {
    if (band.isChromeHidden) {
        GhostHandle(onShowChrome)
    } else {
        ComposerToolRow(
            tools = ComposerBandTools.served,
            badges = badges,
            activeTool = band.activeTool,
            onTap = onToolTap,
            onSwipeUp = onToolSwipeUp,
            onSwipeDown = onHideChrome,
        )
    }
}

private const val DEFAULT_PANEL_HEIGHT_DP = 220f

/** The ghost handle of a voluntarily bare screen: one tap brings the tool row back. */
@Composable
private fun GhostHandle(onShow: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
        IconButton(onClick = onShow) {
            Icon(
                Icons.Filled.ExpandLess,
                contentDescription = stringResource(R.string.story_composer_grabber),
            )
        }
    }
}

@Composable
private fun MediaTile(
    isUploadingMedia: Boolean,
    isMediaFull: Boolean,
    mediaCount: Int,
    hasMedia: Boolean,
    onPickMedia: () -> Unit,
) {
    BandTile(
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
        modifier = Modifier.fillMaxWidth(),
    )
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
