package me.meeshy.ui.component

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.ProfileCompletionRingMath
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Anneau de completude du profil (iOS `ProfileCompletionRing`) : arc 0-100 % en degrade rose vers cyan,
 * pourcentage centre en gras arrondi, ressort a l'apparition (fondu direct si « Reduire les animations »).
 * [showLabel] a faux rend l'anneau seul (autour d'un avatar).
 */
@Composable
public fun ProfileCompletionRing(
    percent: Int,
    modifier: Modifier = Modifier,
    size: Dp = 100.dp,
    strokeWidth: Dp = 8.dp,
    showLabel: Boolean = true,
    label: String = "${ProfileCompletionRingMath.percent(ProfileCompletionRingMath.progressOf(percent))}%",
    colors: List<Color> = listOf(MeeshyPalette.TileRose, MeeshyPalette.TileCyan),
    track: Color = MeeshyTheme.tokens.backgroundTertiary,
) {
    val target = ProfileCompletionRingMath.progressOf(percent)
    val reduceMotion = LocalReduceMotion.current
    val animated = remember { Animatable(if (reduceMotion) target else 0f) }
    LaunchedEffect(target, reduceMotion) {
        if (reduceMotion) animated.snapTo(target) else animated.animateTo(target, MeeshyMotion.springDefault())
    }
    Box(modifier = modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(size)) {
            val stroke = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round)
            val inset = stroke.width / 2f
            val arcSize = Size(this.size.width - stroke.width, this.size.height - stroke.width)
            val topLeft = Offset(inset, inset)
            drawArc(track, 0f, 360f, false, topLeft, arcSize, style = stroke)
            drawArc(
                brush = Brush.linearGradient(colors, Offset.Zero, Offset.Infinite),
                startAngle = -90f,
                sweepAngle = ProfileCompletionRingMath.sweepDegrees(animated.value),
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = stroke,
            )
        }
        if (showLabel) {
            Text(text = label, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary)
        }
    }
}
