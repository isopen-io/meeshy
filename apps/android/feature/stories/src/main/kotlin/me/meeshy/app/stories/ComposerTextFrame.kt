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
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
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
    if (!frame.hasBox(background) || pxPerDesign <= 0f) {
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
    val ringPx = if (ring != null) frame.borderWidth * pxPerDesign else 0f
    val shape = frame.shape
    Layout(
        content = { Box { content() } },
        modifier = modifier.drawWithCache {
            val k = pxPerDesign
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
        },
    ) { measurables, constraints ->
        val k = pxPerDesign
        val measureCap = (StoryTextFrameGeometry.maxTextWidthFraction(shape, framed = true) * StoryTextMetrics.DESIGN_CANVAS_WIDTH * k).roundToInt()
        val widest = if (constraints.hasBoundedWidth) minOf(constraints.maxWidth, measureCap) else measureCap
        val placeable = measurables.first().measure(Constraints(maxWidth = widest.coerceAtLeast(0)))
        val m = StoryTextFrameGeometry.metrics(
            shape = shape,
            isFramed = true,
            textWidth = placeable.width / k.toDouble(),
            textHeight = placeable.height / k.toDouble(),
            oGlyphWidth = oGlyphPx / k.toDouble(),
            paddingScale = frame.resolvedPaddingScale.toDouble(),
        )
        layout((m.boundsWidth * k).roundToInt(), (m.boundsHeight * k).roundToInt()) {
            placeable.place((m.glyphX * k).roundToInt(), (m.glyphY * k).roundToInt())
        }
    }
}

private fun TextMeasurer.oGlyphWidthPx(style: TextStyle): Float = measure("o", style).size.width.toFloat()

private const val REST_PADDING_H = 6f
private const val REST_PADDING_V = 2f
private const val GLASS_ALPHA = 0.18f
