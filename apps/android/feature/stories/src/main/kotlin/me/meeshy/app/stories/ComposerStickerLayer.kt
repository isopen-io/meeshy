package me.meeshy.app.stories

import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R

/**
 * One on-canvas emoji sticker: placed at its normalised ([StoryStickerElement.x],
 * [StoryStickerElement.y]) of the measured canvas (centred on that point), draggable,
 * pinch/rotate-able with one gesture, tappable to select, and — when selected —
 * carrying a small remove affordance. The normalised→pixel placement and the
 * pixel→normalised drag delta are the only arithmetic here; the clamp lives in the
 * pure [StoryStickerElement]. Mirrors [TextElementLayer]; pure glue.
 */
@Composable
internal fun StickerLayer(
    sticker: StoryStickerElement,
    selected: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onTransform: (Float, Float) -> Unit,
    onRemove: () -> Unit,
) {
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (sticker.x * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                    y = (sticker.y * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = sticker.scale
                scaleY = sticker.scale
                rotationZ = sticker.rotationDeg
            }
            .onSizeChanged { sizePx = it }
            .pointerInput(sticker.id) { detectTapGestures { onTap() } }
            .pointerInput(sticker.id) {
                detectTransformGestures { _, pan, zoom, rotation ->
                    onDrag(pan.x, pan.y)
                    onTransform(zoom, rotation)
                }
            }
            .background(
                color = if (selected) Color.Black.copy(alpha = 0.25f) else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = sticker.emoji, fontSize = STICKER_BASE_FONT_SIZE)
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
                    contentDescription = stringResource(R.string.stories_composer_remove_sticker),
                    tint = Color.White,
                    modifier = Modifier.padding(2.dp),
                )
            }
        }
    }
}

/** The intrinsic on-canvas emoji size before per-sticker [StoryStickerElement.scale]. */
internal val STICKER_BASE_FONT_SIZE = 48.sp
