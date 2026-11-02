package me.meeshy.ui.component.imageedit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.imageedit.CropGeometry
import me.meeshy.sdk.model.imageedit.CropOverlayHandle
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.CropSize

private const val SCRIM_ALPHA = 0.6f
private const val GRID_ALPHA = 0.5f
private const val CORNER_ARM = 0.6f

/**
 * Cadre de recadrage interactif : quatre coins en L et quatre poignées de bord (cachées en mode
 * ratio), voile sombre hors cadre, grille de tiers, déplacement du cadre entier au centre. Les
 * poignées se dessinent à 24 dp mais se saisissent sur 48 dp. Miroir d'iOS `CropOverlayView`.
 *
 * [onInteraction] se déclenche dès qu'une poignée (ou le cadre) est saisie — au premier appui, avant
 * le seuil de glissement, comme iOS `DragGesture(minimumDistance: 0)` : l'hôte ne cuit le
 * recadrage que s'il a été saisi, ouvrir puis fermer l'outil reste un no-op.
 */
@Composable
public fun CropOverlayView(
    cropRect: CropRect,
    onCropRectChange: (CropRect) -> Unit,
    imageDisplayRect: CropRect,
    aspectRatio: Double?,
    modifier: Modifier = Modifier,
    onInteraction: () -> Unit = {},
) {
    val rect by rememberUpdatedState(cropRect)
    val onChange by rememberUpdatedState(onCropRectChange)
    val onTouch by rememberUpdatedState(onInteraction)
    val ratio by rememberUpdatedState(aspectRatio)
    val display by rememberUpdatedState(imageDisplayRect)
    var active by remember { mutableStateOf(CropOverlayHandle.NONE) }
    val minCrop = with(androidx.compose.ui.platform.LocalDensity.current) { CropGeometry.MIN_CROP_SIZE_DP.dp.toPx() }
    val hitArea = with(androidx.compose.ui.platform.LocalDensity.current) { CropGeometry.HANDLE_HIT_AREA_DP.dp.toPx() }
    val handleSize = with(androidx.compose.ui.platform.LocalDensity.current) { CropGeometry.HANDLE_SIZE_DP.dp.toPx() }

    Box(modifier.fillMaxSize()) {
        Canvas(
            Modifier
                .fillMaxSize()
                .clearAndSetSemantics { }
                .pointerInput(hitArea) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        val grabbed = CropGeometry.detectHandle(rect, down.position.x, down.position.y, ratio, hitArea)
                        if (grabbed != CropOverlayHandle.NONE) onTouch()
                    }
                }
                .pointerInput(minCrop, hitArea) {
                    detectDragGestures(
                        onDragStart = { start ->
                            active = CropGeometry.detectHandle(rect, start.x, start.y, ratio, hitArea)
                        },
                        onDrag = { change, delta ->
                            change.consume()
                            val next = CropGeometry.resized(
                                rect, active, CropSize(delta.x, delta.y), ratio, minCrop,
                            )
                            if (next != rect) onChange(next)
                        },
                        onDragEnd = { settle(active, rect, display, minCrop, onChange); active = CropOverlayHandle.NONE },
                        onDragCancel = { active = CropOverlayHandle.NONE },
                    )
                },
        ) {
            drawScrim(cropRect)
            drawFrame(cropRect)
            drawHandles(cropRect, aspectRatio, handleSize)
        }
        CropAccessibilityLayer(
            cropRect = cropRect,
            imageDisplayRect = imageDisplayRect,
            aspectRatio = aspectRatio,
            minCropSize = minCrop,
            onInteraction = onInteraction,
            onCropRectChange = onCropRectChange,
        )
    }
}

private fun settle(
    handle: CropOverlayHandle,
    rect: CropRect,
    display: CropRect,
    minCrop: Float,
    onChange: (CropRect) -> Unit,
) {
    if (handle == CropOverlayHandle.NONE) return
    val fitted = CropGeometry.constrained(rect, display, minCrop)
    if (fitted != rect) onChange(fitted)
}

private fun DrawScope.drawScrim(crop: CropRect) {
    val path = Path().apply {
        fillType = PathFillType.EvenOdd
        addRect(androidx.compose.ui.geometry.Rect(0f, 0f, size.width, size.height))
        addRect(androidx.compose.ui.geometry.Rect(crop.left, crop.top, crop.right, crop.bottom))
    }
    drawPath(path, Color.Black.copy(alpha = SCRIM_ALPHA))
}

private fun DrawScope.drawFrame(crop: CropRect) {
    val topLeft = Offset(crop.left, crop.top)
    val size = Size(crop.width, crop.height)
    drawRect(Color.Black.copy(alpha = 0.3f), topLeft, size, style = Stroke(2.dp.toPx() + 2f))
    drawRect(Color.White, topLeft, size, style = Stroke(2.dp.toPx()))
    val grid = Color.White.copy(alpha = GRID_ALPHA)
    val hair = 1.dp.toPx() / 2f
    for (i in 1..2) {
        val x = crop.left + crop.width * i / 3f
        val y = crop.top + crop.height * i / 3f
        drawLine(grid, Offset(x, crop.top), Offset(x, crop.bottom), hair)
        drawLine(grid, Offset(crop.left, y), Offset(crop.right, y), hair)
    }
}

private fun DrawScope.drawHandles(crop: CropRect, aspectRatio: Double?, handle: Float) {
    val arm = handle * CORNER_ARM
    val stroke = 3.dp.toPx()
    val half = handle / 2f
    fun corner(cx: Float, cy: Float, sx: Float, sy: Float) {
        val ox = cx - sx * half
        val oy = cy - sy * half
        drawLine(Color.Black.copy(alpha = 0.5f), Offset(ox, oy), Offset(ox + sx * arm, oy), stroke + 2f)
        drawLine(Color.Black.copy(alpha = 0.5f), Offset(ox, oy), Offset(ox, oy + sy * arm), stroke + 2f)
        drawLine(Color.White, Offset(ox, oy), Offset(ox + sx * arm, oy), stroke)
        drawLine(Color.White, Offset(ox, oy), Offset(ox, oy + sy * arm), stroke)
    }
    corner(crop.left, crop.top, 1f, 1f)
    corner(crop.right, crop.top, -1f, 1f)
    corner(crop.left, crop.bottom, 1f, -1f)
    corner(crop.right, crop.bottom, -1f, -1f)
    if (aspectRatio != null) return
    val long = 30.dp.toPx()
    val thick = 4.dp.toPx()
    fun bar(cx: Float, cy: Float, horizontal: Boolean) {
        val w = if (horizontal) long else thick
        val h = if (horizontal) thick else long
        drawRoundRect(
            Color.White,
            Offset(cx - w / 2f, cy - h / 2f),
            Size(w, h),
            androidx.compose.ui.geometry.CornerRadius(2.dp.toPx()),
        )
    }
    bar(crop.centerX, crop.top, true)
    bar(crop.centerX, crop.bottom, true)
    bar(crop.left, crop.centerY, false)
    bar(crop.right, crop.centerY, false)
}
