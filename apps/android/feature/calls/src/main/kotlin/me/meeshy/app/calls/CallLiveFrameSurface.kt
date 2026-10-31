package me.meeshy.app.calls

import android.graphics.ColorMatrix
import android.os.Build
import android.os.PowerManager
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.frames.CallFrameLivePainter
import me.meeshy.sdk.call.frames.CallFrameLiveScene
import me.meeshy.sdk.call.frames.CallFrameStage
import me.meeshy.sdk.model.call.frames.CallFrameChromeReserve
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFramePathOp
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameShapeGeometry
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallFrameToneBlend
import me.meeshy.sdk.model.call.frames.CallFrameToneRecipe
import me.meeshy.sdk.model.call.frames.CallLiveFrameGeometry
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.frames.CallLiveFrameSlotPlacement
import org.webrtc.EglBase

private val HEADER_RESERVE = 72.dp
private val PILL_RESERVE = 200.dp

/** Une scène peinte et la toile qui l'a produite : les cases des vidéos se lisent sur la MÊME toile que les couches. */
private class CallLiveFramePainted(val stage: CallFrameStage, val scene: CallFrameLiveScene)

/**
 * **LE CADRE EN DIRECT, À L'ÉCRAN** (#13687, miroir de iOS `CallLiveFrameSurface`) — une surface vivante posée sur
 * la scène vidéo du duo : le FOND du cadre (avec le visage de repli de chaque case), la VIDÉO de chacun dans le
 * visage de sa case (forme, rotation et ton de la case), le DESSUS (traits, bordure, ornements de premier plan),
 * puis les ornements ANIMÉS. Les couches se peignent hors du fil principal, une fois par cadre, personnes, textes,
 * taille ou mouvement — jamais à une image vidéo. Elle ne prend aucun toucher.
 */
@Composable
internal fun CallLiveFrameSurface(
    design: CallFrameDesign,
    people: List<CallFramePerson>,
    texts: CallFrameTexts,
    sources: Map<String, CallLiveFrameVideoSource>,
    eglContext: EglBase.Context?,
    playsMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    BoxWithConstraints(modifier) {
        val widthPx = with(density) { maxWidth.roundToPx() }
        val heightPx = with(density) { maxHeight.roundToPx() }
        val (paintW, paintH) = CallLiveFrameRule.paintSize(widthPx, heightPx)
        val reserve = with(density) {
            CallFrameChromeReserve.covering(HEADER_RESERVE.toPx().toDouble(), PILL_RESERVE.toPx().toDouble(), heightPx.toDouble())
        }
        val painted by produceState<CallLiveFramePainted?>(null, design, people, texts, paintW, paintH, reserve, playsMotion) {
            if (paintW < 1 || paintH < 1) return@produceState
            value = withContext(Dispatchers.Default) {
                val stage = CallFrameStage(design, people, texts, paintW, paintH, reserve)
                CallFrameLivePainter.paint(stage, animates = playsMotion)?.let { CallLiveFramePainted(stage, it) }
            }
        }
        val current = painted ?: return@BoxWithConstraints
        val backdrop = remember(current) { current.scene.backdrop.asImageBitmap() }
        val overlay = remember(current) { current.scene.overlay.asImageBitmap() }
        val placements = remember(current, widthPx, heightPx) {
            val fit = CallLiveFrameGeometry.fit(current.stage.width.toDouble(), current.stage.height.toDouble(), widthPx.toDouble(), heightPx.toDouble())
            CallLiveFrameGeometry.placements(current.stage.boxes, current.stage.look.slot.card, fit)
        }
        val description = stringResource(R.string.call_live_frame_surface, design.displayName(LocalConfiguration.current.locales[0]?.language))
        Box(Modifier.fillMaxSize().semantics { contentDescription = description }) {
            Image(backdrop, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            if (eglContext != null) {
                placements.forEach { placement ->
                    val person = current.stage.people.getOrNull(placement.personIndex) ?: return@forEach
                    val source = sources[person.id] ?: return@forEach
                    CallLiveFrameSlotVideo(placement, current.stage, source, eglContext)
                }
            }
            Image(overlay, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            current.scene.motion?.let { CallFrameMotionLayer(it, Modifier.fillMaxSize()) }
        }
    }
}

/** La vidéo d'une personne, posée dans le visage de sa case : même rectangle, même rotation, même forme, même ton. */
@Composable
private fun CallLiveFrameSlotVideo(
    placement: CallLiveFrameSlotPlacement,
    stage: CallFrameStage,
    source: CallLiveFrameVideoSource,
    eglContext: EglBase.Context,
) {
    val density = LocalDensity.current
    val box = stage.boxes.firstOrNull { it.index == placement.personIndex } ?: return
    val slot = stage.look.slot
    val shape = remember(box, slot) {
        val photo = CallFrameRenderKit.photoRect(box.rect, slot.card)
        CallLiveFrameSlotShape(CallFrameShapeGeometry.slotPath(box, photo, slot), photo)
    }
    val recipe = remember(slot) { CallFrameToneRecipe.of(slot.tone, slot.duotone) }
    val photo = placement.photo
    Box(
        Modifier
            .offset { IntOffset(photo.x.roundToInt(), photo.y.roundToInt()) }
            .size(with(density) { photo.width.toFloat().toDp() }, with(density) { photo.height.toFloat().toDp() })
            .graphicsLayer {
                rotationZ = placement.rotation.toFloat()
                transformOrigin = TransformOrigin(placement.pivotX.toFloat(), placement.pivotY.toFloat())
                this.shape = shape
                clip = true
            }
            .toned(recipe),
    ) {
        CallLiveFrameVideo(source, eglContext, Modifier.fillMaxSize())
    }
}

/**
 * Le ton de la case sur la vidéo (§ 4.2 de la spec des cadres) : la saturation par un filtre de couleur sur une
 * couche, puis les couches de fusion du peintre — le même ton que le portrait peint, sur la carte graphique.
 */
private fun Modifier.toned(recipe: CallFrameToneRecipe): Modifier {
    if (recipe.isIdentity) return this
    val filter = if (recipe.saturation == 1.0) {
        null
    } else {
        ColorFilter.colorMatrix(androidx.compose.ui.graphics.ColorMatrix(ColorMatrix().apply { setSaturation(recipe.saturation.toFloat()) }.array))
    }
    val paint = Paint().apply { colorFilter = filter }
    val layers = recipe.layers.map { layer ->
        Color(layer.color.red.toFloat(), layer.color.green.toFloat(), layer.color.blue.toFloat(), layer.color.alpha.toFloat()) to blend(layer.blend)
    }
    return drawWithContent {
        if (filter == null) {
            drawContent()
        } else {
            drawIntoCanvas { it.saveLayer(Rect(0f, 0f, size.width, size.height), paint) }
            drawContent()
            drawIntoCanvas { it.restore() }
        }
        layers.forEach { (color, mode) -> drawRect(color, blendMode = mode) }
    }
}

private fun blend(mode: CallFrameToneBlend): BlendMode = when (mode) {
    CallFrameToneBlend.NORMAL -> BlendMode.SrcOver
    CallFrameToneBlend.COLOR -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) BlendMode.Color else BlendMode.SrcOver
    CallFrameToneBlend.SOFT_LIGHT -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) BlendMode.Softlight else BlendMode.Overlay
    CallFrameToneBlend.MULTIPLY -> BlendMode.Multiply
    CallFrameToneBlend.SCREEN -> BlendMode.Screen
    CallFrameToneBlend.LIGHTEN -> BlendMode.Lighten
}

/** La forme d'une case, tracée par la géométrie partagée puis portée du rectangle du visage à la taille de la vue. */
internal class CallLiveFrameSlotShape(private val ops: List<CallFramePathOp>, private val photo: CallFrameRect) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        if (photo.width <= 0 || photo.height <= 0) return Outline.Rectangle(Rect(0f, 0f, size.width, size.height))
        val sx = size.width / photo.width
        val sy = size.height / photo.height
        fun x(value: Double) = ((value - photo.x) * sx).toFloat()
        fun y(value: Double) = ((value - photo.y) * sy).toFloat()
        fun rect(value: CallFrameRect) = Rect(x(value.minX), y(value.minY), x(value.maxX), y(value.maxY))
        val path = Path()
        ops.forEach { op ->
            when (op) {
                is CallFramePathOp.MoveTo -> path.moveTo(x(op.x), y(op.y))
                is CallFramePathOp.LineTo -> path.lineTo(x(op.x), y(op.y))
                is CallFramePathOp.QuadTo -> path.quadraticBezierTo(x(op.cx), y(op.cy), x(op.x), y(op.y))
                is CallFramePathOp.CubicTo -> path.cubicTo(x(op.c1x), y(op.c1y), x(op.c2x), y(op.c2y), x(op.x), y(op.y))
                is CallFramePathOp.Arc -> path.arcToRad(
                    Rect(x(op.cx - op.radius), y(op.cy - op.radius), x(op.cx + op.radius), y(op.cy + op.radius)),
                    op.start.toFloat(), op.sweep.toFloat(), forceMoveTo = false,
                )
                is CallFramePathOp.AddRect -> path.addRect(rect(op.rect))
                is CallFramePathOp.AddRoundRect -> path.addRoundRect(
                    androidx.compose.ui.geometry.RoundRect(rect(op.rect), androidx.compose.ui.geometry.CornerRadius((op.radius * sx).toFloat(), (op.radius * sy).toFloat())),
                )
                is CallFramePathOp.AddOval -> path.addOval(rect(op.rect))
                CallFramePathOp.Close -> path.close()
            }
        }
        return Outline.Generic(path)
    }
}

/** L'appareil se protège-t-il ? Économie d'énergie, ou chaleur sévère : le cadre se met en pause (iOS `isDeviceConstrained`). */
@Composable
internal fun rememberCallDeviceConstrained(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        val power = context.getSystemService(PowerManager::class.java) ?: return@remember false
        val hot = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && power.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE
        power.isPowerSaveMode || hot
    }
}
