package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerRowFit
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette

private const val NOMINAL_SPACING_DP = 16f
private const val MINIMUM_SPACING_DP = 8f
private const val MARGIN_DP = 16f
private const val HIT_SIDE_DP = 44f
private const val SWIPE_THRESHOLD_DP = 20f

/**
 * The composer's tool row — parity with iOS `ComposerToolRow`: the served tools in
 * canonical order, each with its own tint and the number of elements it carries. Tap opens
 * or closes the panel (medium haptic), swipe up opens it, swipe down hides the chrome. The
 * gap tightens by [ComposerRowFit] before the row scrolls horizontally; the vertical
 * gestures never fight the horizontal scroll.
 */
@Composable
internal fun ComposerToolRow(
    tools: List<StoryToolMode>,
    badges: Map<StoryToolMode, Int>,
    activeTool: StoryToolMode?,
    onTap: (StoryToolMode) -> Unit,
    onSwipeUp: (StoryToolMode) -> Unit,
    onSwipeDown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    var measuredDp by remember { mutableFloatStateOf(0f) }
    val spacing = ComposerRowFit.spacing(
        count = tools.size,
        tileWidth = HIT_SIDE_DP,
        nominalSpacing = NOMINAL_SPACING_DP,
        minimumSpacing = MINIMUM_SPACING_DP,
        margin = MARGIN_DP,
        available = measuredDp,
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .onSizeChanged { measuredDp = with(density) { it.width.toDp().value } }
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MARGIN_DP.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(spacing.dp),
    ) {
        tools.forEach { tool ->
            ComposerToolEntry(
                tool = tool,
                badge = badges[tool] ?: 0,
                isActive = tool == activeTool,
                onTap = { onTap(tool) },
                onSwipeUp = { onSwipeUp(tool) },
                onSwipeDown = onSwipeDown,
            )
        }
    }
}

@Composable
private fun ComposerToolEntry(
    tool: StoryToolMode,
    badge: Int,
    isActive: Boolean,
    onTap: () -> Unit,
    onSwipeUp: () -> Unit,
    onSwipeDown: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val swipeThresholdPx = with(LocalDensity.current) { SWIPE_THRESHOLD_DP.dp.toPx() }
    val currentSwipeUp by rememberUpdatedState(onSwipeUp)
    val currentSwipeDown by rememberUpdatedState(onSwipeDown)
    val accent = tool.accent()
    val name = stringResource(tool.displayNameRes())
    val label = stringResource(R.string.story_composer_fab_open, name)
    val value = if (badge > 0) {
        stringResource(R.string.story_composer_fab_badge, badge)
    } else {
        stringResource(R.string.story_composer_fab_badge_none)
    }
    val hint = stringResource(
        if (isActive) R.string.story_composer_fab_hint_close else R.string.story_composer_fab_hint_open,
    )
    Box(
        modifier = Modifier
            .requiredSize(HIT_SIDE_DP.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "$label. $hint"
                stateDescription = value
            }
            .pointerInput(Unit) {
                var total = 0f
                detectVerticalDragGestures(
                    onDragStart = { total = 0f },
                    onDragEnd = {
                        if (total < -swipeThresholdPx) currentSwipeUp() else if (total > swipeThresholdPx) currentSwipeDown()
                    },
                ) { change, dy -> change.consume(); total += dy }
            }
            .clickable(role = Role.Button) {
                haptics.medium()
                onTap()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = tool.icon(),
            contentDescription = null,
            tint = if (isActive) accent else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(24.dp),
        )
        if (badge > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .requiredSize(width = 18.dp, height = 16.dp)
                    .background(accent, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = badge.toString(), color = Color.White, fontSize = 10.sp)
            }
        }
    }
}

internal fun StoryToolMode.icon(): ImageVector = when (this) {
    StoryToolMode.MEDIA, StoryToolMode.FILTERS -> Icons.Filled.AddPhotoAlternate
    StoryToolMode.AUDIO -> Icons.Filled.MusicNote
    StoryToolMode.DRAWING -> Icons.Filled.Brush
    StoryToolMode.TEXT -> Icons.Filled.TextFields
    StoryToolMode.TEXTURE -> Icons.Filled.Palette
    StoryToolMode.TIMELINE -> Icons.Filled.Schedule
}

internal fun StoryToolMode.accent(): Color = when (this) {
    StoryToolMode.MEDIA -> MeeshyPalette.Error
    StoryToolMode.AUDIO, StoryToolMode.TEXT -> MeeshyPalette.Indigo400
    StoryToolMode.DRAWING -> MeeshyPalette.Success
    StoryToolMode.TEXTURE -> MeeshyPalette.Warning
    StoryToolMode.FILTERS -> MeeshyPalette.Info
    StoryToolMode.TIMELINE -> MeeshyPalette.Indigo300
}

internal fun StoryToolMode.displayNameRes(): Int = when (this) {
    StoryToolMode.MEDIA, StoryToolMode.FILTERS -> R.string.story_tool_media
    StoryToolMode.AUDIO -> R.string.story_tool_audio
    StoryToolMode.DRAWING -> R.string.story_tool_drawing
    StoryToolMode.TEXT -> R.string.story_tool_text
    StoryToolMode.TEXTURE -> R.string.story_tool_texture
    StoryToolMode.TIMELINE -> R.string.story_tool_timeline
}
