package me.meeshy.ui.component.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val ENTRY_MILLIS = 500
private const val DONUT_THICKNESS_DP = 16f
private const val BASELINE_DP = 1f
private const val DIM_ALPHA = 0.45f
private val DONUT_RAMP = listOf(1f, 0.78f, 0.58f, 0.42f, 0.3f)

/** Un point de la série : son nom (légende), sa valeur brute, et la phrase que dit la voix s'il faut mieux qu'un nombre. */
public data class MeeshyChartPoint(val label: String, val value: Double, val spoken: String? = null)

/**
 * **Le graphique** (K50) : une teinte, un pic, deux bornes — pas un tableau de bord. Le genre ([kind]) se choisit par la
 * question posée (barres, courbe, anneau, entonnoir, ventilation, bande, bulles) et ne change pas à chaud. Le composant montre
 * une série, il ne la calcule pas : l'hôte charge, agrège et formate, et écrit [summary], la phrase que dit la voix — ce que
 * l'œil ne lit pas, la voix le dit. Le graphique est UN élément ; ses dessins se taisent. Sans point, rien n'est dessiné
 * (c'est le bloc d'état de l'hôte). L'entrée se joue une fois, jamais en mouvement réduit. Jumeau iOS : `MeeshyChart`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyChart(
    kind: MeeshyChartKind,
    points: List<MeeshyChartPoint>,
    summary: String,
    modifier: Modifier = Modifier,
    size: MeeshyChartSize = MeeshyChartSize.Regular,
    layout: MeeshyChartLayout = MeeshyChartLayout.Stacked,
    tint: Color = MeeshyPalette.Indigo500,
    startCaption: String? = null,
    endCaption: String? = null,
    othersLabel: String = "…",
    valueText: (Double) -> String = { it.toLong().toString() },
) {
    val values = MeeshyChartRecipe.resolve(kind, size, points.size, layout)
    if (values.isEmpty) return
    val reduce = LocalReduceMotion.current
    val tokens = MeeshyTheme.tokens
    val progress = remember { Animatable(if (reduce) 1f else 0f) }
    LaunchedEffect(points, reduce) {
        if (reduce) progress.snapTo(1f) else progress.animateTo(1f, tween(ENTRY_MILLIS, easing = LinearOutSlowInEasing))
    }
    Column(modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = summary }) {
        Box(Modifier.fillMaxWidth().decorative()) {
            when (kind) {
                MeeshyChartKind.Bars -> BarsChart(points, values, tint, { progress.value }, tokens.hairline)
                MeeshyChartKind.Line -> LineChart(points, values, tint) { progress.value }
                MeeshyChartKind.Donut -> DonutChart(points, values, tint, othersLabel, tokens.controlFill, { progress.value }, valueText)
                MeeshyChartKind.Funnel -> FunnelChart(points, values, tint, valueText)
                MeeshyChartKind.Breakdown -> BreakdownChart(points, values, tint, valueText)
                MeeshyChartKind.Strip -> StripChart(points, values, tint)
                MeeshyChartKind.Bubbles -> BubbleChart(points, tint)
            }
        }
        if (values.hasAxis && (startCaption != null || endCaption != null)) {
            Row(Modifier.fillMaxWidth().padding(top = 6.dp).decorative(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(startCaption.orEmpty(), color = tokens.textSecondary, fontSize = 12.sp)
                Text(endCaption.orEmpty(), color = tokens.textSecondary, fontSize = 12.sp)
            }
        }
    }
}

private fun DrawScope.baseline(color: Color) {
    drawLine(color, Offset(0f, size.height), Offset(size.width, size.height), BASELINE_DP.dp.toPx())
}

@Composable
private fun BarsChart(points: List<MeeshyChartPoint>, values: MeeshyChartValues, tint: Color, progress: () -> Float, line: Color) {
    val fractions = MeeshyChartScale.normalized(points.map { it.value })
    val peak = MeeshyChartScale.peak(points.map { it.value })?.index
    Canvas(Modifier.fillMaxWidth().height(values.heightDp.dp)) {
        val gap = values.barGapDp.dp.toPx()
        val barWidth = ((size.width - gap * (points.size - 1)) / points.size).coerceAtLeast(1f)
        fractions.forEachIndexed { index, fraction ->
            val barHeight = (size.height * fraction * progress()).coerceAtLeast(if (fraction > 0f) 2.dp.toPx() else 0f)
            drawRoundRect(
                color = if (index == peak) tint else tint.copy(alpha = DIM_ALPHA),
                topLeft = Offset(index * (barWidth + gap), size.height - barHeight),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(minOf(barWidth / 2f, 4.dp.toPx())),
            )
        }
        baseline(line)
    }
}

@Composable
private fun LineChart(points: List<MeeshyChartPoint>, values: MeeshyChartValues, tint: Color, progress: () -> Float) {
    val fractions = MeeshyChartScale.normalized(points.map { it.value })
    val peak = MeeshyChartScale.peak(points.map { it.value })?.index
    Canvas(Modifier.fillMaxWidth().height(values.heightDp.dp)) {
        val pad = 4.dp.toPx()
        val step = if (points.size > 1) (size.width - 2 * pad) / (points.size - 1) else 0f
        fun at(index: Int) = Offset(pad + step * index, size.height - pad - (size.height - 2 * pad) * fractions[index] * progress())
        val path = Path().apply { fractions.indices.forEach { if (it == 0) moveTo(at(it).x, at(it).y) else lineTo(at(it).x, at(it).y) } }
        val area = Path().apply {
            addPath(path)
            lineTo(at(fractions.lastIndex).x, size.height)
            lineTo(at(0).x, size.height)
            close()
        }
        drawPath(area, tint.copy(alpha = MeeshyChartRecipe.AREA_OPACITY))
        drawPath(path, tint, style = Stroke(MeeshyChartRecipe.LINE_DP.dp.toPx(), cap = StrokeCap.Round))
        peak?.let { drawCircle(tint, radius = 4.dp.toPx(), center = at(it)) }
    }
}

@Composable
private fun DonutChart(
    points: List<MeeshyChartPoint>,
    values: MeeshyChartValues,
    tint: Color,
    othersLabel: String,
    track: Color,
    progress: () -> Float,
    valueText: (Double) -> String,
) {
    val tokens = MeeshyTheme.tokens
    val data = points.mapIndexed { i, p -> MeeshyChartDatum("k$i", p.label, p.value) }
    val shown = MeeshyChartScale.foldIntoOthers(data, values.maxSegments, othersLabel)
    val parts = MeeshyChartScale.segments(shown.map { it.value })
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(values.heightDp.dp)) {
            val thickness = DONUT_THICKNESS_DP.dp.toPx()
            val diameter = size.minDimension - thickness
            val topLeft = Offset(thickness / 2f, thickness / 2f)
            if (values.keepsTrack) drawArc(track, 0f, 360f, false, topLeft, Size(diameter, diameter), style = Stroke(thickness))
            parts.forEachIndexed { index, part ->
                val color = if (shown[index].key == "others") tokens.textMuted else tint.copy(alpha = DONUT_RAMP[index.coerceAtMost(DONUT_RAMP.lastIndex)])
                drawArc(color, -90f + part.start * 360f, part.share * 360f * progress(), false, topLeft, Size(diameter, diameter), style = Stroke(thickness))
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            shown.forEachIndexed { index, item ->
                val color = if (item.key == "others") tokens.textMuted else tint.copy(alpha = DONUT_RAMP[index.coerceAtMost(DONUT_RAMP.lastIndex)])
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(10.dp).background(color, CircleShape))
                    Text(item.label, color = tokens.textPrimary, fontSize = 13.sp)
                    Text(valueText(item.value), color = tokens.textSecondary, fontSize = 13.sp, style = TextStyle(fontFeatureSettings = "tnum"))
                }
            }
        }
    }
}

@Composable
private fun FunnelChart(points: List<MeeshyChartPoint>, values: MeeshyChartValues, tint: Color, valueText: (Double) -> String) {
    val tokens = MeeshyTheme.tokens
    val fractions = MeeshyChartScale.normalized(points.map { it.value })
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        points.forEachIndexed { index, point ->
            Box(Modifier.fillMaxWidth().height((MeeshyChartRecipe.FUNNEL_STAGE_DP - 4f).dp), contentAlignment = Alignment.CenterStart) {
                Box(
                    Modifier
                        .fillMaxWidth(fractions[index].coerceAtLeast(0.08f))
                        .height((MeeshyChartRecipe.FUNNEL_STAGE_DP - 4f).dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(tint.copy(alpha = DONUT_RAMP[index.coerceAtMost(DONUT_RAMP.lastIndex)])),
                )
                Row(Modifier.padding(horizontal = 12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(point.label, color = tokens.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(valueText(point.value), color = tokens.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun BreakdownChart(points: List<MeeshyChartPoint>, values: MeeshyChartValues, tint: Color, valueText: (Double) -> String) {
    val tokens = MeeshyTheme.tokens
    val parts = MeeshyChartScale.segments(points.map { it.value })
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().height(values.breakdownBarDp.dp).clip(CircleShape).background(tokens.controlFill)) {
            parts.forEachIndexed { index, part ->
                if (part.share > 0f) {
                    Box(Modifier.weight(part.share).height(values.breakdownBarDp.dp).background(tint.copy(alpha = DONUT_RAMP[index.coerceAtMost(DONUT_RAMP.lastIndex)])))
                }
            }
        }
        points.forEachIndexed { index, point ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).background(tint.copy(alpha = DONUT_RAMP[index.coerceAtMost(DONUT_RAMP.lastIndex)]), CircleShape))
                Text(point.label, color = tokens.textPrimary, fontSize = 13.sp, modifier = Modifier.weight(1f))
                Text(valueText(point.value), color = tokens.textSecondary, fontSize = 13.sp, style = TextStyle(fontFeatureSettings = "tnum"))
            }
        }
    }
}

@Composable
private fun StripChart(points: List<MeeshyChartPoint>, values: MeeshyChartValues, tint: Color) {
    val fractions = MeeshyChartScale.normalized(points.map { it.value })
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        fractions.forEach { fraction ->
            Box(Modifier.weight(1f).height(values.heightDp.dp).clip(RoundedCornerShape(6.dp)).background(tint.copy(alpha = MeeshyChartRecipe.stripLevel(fraction))))
        }
    }
}

@Composable
private fun BubbleChart(points: List<MeeshyChartPoint>, tint: Color) {
    val tokens = MeeshyTheme.tokens
    val fractions = MeeshyChartScale.normalized(points.map { it.value })
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        points.forEachIndexed { index, point ->
            val diameter = MeeshyChartRecipe.bubbleDiameter(fractions[index]).dp
            Box(Modifier.size(diameter).background(tint.copy(alpha = 0.22f + 0.5f * fractions[index]), CircleShape), contentAlignment = Alignment.Center) {
                Text(point.label, color = tokens.textPrimary, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}
