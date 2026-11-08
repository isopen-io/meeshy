package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.MeasurePolicy
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.constrainHeight
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.scene.CanvasGeometry
import me.meeshy.sdk.model.scene.SceneTextFrameGeometry
import me.meeshy.sdk.model.scene.SceneTextWrapPolicy
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry.Primitive
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import me.meeshy.ui.theme.hexColor

/**
 * La boîte du texte (iOS `StoryTextLayer`) : forme, fond, liseré et marge, mesurés en design-pixels par l'UNIQUE
 * [StoryTextFrameGeometry] que la scène du composeur et le lecteur partagent. [pxPerDesign] est la taille d'un
 * design-pixel à l'écran (le composeur : largeur / 1080, l'échelle de l'objet étant posée par sa couche ; le lecteur :
 * la même fois l'échelle de l'objet). [glyphStyle] sert à mesurer le « o » dont la chasse fixe la marge horizontale.
 * Sans boîte ([StoryTextFrame.hasBox]), la marge de repos garde la zone de toucher. [inkText] (avec [inkStyle], la
 * police réellement peinte) réserve dans la boîte l'encre qui déborde l'avance des glyphes ; un fond en verre floute par
 * l'hôte de [LocalSceneGlassHost] quand il existe, et se voile sinon.
 */
@Composable
public fun SceneTextFrameBox(
    background: StoryTextBackground,
    frame: StoryTextFrame,
    pxPerDesign: Float,
    glyphStyle: TextStyle,
    modifier: Modifier = Modifier,
    inkText: String? = null,
    inkStyle: TextStyle = glyphStyle,
    content: @Composable () -> Unit,
) {
    if (!frame.hasBox(background) || !pxPerDesign.isFinite() || pxPerDesign <= 0f) {
        val capPx = if (pxPerDesign.isFinite() && pxPerDesign > 0f) {
            (StoryTextFrameGeometry.maxTextWidthFraction(frame.shape, framed = false) * CanvasGeometry.DESIGN_WIDTH.toFloat() * pxPerDesign).toSafePx()
        } else {
            MAX_LAYOUT_PX
        }
        val capDp = with(LocalDensity.current) { capPx.toDp() }
        Box(modifier.padding(horizontal = REST_PADDING_H.dp, vertical = REST_PADDING_V.dp).widthIn(max = capDp)) { content() }
        return
    }
    val measurer = rememberTextMeasurer()
    val oGlyphPx = remember(glyphStyle, measurer) { measurer.oGlyphWidthPx(glyphStyle) }
    val fill = when (background) {
        StoryTextBackground.None -> null
        is StoryTextBackground.Solid -> hexColor(background.hex, Color.Transparent)
        is StoryTextBackground.Glass -> Color.White.copy(alpha = glassVeilAlpha(LocalSceneGlassHost.current != null))
    }
    val glassSigmaPx = (background as? StoryTextBackground.Glass)?.let { (it.radius * pxPerDesign).toFloat() }
    val glassHost = LocalSceneGlassHost.current
    val typeface = rememberTextTypeface(inkStyle)
    val density = LocalDensity.current
    val ring = if (frame.borderIsVisible) hexColor(frame.borderColor.orEmpty(), Color.White) else null
    val ringPx = if (ring != null) frame.borderWidth.coerceIn(0f, StoryTextFrame.MAX_BORDER) * pxPerDesign else 0f
    val shape = frame.shape
    val paddingScale = frame.resolvedPaddingScale.toDouble()
    // La lecture recompose à chaque image : le tracé et la mesure ne se refont que si le cadre change.
    val painted = remember(shape, pxPerDesign, fill, ring, ringPx) { Modifier.framePainting(shape, pxPerDesign, fill, ring, ringPx) }
    val blurred = if (glassHost != null && glassSigmaPx != null && glassSigmaPx > 0f) {
        remember(shape, pxPerDesign, glassHost, glassSigmaPx) {
            Modifier.clip(FrameShape(shape, pxPerDesign)).then(glassHost.backdrop(glassSigmaPx))
        }
    } else {
        Modifier
    }
    val inkPx = if (inkText != null) {
        remember(inkText, inkStyle, typeface, shape, pxPerDesign) {
            val wrapPx = SceneTextWrapPolicy.measureWidthPx(shape, true, pxPerDesign.toDouble(), null, oGlyphPx.toDouble(), paddingScale)
            inkOverhangPx(measurer, inkText, inkStyle, typeface, with(density) { inkStyle.fontSize.toPx() }, wrapPx.toInt())
        }
    } else {
        0f
    }
    val policy = remember(shape, pxPerDesign, oGlyphPx, paddingScale, inkPx) { framedMeasurePolicy(shape, pxPerDesign, oGlyphPx, paddingScale, inkPx) }
    Layout(content = { Box { content() } }, modifier = modifier.then(blurred).then(painted), measurePolicy = policy)
}

private fun Modifier.framePainting(shape: StoryTextFrameShape, k: Float, fill: Color?, ring: Color?, ringPx: Float): Modifier =
    drawWithCache {
        val customPath = shape.usesCustomPath
        val primitives = StoryTextFrameGeometry.primitives(shape, size.width / k.toDouble(), size.height / k.toDouble())
        val path = primitives.toPath(k)
        val inset = ringPx / 2f
        val cornerRing = if (!customPath && ring != null) {
            val box = primitives.first() as Primitive.RoundRect
            Path().apply {
                addRoundRect(
                    RoundRect(
                        Rect(inset, inset, size.width - inset, size.height - inset),
                        CornerRadius((box.radius * k - inset).coerceAtLeast(0.0).toFloat()),
                    ),
                )
            }
        } else {
            null
        }
        onDrawBehind {
            fill?.let { drawPath(path, it) }
            if (ring != null) drawPath(cornerRing ?: path, ring, style = Stroke(width = ringPx))
        }
    }

/**
 * Le texte se mesure dans la place que la boîte lui laisse (politique [SceneTextWrapPolicy] : 88 % de la scène, 44 % pour
 * le losange, jamais au point que la boîte déborde des contraintes reçues) ; la boîte se pose ensuite à sa taille, encre
 * réservée ([SceneTextFrameGeometry]), bornée aux mêmes contraintes. Une donnée publiée absurde ne peut donc ni lever ni
 * sortir de l'écran.
 */
private fun framedMeasurePolicy(shape: StoryTextFrameShape, k: Float, oGlyphPx: Float, paddingScale: Double, inkPx: Float) =
    MeasurePolicy { measurables, constraints ->
        val kd = k.toDouble()
        val room = if (constraints.hasBoundedWidth) (constraints.maxWidth - 2 * inkPx).toDouble() else null
        val textCapPx = SceneTextWrapPolicy.measureWidthPx(shape, true, kd, room, oGlyphPx.toDouble(), paddingScale).toSafePx()
        val placeable = measurables.first().measure(Constraints(maxWidth = textCapPx))
        val placement = SceneTextFrameGeometry.place(
            shape = shape,
            isFramed = true,
            textWidth = placeable.width / kd,
            textHeight = placeable.height / kd,
            oGlyphWidth = oGlyphPx / kd,
            paddingScale = paddingScale,
            inkPad = inkPx / kd,
        )
        val width = constraints.constrainWidth((placement.metrics.boundsWidth * kd).toSafePx())
        val height = constraints.constrainHeight((placement.metrics.boundsHeight * kd).toSafePx())
        layout(width, height) {
            placeable.place(((placement.textX) * kd).toSafePx(), (placement.textY * kd).toSafePx())
        }
    }

/** Un nombre de pixels posable : fini, positif, et sous le plafond de taille d'un nœud de mise en page. */
private fun Double.toSafePx(): Int = if (isFinite()) coerceIn(0.0, MAX_LAYOUT_PX.toDouble()).roundToInt() else 0

private fun TextMeasurer.oGlyphWidthPx(style: TextStyle): Float = measure("o", style).size.width.toFloat()

private const val REST_PADDING_H = 6f
private const val REST_PADDING_V = 2f
private const val MAX_LAYOUT_PX = 1 shl 15
