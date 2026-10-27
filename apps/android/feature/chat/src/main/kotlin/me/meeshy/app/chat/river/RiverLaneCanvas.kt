package me.meeshy.app.chat.river

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import me.meeshy.sdk.model.reading.river.RiverBubble
import me.meeshy.sdk.model.reading.river.RiverColumnLayout
import me.meeshy.sdk.model.reading.river.RiverGeometry
import me.meeshy.sdk.model.reading.river.RiverLaneSpan
import me.meeshy.sdk.model.reading.river.RiverLayout
import me.meeshy.sdk.model.reading.river.RiverMetrics
import me.meeshy.sdk.model.reading.river.RiverNodeKind
import me.meeshy.sdk.model.reading.river.RiverRankPlacement
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.hexColor

/** La couleur d'une voix : la loi de couleur du design system sur sa graine, jamais une teinte locale. */
internal fun riverLaneColor(seed: String): Color = hexColor(DynamicColorGenerator.colorForName(seed))

/**
 * Le tracé des branches et des connecteurs — un `Canvas` SEUL, posé DERRIÈRE la pile. Chaque bulle
 * opaque interrompt le trait d'elle-même ; son contour coloré, à la MÊME épaisseur, reprend la course
 * (« le bord de la bulle EST un segment de sa ligne »).
 *
 * **60 images par seconde** : rien ici ne se recompose au défilement. Le lambda de dessin lit
 * `layoutInfo` (les cotes que la pile publie déjà) et le défilement horizontal À LA PHASE DE DESSIN —
 * il invalide le dessin, jamais la composition. Aucune géométrie de couloir/rang n'est calculée : la
 * loi (`RiverGeometry`) dit QUI est où, la pile dit OÙ c'est à l'écran.
 *
 * Elle ne s'anime jamais d'elle-même (rien à réduire) et reste décorative : les traits ne portent
 * aucune information que le contenu, dans l'ordre chronologique, ne porte déjà.
 */
@Composable
internal fun RiverLaneCanvas(
    rendering: RiverRendering,
    listState: LazyListState,
    horizontal: ScrollState,
    laneWidthDp: Float,
    topExclusionDp: Float,
    modifier: Modifier = Modifier,
) {
    val geometry = rendering.geometry
    val density = LocalDensity.current
    val laneColors = remember(geometry) { geometry.lanes.associate { it.laneId to riverLaneColor(it.colorSeed) } }
    val columns = remember(geometry, laneWidthDp, density) {
        with(density) {
            RiverColumnLayout(laneWidthDp.dp.toPx().toDouble(), RiverMetrics.Lane.GUTTER.dp.toPx().toDouble(), geometry.laneCount.coerceAtLeast(1))
        }
    }
    val sizes = remember(density) {
        with(density) {
            RiverCanvasSizes(
                line = RiverMetrics.Line.WIDTH.dp.toPx(),
                connector = RiverMetrics.Connector.STROKE_WIDTH.dp.toPx(),
                rowGap = RiverMetrics.Row.GAP.dp.toPx(),
                margin = OUT_OF_FIELD_MARGIN.dp.toPx(),
                birthRadius = 2.6f.dp.toPx(),
                ringRadius = 6.5f.dp.toPx(),
                ringStroke = 2.dp.toPx(),
                dashOn = 4.dp.toPx(),
                dashOff = 3.dp.toPx(),
                ringDashOn = 3.dp.toPx(),
                ringDashOff = 2.5f.dp.toPx(),
                mapFrom = 2.dp.toPx(),
                mapTo = 4.dp.toPx(),
                stub = 9.dp.toPx(),
                topExclusion = topExclusionDp.dp.toPx(),
            )
        }
    }
    if (geometry.layout != RiverLayout.LANES) return
    Canvas(modifier.clearAndSetSemantics {}) {
        val scroll = horizontal.value.toFloat()
        val known = knownFrames(rendering, listState, columns, sizes, scroll)
        val extent = RankExtent(known, size.height, sizes.margin)
        clipRect(top = sizes.topExclusion) {
            drawConnectors(geometry, rendering.bubbleByRank, extent, columns, scroll, laneColors, sizes)
            drawLanes(geometry, extent, columns, scroll, laneColors, sizes)
        }
    }
}

private class RiverCanvasSizes(
    val line: Float, val connector: Float, val rowGap: Float, val margin: Float, val birthRadius: Float,
    val ringRadius: Float, val ringStroke: Float, val dashOn: Float, val dashOff: Float,
    val ringDashOn: Float, val ringDashOff: Float, val mapFrom: Float, val mapTo: Float, val stub: Float,
    val topExclusion: Float,
)

private fun knownFrames(
    rendering: RiverRendering,
    listState: LazyListState,
    columns: RiverColumnLayout,
    sizes: RiverCanvasSizes,
    scroll: Float,
): Map<Int, Rect> {
    val items = listState.layoutInfo.visibleItemsInfo
    val frames = HashMap<Int, Rect>(items.size * 2)
    for (item in items) {
        val rank = RiverFraming.rankOfKey(item.key) ?: continue
        val bubble = rendering.bubbleByRank[rank] ?: continue
        if (bubble.isSystem) continue
        val joins = rendering.contentByMessageId[bubble.messageId]?.groupPosition?.joinsAbove == true
        frames[rank] = RiverFraming.bubbleFrame(
            row = RiverRowExtent(rank, item.offset.toFloat(), item.size.toFloat()),
            laneIndex = bubble.laneIndex,
            laneWidthPx = columns.laneWidth.toFloat(),
            gutterPx = columns.gutter.toFloat(),
            seamPx = if (joins) 0f else sizes.rowGap,
            horizontalScrollPx = scroll,
        )
    }
    return frames
}

/**
 * Les cotes verticales d'un rang, connu ou hors champ : un rang au-dessus du champ est posé juste
 * au-dessus du volet, un rang au-dessous juste en dessous — assez loin pour qu'un trait qui y mène
 * sorte franchement du champ. Le placement est la loi du noyau (`RiverRankPlacement`).
 */
private class RankExtent(private val known: Map<Int, Rect>, private val height: Float, private val margin: Float) {
    fun rect(rank: Int): Rect? = when (val placement = RiverRankPlacement.resolve(rank, known)) {
        is RiverRankPlacement.Known -> placement.frame
        RiverRankPlacement.Above -> Rect(0f, -margin, 0f, -margin)
        RiverRankPlacement.Below -> Rect(0f, height + margin, 0f, height + margin)
        RiverRankPlacement.Unknown -> null
    }

    fun isOnScreen(rank: Int): Boolean = known.containsKey(rank)

    private val firstKnown: Int = known.keys.minOrNull() ?: Int.MAX_VALUE
    private val lastKnown: Int = known.keys.maxOrNull() ?: Int.MIN_VALUE

    /** Un intervalle de rangs qui ne touche pas le champ n'a ni nœud à l'écran ni trait qui le traverse. */
    fun misses(startRank: Int, endRank: Int): Boolean = endRank < firstKnown || startRank > lastKnown

    fun placement(rank: Int): RiverRankPlacement<Rect> = RiverRankPlacement.resolve(rank, known)
}

private fun railX(columns: RiverColumnLayout, laneIndex: Int, scroll: Float): Float = columns.railX(laneIndex).toFloat() - scroll

private fun DrawScope.drawConnectors(
    geometry: RiverGeometry,
    bubbleByRank: Map<Int, RiverBubble>,
    extent: RankExtent,
    columns: RiverColumnLayout,
    scroll: Float,
    laneColors: Map<String, Color>,
    sizes: RiverCanvasSizes,
) {
    val dash = PathEffect.dashPathEffect(floatArrayOf(sizes.dashOn, sizes.dashOff))
    for (connector in geometry.connectors) {
        if (!extent.isOnScreen(connector.fromRank) && !extent.isOnScreen(connector.toRank)) continue
        val from = extent.rect(connector.fromRank) ?: continue
        val to = extent.rect(connector.toRank) ?: continue
        val toBubble: RiverBubble = bubbleByRank[connector.toRank] ?: continue
        val fx = railX(columns, connector.fromLaneIndex, scroll)
        val tx = railX(columns, connector.toLaneIndex, scroll)
        val fy = (from.top + from.bottom) / 2f
        val ty = (to.top + to.bottom) / 2f
        val side = if (tx >= fx) 1f else -1f
        val bow = RiverMetrics.Connector.bow(((tx - fx) / density).toDouble()).toFloat() * density
        val path = Path().apply {
            moveTo(fx, fy)
            cubicTo(fx + side * bow, fy, tx - side * bow, ty, tx, ty)
        }
        val far = abs(connector.toRank - connector.fromRank) > 4
        val color = laneColors[toBubble.laneId] ?: continue
        drawPath(path, color.copy(alpha = if (far) 0.3f else 0.5f), style = Stroke(sizes.connector, pathEffect = dash))
    }
}

private fun DrawScope.drawLanes(
    geometry: RiverGeometry,
    extent: RankExtent,
    columns: RiverColumnLayout,
    scroll: Float,
    laneColors: Map<String, Color>,
    sizes: RiverCanvasSizes,
) {
    for (lane in geometry.lanes) {
        val color = laneColors[lane.laneId] ?: continue
        val cx = railX(columns, lane.laneIndex, scroll)
        for (span in lane.spans) drawSpan(span, color, cx, extent, sizes)
    }
}

/**
 * Un segment : un trait plein jusqu'à la dernière bulle VIVANTE, puis — si le segment court au-delà
 * (« un segment survit à ses propres bulles ») — une queue en dégradé qui s'éteint (`isOpen == false`)
 * ou reste franche (`isOpen == true`, on ne sait pas encore). La naissance est une amorce pleine ;
 * un nœud `ADDRESSED` (branche reparue pour recevoir une réponse) est un anneau creux en pointillé.
 */
private fun DrawScope.drawSpan(span: RiverLaneSpan, color: Color, cx: Float, extent: RankExtent, sizes: RiverCanvasSizes) {
    if (extent.misses(span.startRank, span.endRank)) return
    val crosses = extent.placement(span.startRank) == RiverRankPlacement.Above &&
        extent.placement(span.endRank) == RiverRankPlacement.Below
    if (span.nodes.none { extent.isOnScreen(it.rank) } && !crosses) return
    val topFrame = extent.rect(span.startRank) ?: return
    val endFrame = extent.rect(span.endRank) ?: return
    val top = if (extent.isOnScreen(span.startRank)) topFrame.top + sizes.mapFrom else topFrame.top
    val end = if (extent.isOnScreen(span.endRank)) endFrame.bottom - sizes.mapTo else endFrame.bottom

    val lastBubbleRank = span.nodes.filter { it.kind == RiverNodeKind.BUBBLE }.maxOfOrNull { it.rank }
    val liveTo = lastBubbleRank?.let { extent.rect(it)?.bottom }
        ?: span.nodes.lastOrNull()?.let { node -> extent.rect(node.rank)?.let { (it.top + it.bottom) / 2f + sizes.stub } }
        ?: return

    if (liveTo > top) {
        drawLine(color.copy(alpha = 0.85f), Offset(cx, top), Offset(cx, liveTo), strokeWidth = sizes.line, cap = StrokeCap.Round)
    }
    if (end > liveTo) {
        val tail = Brush.verticalGradient(
            colors = listOf(color.copy(alpha = 0.85f), color.copy(alpha = if (span.isOpen) 0.6f else 0f)),
            startY = liveTo,
            endY = end,
        )
        drawLine(tail, Offset(cx, liveTo), Offset(cx, end), strokeWidth = sizes.line)
    }
    if (extent.isOnScreen(span.startRank)) {
        drawCircle(color, sizes.birthRadius, Offset(cx, top))
    }
    val ring = Stroke(sizes.ringStroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(sizes.ringDashOn, sizes.ringDashOff)))
    for (node in span.nodes) {
        if (node.kind != RiverNodeKind.ADDRESSED || !extent.isOnScreen(node.rank)) continue
        val frame = extent.rect(node.rank) ?: continue
        drawCircle(color, sizes.ringRadius, Offset(cx, (frame.top + frame.bottom) / 2f), style = ring)
    }
}

private const val OUT_OF_FIELD_MARGIN = 48f
