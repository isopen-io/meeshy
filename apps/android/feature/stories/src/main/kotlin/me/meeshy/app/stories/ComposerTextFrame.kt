package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.MeasurePolicy
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.constrainHeight
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry.Primitive
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import me.meeshy.ui.theme.hexColor

/** Le tracé de la forme, en pixels : chaque sous-tracé est ajouté tel quel (remplissage `nonzero`, comme iOS). */
internal fun List<Primitive>.toPath(pxPerDesign: Float): Path {
    val k = pxPerDesign.toDouble()
    val path = Path()
    forEach { primitive ->
        when (primitive) {
            is Primitive.RoundRect -> path.addRoundRect(
                RoundRect(
                    Rect((primitive.left * k).toFloat(), (primitive.top * k).toFloat(), ((primitive.left + primitive.width) * k).toFloat(), ((primitive.top + primitive.height) * k).toFloat()),
                    CornerRadius((primitive.radius * k).toFloat()),
                ),
            )
            is Primitive.Oval -> path.addOval(
                Rect((primitive.left * k).toFloat(), (primitive.top * k).toFloat(), ((primitive.left + primitive.width) * k).toFloat(), ((primitive.top + primitive.height) * k).toFloat()),
            )
            is Primitive.Polygon -> primitive.points.forEachIndexed { index, (x, y) ->
                if (index == 0) path.moveTo((x * k).toFloat(), (y * k).toFloat()) else path.lineTo((x * k).toFloat(), (y * k).toFloat())
                if (index == primitive.points.lastIndex) path.close()
            }
        }
    }
    return path
}

/**
 * La boîte du texte (iOS `StoryTextLayer`) : forme, fond, liseré et marge, mesurés en design-pixels par l'UNIQUE
 * [StoryTextFrameGeometry] que la scène du composeur et le lecteur partagent. [pxPerDesign] est la taille d'un
 * design-pixel à l'écran (le composeur : largeur / 1080, l'échelle de l'objet étant posée par sa couche ; le lecteur :
 * la même fois l'échelle de l'objet). [glyphStyle] sert à mesurer le « o » dont la chasse fixe la marge horizontale.
 * Sans boîte ([StoryTextFrame.hasBox]), la marge de repos garde la zone de toucher.
 */
@Composable
internal fun FramedTextBox(
    background: StoryTextBackground,
    frame: StoryTextFrame,
    pxPerDesign: Float,
    glyphStyle: TextStyle,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    if (!frame.hasBox(background) || !pxPerDesign.isFinite() || pxPerDesign <= 0f) {
        Box(modifier.padding(horizontal = REST_PADDING_H.dp, vertical = REST_PADDING_V.dp)) { content() }
        return
    }
    val measurer = rememberTextMeasurer()
    val oGlyphPx = remember(glyphStyle, measurer) { measurer.oGlyphWidthPx(glyphStyle) }
    val fill = when (background) {
        StoryTextBackground.None -> null
        is StoryTextBackground.Solid -> hexColor(background.hex, Color.Transparent)
        is StoryTextBackground.Glass -> Color.White.copy(alpha = GLASS_ALPHA)
    }
    val ring = if (frame.borderIsVisible) hexColor(frame.borderColor.orEmpty(), Color.White) else null
    val ringPx = if (ring != null) frame.borderWidth.coerceIn(0f, StoryTextFrame.MAX_BORDER) * pxPerDesign else 0f
    val shape = frame.shape
    val paddingScale = frame.resolvedPaddingScale.toDouble()
    // La lecture recompose à chaque image : le tracé et la mesure ne se refont que si le cadre change.
    val painted = remember(shape, pxPerDesign, fill, ring, ringPx) { Modifier.framePainting(shape, pxPerDesign, fill, ring, ringPx) }
    val policy = remember(shape, pxPerDesign, oGlyphPx, paddingScale) { framedMeasurePolicy(shape, pxPerDesign, oGlyphPx, paddingScale) }
    Layout(content = { Box { content() } }, modifier = modifier.then(painted), measurePolicy = policy)
}

private fun Modifier.framePainting(shape: StoryTextFrameShape, k: Float, fill: Color?, ring: Color?, ringPx: Float): Modifier =
    drawWithCache {
        val customPath = shape == StoryTextFrameShape.DIAMOND || shape == StoryTextFrameShape.CLOUD || shape == StoryTextFrameShape.SPEECH
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
 * Le texte se mesure dans la place que la boîte lui laisse — jamais plus large que 88 % (44 % pour le losange) de la
 * scène, jamais au point que la boîte déborde des contraintes reçues ; la boîte se pose ensuite à sa taille, bornée aux
 * mêmes contraintes. Une donnée publiée absurde ne peut donc ni lever ni sortir de l'écran.
 */
private fun framedMeasurePolicy(shape: StoryTextFrameShape, k: Float, oGlyphPx: Float, paddingScale: Double) =
    MeasurePolicy { measurables, constraints ->
        val kd = k.toDouble()
        val oDesign = oGlyphPx / kd
        val canvasCap = StoryTextFrameGeometry.maxTextWidthFraction(shape, framed = true) * StoryTextMetrics.DESIGN_CANVAS_WIDTH
        val roomCap = if (constraints.hasBoundedWidth) {
            StoryTextFrameGeometry.maxTextWidth(shape, constraints.maxWidth / kd, oDesign, paddingScale)
        } else {
            canvasCap
        }
        val textCapPx = (minOf(canvasCap, roomCap) * kd).toSafePx()
        val placeable = measurables.first().measure(Constraints(maxWidth = textCapPx))
        val m = StoryTextFrameGeometry.metrics(
            shape = shape,
            isFramed = true,
            textWidth = placeable.width / kd,
            textHeight = placeable.height / kd,
            oGlyphWidth = oDesign,
            paddingScale = paddingScale,
        )
        val width = constraints.constrainWidth((m.boundsWidth * kd).toSafePx())
        val height = constraints.constrainHeight((m.boundsHeight * kd).toSafePx())
        layout(width, height) {
            placeable.place((m.glyphX * kd).toSafePx(), (m.glyphY * kd).toSafePx())
        }
    }

/** Un nombre de pixels posable : fini, positif, et sous le plafond de taille d'un nœud de mise en page. */
private fun Double.toSafePx(): Int = if (isFinite()) coerceIn(0.0, MAX_LAYOUT_PX.toDouble()).roundToInt() else 0

private fun TextMeasurer.oGlyphWidthPx(style: TextStyle): Float = measure("o", style).size.width.toFloat()

private const val REST_PADDING_H = 6f
private const val REST_PADDING_V = 2f
private const val GLASS_ALPHA = 0.18f
private const val MAX_LAYOUT_PX = 1 shl 15
