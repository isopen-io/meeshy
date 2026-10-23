package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.VerticalAlignBottom
import androidx.compose.material.icons.filled.VerticalAlignTop
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.ui.theme.hexColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.scene.StoryTextDirection

/**
 * One on-canvas text element: positioned at its normalised ([StoryTextElement.x],
 * [StoryTextElement.y]) of the measured canvas (centred on that point), draggable,
 * tappable to edit, and — when selected — carrying a small remove affordance. The
 * normalised→pixel placement and the pixel→normalised drag delta are the only
 * arithmetic here; the clamp lives in [StoryTextElement.nudged]. Pure glue.
 */
@Composable
internal fun TextElementLayer(
    element: StoryTextElement,
    selected: Boolean,
    menu: StoryElementContextMenu?,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    onMenuAction: (StoryElementAction) -> Unit,
    onMenuDismiss: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
    onTransform: (Float, Float) -> Unit,
    onRemove: () -> Unit,
    onMeasured: (IntSize) -> Unit = {},
    onTextChange: (String) -> Unit = {},
) {
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (element.x * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                    y = (element.y * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = element.scale
                scaleY = element.scale
                rotationZ = element.rotationDeg
            }
            .onSizeChanged {
                sizePx = it
                onMeasured(it)
            }
            .pointerInput(element.id) {
                detectTapGestures(onLongPress = { onLongPress() }, onTap = { onTap() })
            }
            .pointerInput(element.id) {
                detectTransformGestures { _, pan, zoom, rotation ->
                    onDrag(pan.x, pan.y)
                    onTransform(zoom, rotation)
                }
            }
            .pointerInput(element.id) {
                // Observes the Final pass without consuming, so it fires the moment
                // the drag/pinch lifts (every pointer up) — clearing the snap guides —
                // while the transform detector above still owns the gesture deltas.
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Final)
                    } while (event.changes.any { it.pressed })
                    onDragEnd()
                }
            }
            .background(
                color = if (selected) Color.Black.copy(alpha = 0.35f) else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        val typography = element.style.typography()
        val textColor = hexColor(element.color, Color.White)
        // The base size in wire design units (1080-referential) mapped onto the REAL scene
        // width — the reader's own law (StoryTextMetrics) — with the element's graphicsLayer
        // `scale` above multiplying on top: iOS `fontSize × scale`, identical on both sides.
        val density = LocalDensity.current
        val canvasFontSizePx = element.previewFontPx(canvasWidthPx)
        val canvasFontSize = with(density) { canvasFontSizePx.toSp() }
        // Edited in place while selected (and no context menu is up) — iOS inline editor.
        val editing = selected && menu == null
        val placeholder = stringResource(R.string.stories_composer_text_placeholder)
        val displayText = element.text.ifBlank { placeholder }
        // Base writing direction is derived from the caption (iOS-parity render-time
        // derivation via the pure StoryTextBidi), so an Arabic/Hebrew caption lays its
        // paragraph out right-to-left. Applied to both the stroked underlay and the fill.
        val textDirection = when (element.baseDirection) {
            StoryTextDirection.LTR -> TextDirection.Ltr
            StoryTextDirection.RTL -> TextDirection.Rtl
        }
        // The EFFECT of the preset (#4870) — the same table as the viewer and the two
        // other clients, projected at the canvas font size. The "neon" preset of this
        // composer carries the glow until it gets its own effect control; it is also
        // what `toTextObject` publishes, so what the author sees is what leaves.
        val baseStyle = LocalTextStyle.current.copy(
            shadow = element.style.presetEffect().composeShadow(canvasFontSizePx, textColor),
            textDirection = textDirection,
        )
        Box(
            modifier = Modifier
                .composerTextBacking(element.background)
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            val outline = element.outline
            if (outline.isVisible && !(editing && element.text.isEmpty())) {
                // Stroked underlay: the same glyphs painted as an outline beneath the fill,
                // so the border hugs the letterforms rather than boxing the element.
                Text(
                    text = displayText,
                    color = hexColor(outline.color!!, Color.White),
                    fontSize = canvasFontSize,
                    fontWeight = FontWeight(typography.fontWeight),
                    fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                    fontFamily = typography.family.toFontFamily(),
                    letterSpacing = typography.letterSpacingEm.em,
                    textAlign = element.align.toTextAlign(),
                    style = baseStyle.copy(drawStyle = Stroke(width = element.previewOutlinePx(canvasWidthPx))),
                )
            }
            if (editing) {
                ComposerInlineTextField(
                    elementId = element.id,
                    text = element.text,
                    placeholder = placeholder,
                    style = baseStyle.copy(
                        color = textColor,
                        fontSize = canvasFontSize,
                        fontWeight = FontWeight(typography.fontWeight),
                        fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                        fontFamily = typography.family.toFontFamily(),
                        letterSpacing = typography.letterSpacingEm.em,
                        textAlign = element.align.toTextAlign(),
                    ),
                    onTextChange = onTextChange,
                )
            } else {
                Text(
                    text = displayText,
                    color = textColor,
                    fontSize = canvasFontSize,
                    fontWeight = FontWeight(typography.fontWeight),
                    fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
                    fontFamily = typography.family.toFontFamily(),
                    letterSpacing = typography.letterSpacingEm.em,
                    textAlign = element.align.toTextAlign(),
                    style = baseStyle,
                )
            }
        }
        if (selected) {
            Surface(
                onClick = onRemove,
                shape = RoundedCornerShape(50),
                color = Color.Black.copy(alpha = 0.55f),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(20.dp),
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = stringResource(R.string.stories_composer_remove_text),
                    tint = Color.White,
                    modifier = Modifier.padding(2.dp),
                )
            }
        }
        // Unified long-press context menu, anchored to the element it targets. Each row's
        // availability comes from the pure StoryElementMenu.resolve, so a greyed row can
        // never dispatch an inert reducer; picking one routes through onMenuAction, which
        // also closes the menu.
        DropdownMenu(expanded = menu != null, onDismissRequest = onMenuDismiss) {
            menu?.items?.forEach { item ->
                DropdownMenuItem(
                    text = { Text(stringResource(item.action.labelRes())) },
                    enabled = item.enabled,
                    leadingIcon = { Icon(item.action.menuIcon(), contentDescription = null) },
                    onClick = { onMenuAction(item.action) },
                )
            }
        }
    }
}

/** The localised label for a context-menu [StoryElementAction] row. */
internal fun StoryElementAction.labelRes(): Int = when (this) {
    StoryElementAction.EDIT -> R.string.stories_composer_edit_element
    StoryElementAction.DUPLICATE -> R.string.stories_composer_duplicate_element
    StoryElementAction.SEND_TO_BACK -> R.string.stories_composer_zorder_to_back
    StoryElementAction.MOVE_BACKWARD -> R.string.stories_composer_zorder_backward
    StoryElementAction.MOVE_FORWARD -> R.string.stories_composer_zorder_forward
    StoryElementAction.BRING_TO_FRONT -> R.string.stories_composer_zorder_to_front
    StoryElementAction.DELETE -> R.string.stories_composer_remove_text
}

/** The leading icon for a context-menu [StoryElementAction] row. */
internal fun StoryElementAction.menuIcon(): ImageVector = when (this) {
    StoryElementAction.EDIT -> Icons.Filled.Edit
    StoryElementAction.DUPLICATE -> Icons.Filled.ContentCopy
    StoryElementAction.SEND_TO_BACK -> Icons.Filled.VerticalAlignBottom
    StoryElementAction.MOVE_BACKWARD -> Icons.Filled.ArrowDownward
    StoryElementAction.MOVE_FORWARD -> Icons.Filled.ArrowUpward
    StoryElementAction.BRING_TO_FRONT -> Icons.Filled.VerticalAlignTop
    StoryElementAction.DELETE -> Icons.Filled.Delete
}

internal fun StoryTextAlign.toTextAlign(): TextAlign = when (this) {
    StoryTextAlign.LEFT -> TextAlign.Start
    StoryTextAlign.CENTER -> TextAlign.Center
    StoryTextAlign.RIGHT -> TextAlign.End
}

internal fun StoryTextFontFamily.toFontFamily(): FontFamily = when (this) {
    StoryTextFontFamily.SANS -> FontFamily.SansSerif
    StoryTextFontFamily.SERIF -> FontFamily.Serif
    StoryTextFontFamily.MONOSPACE -> FontFamily.Monospace
    StoryTextFontFamily.CURSIVE -> FontFamily.Cursive
}
