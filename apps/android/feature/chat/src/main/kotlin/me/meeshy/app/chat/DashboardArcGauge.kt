package me.meeshy.app.chat

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * La jauge en demi-cercle du score de santé (miroir de `ArcGauge` iOS) : un rail à la
 * teinte de la conversation, l'arc rempli à la couleur du palier, et le score au centre.
 * Une seule ligne TalkBack : « [label], [score] ».
 */
@Composable
internal fun DashboardArcGauge(
    score: Int,
    accentColor: Color,
    scoreColor: Color,
    label: String,
    modifier: Modifier = Modifier,
) {
    val progress = (score / 100f).coerceIn(0f, 1f)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(GAUGE_HEIGHT)
            .clearAndSetSemantics {
                contentDescription = label
                stateDescription = score.toString()
            },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Canvas(modifier = Modifier.fillMaxWidth().height(GAUGE_HEIGHT)) {
            val stroke = GAUGE_STROKE.toPx()
            val diameter = minOf(size.width, size.height * 2f) - stroke
            val topLeft = Offset((size.width - diameter) / 2f, size.height - diameter / 2f - stroke / 2f)
            val arcSize = Size(diameter, diameter)
            drawArc(
                color = accentColor.copy(alpha = 0.14f),
                startAngle = 180f,
                sweepAngle = 180f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            drawArc(
                color = scoreColor,
                startAngle = 180f,
                sweepAngle = 180f * progress,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
        Text(
            score.toString(),
            style = MaterialTheme.typography.headlineMedium,
            color = scoreColor,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 6.dp),
        )
    }
}

private val GAUGE_HEIGHT = 100.dp
private val GAUGE_STROKE = 10.dp
