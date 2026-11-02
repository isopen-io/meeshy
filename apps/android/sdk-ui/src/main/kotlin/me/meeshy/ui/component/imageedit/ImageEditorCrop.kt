package me.meeshy.ui.component.imageedit

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.imageedit.AdjustmentKind
import me.meeshy.sdk.model.imageedit.CropFrame
import me.meeshy.sdk.model.imageedit.CropRatio
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.EditorTool
import me.meeshy.sdk.model.imageedit.ImageEditorGeometry
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter
import me.meeshy.ui.R

/** Les libellés de l'historique tirés des ressources (langue de l'application). */
public class ResourceImageEditorLabels(private val context: Context) : ImageEditorLabels {
    override val reset: String get() = context.getString(R.string.image_editor_reset)
    override val resetAdjust: String get() = context.getString(R.string.image_editor_reset_adjust)
    override val rotation: String get() = context.getString(R.string.image_editor_rotation)
    override val flip: String get() = context.getString(R.string.image_editor_flip)
    override val cropApplied: String get() = context.getString(R.string.image_editor_crop_applied)
    override fun filter(filter: ImageFilter): String = context.getString(imageFilterLabel(filter))
    override fun effect(effect: ImageEffect): String = context.getString(imageEffectLabel(effect))
    override fun adjustment(kind: AdjustmentKind): String = context.getString(adjustmentLabel(kind))
}

/**
 * Le cycle de vie du cadre de recadrage, côté vue : ratio choisi, rectangle à l'écran, fond
 * orienté, et la règle d'or d'iOS — le recadrage n'est gravé que si le cadre a été saisi (ou
 * qu'un recadrage existait déjà), si bien qu'ouvrir puis fermer l'outil est un no-op.
 */
@Stable
internal class ImageEditorCropController(
    private val vm: ImageEditorViewModel,
    initialRatio: CropRatio,
) {
    var ratio by mutableStateOf(initialRatio)
        private set
    var rect by mutableStateOf(CropRect(0f, 0f, 0f, 0f))
    var display by mutableStateOf(CropRect(0f, 0f, 0f, 0f))
        private set
    var backdrop by mutableStateOf<Bitmap?>(null)
        private set
    var generation by mutableIntStateOf(0)
        private set
    var dirty: Boolean = false
    private var initialized = false

    fun select(tool: EditorTool) {
        val leavingCrop = vm.uiState.value.activeTool == EditorTool.CROP
        if (leavingCrop) bake()
        vm.onEvent(ImageEditorUiEvent.SelectTool(tool))
        if (vm.uiState.value.activeTool == EditorTool.CROP && !leavingCrop) enter()
    }

    fun chooseRatio(next: CropRatio) {
        dirty = true
        ratio = next
        if (display.width > 1f && display.height > 1f) rect = CropFrame.adjustedToRatio(rect, next.aspectRatio, display)
    }

    fun rotate(clockwise: Boolean) {
        bake()
        vm.onEvent(ImageEditorUiEvent.Rotate(clockwise))
        enter()
    }

    fun flip(horizontal: Boolean) {
        bake()
        vm.onEvent(ImageEditorUiEvent.Flip(horizontal))
        enter()
    }

    fun bake() {
        val ui = vm.uiState.value
        if (ui.activeTool != EditorTool.CROP) return
        val baked = CropFrame.bake(dirty, ui.state.crop != null, rect, display) ?: return
        vm.onEvent(ImageEditorUiEvent.BakeCrop(baked.crop))
    }

    fun place(displayRect: CropRect) {
        display = displayRect
        if (initialized || displayRect.width <= 1f || displayRect.height <= 1f) return
        rect = CropFrame.initial(vm.uiState.value.state.crop, ratio.aspectRatio, displayRect)
        initialized = true
    }

    private fun enter() {
        backdrop = vm.cropBackdrop()
        initialized = false
        dirty = false
        generation++
    }

    val workingImage: Bitmap get() = vm.workingImage
}

@Composable
internal fun rememberImageEditorCrop(vm: ImageEditorViewModel, initialRatio: CropRatio): ImageEditorCropController =
    remember(vm) { ImageEditorCropController(vm, initialRatio) }

/** Le fond orienté (voilé à 32 %) et, par-dessus, le cadre à poignées. */
@Composable
internal fun ImageEditorCropCanvas(crop: ImageEditorCropController) {
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val inset = with(density) { 16.dp.toPx() }
        val backdrop = crop.backdrop ?: crop.workingImage
        val fitted = ImageEditorGeometry.fittedRect(
            backdrop.width.toFloat(),
            backdrop.height.toFloat(),
            (constraints.maxWidth - 2 * inset).coerceAtLeast(80f),
            (constraints.maxHeight - 2 * inset).coerceAtLeast(80f),
        )
        val displayRect = fitted.offsetBy(inset, inset)
        LaunchedEffect(displayRect, crop.generation) { crop.place(displayRect) }
        Image(
            bitmap = remember(backdrop) { backdrop.asImageBitmap() },
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier
                .offset { IntOffset(displayRect.left.roundToInt(), displayRect.top.roundToInt()) }
                .size(with(density) { displayRect.width.toDp() }, with(density) { displayRect.height.toDp() })
                .alpha(0.32f),
        )
        CropOverlayView(
            cropRect = crop.rect,
            onCropRectChange = { crop.rect = it },
            imageDisplayRect = displayRect,
            aspectRatio = crop.ratio.aspectRatio,
            onInteraction = { crop.dirty = true },
        )
    }
}
