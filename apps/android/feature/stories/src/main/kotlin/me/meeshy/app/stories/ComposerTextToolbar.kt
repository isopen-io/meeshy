package me.meeshy.app.stories

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.BorderColor
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.FormatAlignCenter
import androidx.compose.material.icons.filled.FormatAlignLeft
import androidx.compose.material.icons.filled.FormatAlignRight
import androidx.compose.material.icons.filled.FormatColorReset
import androidx.compose.material.icons.filled.FormatSize
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Timelapse
import androidx.compose.material.icons.filled.VerticalAlignBottom
import androidx.compose.material.icons.filled.VerticalAlignTop
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.ui.theme.hexColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextBackgroundPresets

/** The on-canvas text colour palette — hex (no `#`), [StoryTextElement.DEFAULT_COLOR] first. */
internal val STORY_TEXT_COLORS = listOf(
    StoryTextElement.DEFAULT_COLOR,
    "000000",
    "FF3B30",
    "FF9500",
    "FFCC00",
    "34C759",
    "007AFF",
    "AF52DE",
    "FF2D55",
)

internal fun StoryTextStyle.labelRes(): Int = when (this) {
    StoryTextStyle.BOLD -> R.string.stories_composer_style_bold
    StoryTextStyle.NEON -> R.string.stories_composer_style_neon
    StoryTextStyle.TYPEWRITER -> R.string.stories_composer_style_typewriter
    StoryTextStyle.HANDWRITING -> R.string.stories_composer_style_handwriting
    StoryTextStyle.CLASSIC -> R.string.stories_composer_style_classic
}

/**
 * Styling controls for the [element] being edited, in ONE horizontally scrolling row that
 * lives in the band under the scene, never on it (#12298) — iOS `TextEditFloatingBubbles`
 * parity: a single row, and a « Terminé » that closes the editor without deleting anything.
 * Pure glue: each affordance forwards its choice to a ViewModel intent whose logic is
 * unit-tested; selection highlighting reads straight off the element.
 */
@Composable
internal fun TextStyleToolbar(
    element: StoryTextElement,
    onStyle: (StoryTextStyle) -> Unit,
    onColor: (String) -> Unit,
    onAlign: (StoryTextAlign) -> Unit,
    onBackground: (StoryTextBackground) -> Unit,
    onCycleSize: () -> Unit,
    onCycleOutline: () -> Unit,
    onCycleFadeIn: () -> Unit,
    onCycleFadeOut: () -> Unit,
    onCycleStart: () -> Unit,
    onCycleDuration: () -> Unit,
    onDuplicate: () -> Unit,
    onReorder: (StoryZOrder) -> Unit,
    modifier: Modifier = Modifier,
    onDone: (() -> Unit)? = null,
) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .horizontalScroll(rememberScrollState()),
        ) {
            StoryTextStyle.entries.forEach { style ->
                FilterChip(
                    selected = element.style == style,
                    onClick = { onStyle(style) },
                    label = { Text(stringResource(style.labelRes())) },
                )
            }
            AlignToggle(StoryTextAlign.LEFT, element.align, onAlign)
            AlignToggle(StoryTextAlign.CENTER, element.align, onAlign)
            AlignToggle(StoryTextAlign.RIGHT, element.align, onAlign)
            CycleButton(Icons.Filled.FormatSize, R.string.stories_composer_size, element.size != StoryTextSize.DEFAULT, onCycleSize)
            CycleButton(Icons.Filled.BorderColor, R.string.stories_composer_outline, element.outline.isVisible, onCycleOutline)
            STORY_TEXT_COLORS.forEach { hex ->
                ColorSwatch(hex = hex, selected = element.color.equals(hex, ignoreCase = true), onClick = { onColor(hex) })
            }
            StoryTextBackgroundPresets.all.forEach { preset ->
                BackgroundSwatch(background = preset, selected = element.background == preset, onClick = { onBackground(preset) })
            }
            CycleButton(Icons.AutoMirrored.Filled.Login, R.string.stories_composer_fade_in, element.fade.hasFadeIn, onCycleFadeIn)
            CycleButton(Icons.AutoMirrored.Filled.Logout, R.string.stories_composer_fade_out, element.fade.hasFadeOut, onCycleFadeOut)
            CycleButton(Icons.Filled.Schedule, R.string.stories_composer_timing_start, element.timing.hasStart, onCycleStart)
            CycleButton(Icons.Filled.Timelapse, R.string.stories_composer_timing_duration, element.timing.isTimed, onCycleDuration)
            CycleButton(Icons.Filled.ContentCopy, R.string.stories_composer_duplicate_element, false, onDuplicate)
            ZOrderButton(Icons.Filled.VerticalAlignBottom, R.string.stories_composer_zorder_to_back) {
                onReorder(StoryZOrder.TO_BACK)
            }
            ZOrderButton(Icons.Filled.ArrowDownward, R.string.stories_composer_zorder_backward) {
                onReorder(StoryZOrder.BACKWARD)
            }
            ZOrderButton(Icons.Filled.ArrowUpward, R.string.stories_composer_zorder_forward) {
                onReorder(StoryZOrder.FORWARD)
            }
            ZOrderButton(Icons.Filled.VerticalAlignTop, R.string.stories_composer_zorder_to_front) {
                onReorder(StoryZOrder.TO_FRONT)
            }
        }
        if (onDone != null) {
            val doneDescription = stringResource(R.string.stories_composer_text_finish_a11y)
            TextButton(
                onClick = onDone,
                modifier = Modifier.semantics { contentDescription = doneDescription },
            ) {
                Text(stringResource(R.string.stories_composer_text_finish))
            }
        }
    }
}

/** One cycling attribute of the row: tinted primary while the attribute is set. Glue. */
@Composable
private fun CycleButton(icon: ImageVector, labelRes: Int, active: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(
            icon,
            contentDescription = stringResource(labelRes),
            tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * One text-backing choice in the toolbar: a rounded swatch previewing the backing
 * (a slash for None, the frosted scrim for Glass, the fill for Solid), ringed when it
 * is the element's current backing. Tap forwards the pure [StoryTextBackground] preset
 * to [onClick]; the decision logic lives in the unit-tested model.
 */
@Composable
internal fun BackgroundSwatch(
    background: StoryTextBackground,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val ring = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    val fill = when (background) {
        StoryTextBackground.None -> Color.Transparent
        is StoryTextBackground.Solid -> hexColor(background.hex, Color.Transparent)
        is StoryTextBackground.Glass -> Color.White.copy(alpha = 0.18f)
    }
    val label = when (background) {
        StoryTextBackground.None -> stringResource(R.string.stories_composer_bg_none)
        is StoryTextBackground.Solid -> "#${background.hex}"
        is StoryTextBackground.Glass -> stringResource(R.string.stories_composer_bg_glass)
    }
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(fill)
            .border(BorderStroke(if (selected) 2.dp else 1.dp, ring), RoundedCornerShape(8.dp))
            .pointerInput(background) { detectTapGestures { onClick() } }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (background is StoryTextBackground.None) {
            Icon(
                Icons.Filled.FormatColorReset,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
internal fun AlignToggle(
    align: StoryTextAlign,
    current: StoryTextAlign,
    onAlign: (StoryTextAlign) -> Unit,
) {
    val (icon, label) = when (align) {
        StoryTextAlign.LEFT -> Icons.Filled.FormatAlignLeft to R.string.stories_composer_align_left
        StoryTextAlign.CENTER -> Icons.Filled.FormatAlignCenter to R.string.stories_composer_align_center
        StoryTextAlign.RIGHT -> Icons.Filled.FormatAlignRight to R.string.stories_composer_align_right
    }
    val selected = align == current
    IconButton(onClick = { onAlign(align) }) {
        Icon(
            icon,
            contentDescription = stringResource(label),
            tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun ZOrderButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    labelRes: Int,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick) {
        Icon(
            icon,
            contentDescription = stringResource(labelRes),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun ColorSwatch(hex: String, selected: Boolean, onClick: () -> Unit) {
    val ring = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(50))
            .background(hexColor(hex, Color.White))
            .border(BorderStroke(if (selected) 2.dp else 1.dp, ring), RoundedCornerShape(50))
            .pointerInput(hex) { detectTapGestures { onClick() } }
            .semantics { contentDescription = "#$hex" },
    )
}

/**
 * Paints the element's text backing behind the glyphs (glue): a rounded solid fill for
 * [StoryTextBackground.Solid], a translucent frosted scrim approximating the iOS blur for
 * [StoryTextBackground.Glass], and nothing for [StoryTextBackground.None]. The *choice* of
 * backing is the unit-tested [StoryTextBackground]; this only renders it.
 */
internal fun Modifier.composerTextBacking(background: StoryTextBackground): Modifier = when (background) {
    StoryTextBackground.None -> this
    is StoryTextBackground.Solid ->
        this.background(hexColor(background.hex, Color.Transparent), RoundedCornerShape(10.dp))
    is StoryTextBackground.Glass ->
        this.background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(10.dp))
}
