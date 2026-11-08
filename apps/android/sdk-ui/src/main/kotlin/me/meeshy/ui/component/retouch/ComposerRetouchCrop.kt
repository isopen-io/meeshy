package me.meeshy.ui.component.retouch

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.composer.look.ComposerCropStage
import me.meeshy.sdk.model.composer.look.ComposerCropStageLayout
import me.meeshy.sdk.model.imageedit.CropFrame
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.imageedit.CropImageGestures
import me.meeshy.ui.component.imageedit.CropOverlayView
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Les équerres de Recadrer, posées sur la prise ENTIÈRE affichée dans [display] : tirées, elles rendent le
 * recadrage normalisé ([onCrop], `null` ⇒ la prise entière). [aspect] verrouille les proportions d'un preset.
 */
@Composable
public fun RetouchCropBrackets(crop: NormalizedCrop?, aspect: Double?, display: CropRect, onCrop: (NormalizedCrop?) -> Unit) {
    var frame by remember(display, crop, aspect) { mutableStateOf(CropFrame.initial(crop, aspect, display)) }
    CropOverlayView(
        cropRect = frame,
        onCropRectChange = { next ->
            frame = next
            CropFrame.bake(touched = true, hasSavedCrop = crop != null, frame = next, display = display)?.let { onCrop(it.crop) }
        },
        imageDisplayRect = display,
        aspectRatio = aspect,
    )
}

/**
 * **LE RECADRAGE PLEIN ÉCRAN D'UNE PHOTO** (#15194) : la photo reste en grand, le cadre fixe au centre de la place libre
 * ([room]) ; pincer et glisser placent l'image sous le cadre, tirer un angle le redimensionne sur l'image immobile, puis il
 * se recentre. Choisir un préréglage ou lâcher un angle anime le cadre et l'image vers leur nouvelle place ; pendant un
 * geste, ils suivent le doigt sans retard. [onCrop] rend la fenêtre normalisée (`null` ⇒ la prise entière), celle que la
 * cuisson peint.
 */
@Composable
public fun RetouchCropStage(
    picture: ImageBitmap,
    crop: NormalizedCrop?,
    aspect: Double?,
    source: IntSize,
    room: CropRect,
    onCrop: (NormalizedCrop?) -> Unit,
) {
    val target = ComposerCropStage.layout(crop, source.width, source.height, room) ?: return
    val latest = remember { LatestCrop(crop) }
    latest.crop = crop
    val write = { next: NormalizedCrop? -> latest.crop = next; onCrop(next) }
    var held by remember { mutableStateOf<ComposerCropStageLayout?>(null) }
    var live by remember { mutableStateOf(false) }
    val animates = !live && !LocalReduceMotion.current
    val image = rememberStageRect(target.image, held?.image, animates)
    val frame = rememberStageRect(target.frame, held?.frame, animates)
    Box(Modifier.fillMaxSize().clipToBounds()) {
        Image(
            bitmap = picture,
            contentDescription = null,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.placedAt(image).testTag(RETOUCH_CROP_IMAGE_TAG),
        )
        CropOverlayView(
            cropRect = frame,
            onCropRectChange = { next ->
                val still = held
                if (still != null) {
                    held = still.copy(frame = next)
                    write(ComposerCropStage.resized(latest.crop, next, still.image))
                } else {
                    write(ComposerCropStage.resized(latest.crop, next, image))
                }
            },
            imageDisplayRect = image,
            aspectRatio = aspect,
            imageGestures = CropImageGestures(
                onImage = { panX, panY, zoom -> write(ComposerCropStage.reframed(latest.crop, frame, panX, panY, zoom)) },
                onImageStart = { live = true },
                onImageEnd = { live = false },
                onFrameGrab = { held = ComposerCropStageLayout(frame, image) },
                onFrameRelease = { held = null },
            ),
        )
    }
}

/** L'image posée à son rectangle exact, plus grande que l'écran quand on zoome : ni bornée ni recentrée par la place. */
private fun Modifier.placedAt(rect: CropRect): Modifier = layout { measurable, constraints ->
    val width = rect.width.roundToInt().coerceIn(1, MAX_SIDE_PX)
    val height = rect.height.roundToInt().coerceIn(1, MAX_SIDE_PX)
    val placeable = measurable.measure(Constraints.fixed(width, height))
    layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(rect.left.roundToInt(), rect.top.roundToInt()) }
}

private const val MAX_SIDE_PX = 32_767

/** La dernière fenêtre écrite : deux évènements d'un même geste entre deux images se cumulent, sans attendre la recomposition. */
private class LatestCrop(var crop: NormalizedCrop?)

/**
 * Un rectangle de la scène : celui que le doigt tient ([held]), la cible elle-même pendant un geste ([animates] faux), sinon
 * la cible rejointe par une animation — un préréglage choisi, un angle lâché.
 */
@Composable
private fun rememberStageRect(target: CropRect, held: CropRect?, animates: Boolean): CropRect {
    val motion = remember { RectMotion(target) }
    LaunchedEffect(target, held, animates) {
        when {
            held != null -> motion.snapTo(held)
            !animates -> motion.snapTo(target)
            else -> motion.animateTo(target)
        }
    }
    return held ?: if (animates) motion.value else target
}

private class RectMotion(start: CropRect) {
    private val left = Animatable(start.left)
    private val top = Animatable(start.top)
    private val width = Animatable(start.width)
    private val height = Animatable(start.height)

    val value: CropRect get() = CropRect(left.value, top.value, width.value, height.value)

    suspend fun snapTo(rect: CropRect) {
        left.snapTo(rect.left)
        top.snapTo(rect.top)
        width.snapTo(rect.width)
        height.snapTo(rect.height)
    }

    suspend fun animateTo(rect: CropRect) = coroutineScope {
        val spec = tween<Float>(STAGE_MOTION_MILLIS)
        launch { left.animateTo(rect.left, spec) }
        launch { top.animateTo(rect.top, spec) }
        launch { width.animateTo(rect.width, spec) }
        launch { height.animateTo(rect.height, spec) }
    }
}

/** L'image entière posée sous le cadre du recadrage plein écran. */
public const val RETOUCH_CROP_IMAGE_TAG: String = "retouch.crop.image"

private const val STAGE_MOTION_MILLIS = 280

/** Les proportions par presets, sur une bande sous la scène : « Original », puis les rapports écrits en chiffres. */
@Composable
internal fun RetouchCropPresets(chosen: ComposerCropPreset?, enabled: Boolean, onChoose: (ComposerCropPreset) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ComposerCropPreset.entries.forEach { preset ->
            val label = preset.notation ?: stringResource(R.string.retouch_crop_original)
            val isChosen = preset == chosen
            Box(
                Modifier
                    .sizeIn(minWidth = 56.dp, minHeight = 48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(if (isChosen) Color.White else Color.White.copy(alpha = 0.14f))
                    .clickable(enabled = enabled, role = Role.Button) { onChoose(preset) }
                    .semantics {
                        selected = isChosen
                        role = Role.Button
                    }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, color = if (isChosen) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
