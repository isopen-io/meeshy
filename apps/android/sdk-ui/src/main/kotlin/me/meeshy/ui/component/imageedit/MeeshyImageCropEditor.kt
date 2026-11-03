package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.media.CropNudge
import me.meeshy.sdk.model.media.ImageCropGeometry
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshySpacing

/** La forme du cadre : un cercle (avatar) ou un rectangle large (bannière, largeur d'écran x 130 dp). */
public enum class CropEditorShape { CIRCLE, WIDE }

/**
 * L'éditeur de recadrage plein écran des photos d'entité (miroir de `MeeshyImageEditorView` d'iOS) : pincer pour
 * zoomer, glisser pour déplacer, flèches du clavier pour déplacer par pas, contrainte « cover ». « Annuler » rend sans
 * rien envoyer ; « Valider » rend les octets JPEG du cadre, recadrés hors du fil principal.
 */
@Composable
public fun MeeshyImageCropEditor(
    image: Bitmap,
    shape: CropEditorShape,
    onCancel: () -> Unit,
    onAccept: (ByteArray) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var working by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val density = LocalDensity.current
    BoxWithConstraints(modifier.fillMaxSize().background(Color.Black)) {
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { (maxHeight - ACTION_BAR_HEIGHT).toPx() }
        val frame = remember(shape, widthPx, heightPx, density.density) {
            when (shape) {
                CropEditorShape.CIRCLE -> ImageCropGeometry.avatarFrame(widthPx, heightPx)
                CropEditorShape.WIDE -> ImageCropGeometry.bannerFrame(widthPx, density.density)
            }
        }
        val gesture = remember(image, frame) { CropGestureState(image.width, image.height, frame) }
        val description = stringResource(
            if (shape == CropEditorShape.CIRCLE) R.string.photo_crop_editor_avatar else R.string.photo_crop_editor_banner,
        )
        val zoomIn = stringResource(R.string.photo_crop_zoom_in)
        val zoomOut = stringResource(R.string.photo_crop_zoom_out)
        val moves = CropNudge.entries.map { it to stringResource(nudgeLabel(it)) }

        Box(
            Modifier
                .fillMaxSize()
                .clipToBounds()
                .pointerInput(gesture) {
                    detectTransformGestures { _, pan, zoom, _ -> gesture.onGesture(pan.x, pan.y, zoom) }
                }
                .focusRequester(focus)
                .focusable()
                .onKeyEvent { event -> if (event.type == KeyEventType.KeyDown) handleKey(event.key, gesture) else false }
                .semantics {
                    contentDescription = description
                    customActions = buildList {
                        add(CustomAccessibilityAction(zoomIn) { gesture.zoomBy(CropGestureState.ZOOM_STEP); true })
                        add(CustomAccessibilityAction(zoomOut) { gesture.zoomBy(1f / CropGestureState.ZOOM_STEP); true })
                        moves.forEach { (direction, label) ->
                            add(CustomAccessibilityAction(label) { gesture.nudge(direction); true })
                        }
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            val scale = gesture.displayScale
            Image(
                bitmap = image.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.FillBounds,
                modifier = Modifier
                    .size(
                        with(density) { (image.width * scale).toDp() },
                        with(density) { (image.height * scale).toDp() },
                    )
                    .graphicsLayer {
                        translationX = gesture.transform.offsetX
                        translationY = gesture.transform.offsetY
                    },
            )
            CropMask(frame.widthPx, frame.heightPx, frame.circular)
        }

        Row(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .heightIn(min = ACTION_BAR_HEIGHT)
                .padding(horizontal = MeeshySpacing.lg),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onCancel, enabled = !working, modifier = Modifier.heightIn(min = MIN_TOUCH)) {
                Text(stringResource(R.string.image_editor_cancel), color = Color.White)
            }
            if (working) CircularProgressIndicator(Modifier.size(MeeshySpacing.xxl), color = Color.White)
            TextButton(
                onClick = {
                    if (working) return@TextButton
                    working = true
                    scope.launch {
                        val bytes = withContext(Dispatchers.Default) { gesture.cropToJpeg(image) }
                        onAccept(bytes)
                    }
                },
                enabled = !working,
                modifier = Modifier.heightIn(min = MIN_TOUCH),
            ) {
                Text(stringResource(R.string.image_editor_done), color = Color.White)
            }
        }
    }
}

@Composable
private fun CropMask(frameWidthPx: Float, frameHeightPx: Float, circular: Boolean) {
    Canvas(
        Modifier
            .fillMaxSize()
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen },
    ) {
        drawRect(Color.Black.copy(alpha = DIM_ALPHA))
        val topLeft = Offset((size.width - frameWidthPx) / 2f, (size.height - frameHeightPx) / 2f)
        val frameSize = Size(frameWidthPx, frameHeightPx)
        val corner = CornerRadius(CORNER_DP.dp.toPx())
        if (circular) {
            drawCircle(Color.Black, radius = frameWidthPx / 2f, center = center, blendMode = BlendMode.Clear)
            drawCircle(Color.White, radius = frameWidthPx / 2f, center = center, style = Stroke(width = 1.dp.toPx()))
        } else {
            drawRoundRect(Color.Black, topLeft, frameSize, corner, blendMode = BlendMode.Clear)
            drawRoundRect(Color.White, topLeft, frameSize, corner, style = Stroke(width = 1.dp.toPx()))
        }
    }
}

private fun handleKey(key: Key, gesture: CropGestureState): Boolean {
    when (key) {
        Key.DirectionLeft -> gesture.nudge(CropNudge.LEFT)
        Key.DirectionRight -> gesture.nudge(CropNudge.RIGHT)
        Key.DirectionUp -> gesture.nudge(CropNudge.UP)
        Key.DirectionDown -> gesture.nudge(CropNudge.DOWN)
        Key.Plus, Key.Equals, Key.NumPadAdd -> gesture.zoomBy(CropGestureState.ZOOM_STEP)
        Key.Minus, Key.NumPadSubtract -> gesture.zoomBy(1f / CropGestureState.ZOOM_STEP)
        else -> return false
    }
    return true
}

private fun nudgeLabel(direction: CropNudge): Int = when (direction) {
    CropNudge.LEFT -> R.string.photo_crop_move_left
    CropNudge.RIGHT -> R.string.photo_crop_move_right
    CropNudge.UP -> R.string.photo_crop_move_up
    CropNudge.DOWN -> R.string.photo_crop_move_down
}

/** Recadre la source au rectangle du cadre et l'encode en JPEG — à appeler hors du fil principal. */
private fun CropGestureState.cropToJpeg(image: Bitmap): ByteArray {
    val rect = sourceRect()
    val cropped = Bitmap.createBitmap(image, rect.leftPx, rect.topPx, rect.widthPx, rect.heightPx)
    return try {
        ByteArrayOutputStream().also { cropped.compress(Bitmap.CompressFormat.JPEG, CROP_JPEG_QUALITY, it) }.toByteArray()
    } finally {
        if (cropped !== image) cropped.recycle()
    }
}

private val ACTION_BAR_HEIGHT = 72.dp
private val MIN_TOUCH = 48.dp
private const val CROP_JPEG_QUALITY = 95
private const val DIM_ALPHA = 0.6f
private const val CORNER_DP = 12
