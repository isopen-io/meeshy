package me.meeshy.ui.component.chrome

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.sdk.model.appearance.ConversationBackgroundPlan

private const val TWO_PI = (2 * PI).toFloat()

/**
 * La composition de BASE du fond Signature, à l'état de repos (les animations iOS sont coupées par décision produit :
 * batterie). Une seule projection par type : deux cercles reliés (intimiste), avatars en orbite fixe (groupe), anneaux
 * concentriques (communauté), globe et satellites (globe).
 */
internal fun DrawScope.drawSignatureBase(plan: ConversationBackgroundPlan, accent: Color, secondary: Color) {
    when (plan.style) {
        ConversationBackgroundPlan.Style.INTIMATE -> drawIntimate(accent, secondary)
        ConversationBackgroundPlan.Style.GROUP -> drawGroup(plan.avatarCount, accent)
        ConversationBackgroundPlan.Style.COMMUNITY -> drawCommunity(accent, secondary)
        ConversationBackgroundPlan.Style.GLOBAL -> drawGlobe(accent, secondary)
    }
}

private fun DrawScope.drawIntimate(left: Color, right: Color) {
    val centerY = size.height * 0.4f
    val centerX = size.width / 2f
    val radius = px(50)
    val gap = px(5)
    val band = px(4)
    drawRect(
        Brush.horizontalGradient(listOf(left.copy(alpha = 0.05f), left.copy(alpha = 0.10f)), 0f, centerX),
        topLeft = Offset(0f, centerY - band / 2),
        size = Size(centerX - radius, band),
    )
    drawRect(
        Brush.horizontalGradient(listOf(right.copy(alpha = 0.10f), right.copy(alpha = 0.05f)), centerX, size.width),
        topLeft = Offset(centerX + radius, centerY - band / 2),
        size = Size(size.width - centerX - radius, band),
    )
    listOf(centerX - radius - gap to left, centerX + radius + gap to right).forEach { (x, color) ->
        drawCircle(Brush.radialGradient(listOf(color.copy(alpha = 0.18f), color.copy(alpha = 0.08f), Color.Transparent), Offset(x, centerY), radius * 1.6f), radius * 1.6f, Offset(x, centerY))
        drawCircle(color.copy(alpha = 0.30f), radius, Offset(x, centerY), style = Stroke(px(2)))
    }
}

private fun DrawScope.drawGroup(avatars: Int, color: Color) {
    val center = Offset(size.width / 2f, size.height * 0.4f)
    val orbit = px(110)
    repeat(3) { ring -> drawCircle(color.copy(alpha = 0.10f), px(55) * (1f + ring), center, style = Stroke(px(2))) }
    repeat(avatars) { index ->
        val angle = TWO_PI * index / avatars.coerceAtLeast(1)
        val at = center + Offset(cos(angle) * orbit, sin(angle) * orbit)
        drawLine(color.copy(alpha = 0.10f), at, at - Offset(cos(angle) * orbit * 0.65f, sin(angle) * orbit * 0.65f), px(2))
        drawCircle(color.copy(alpha = 0.08f), px(26), at)
        drawCircle(color.copy(alpha = 0.30f), px(22), at, style = Stroke(px(2)))
        drawCircle(color.copy(alpha = 0.40f), px(8), at)
    }
    drawCircle(color.copy(alpha = 0.22f), px(18), center)
}

private fun DrawScope.drawCommunity(primary: Color, secondary: Color) {
    val center = Offset(size.width / 2f, size.height * 0.4f)
    repeat(4) { ring ->
        val color = if (ring % 2 == 0) primary else secondary
        drawCircle(color.copy(alpha = 0.16f - ring * 0.02f), px(60 + ring * 45), center, style = Stroke(px(2)))
    }
    repeat(6) { index ->
        val angle = TWO_PI * index / 6
        val at = center + Offset(cos(angle) * px(105), sin(angle) * px(105))
        drawCircle(secondary.copy(alpha = 0.25f), px(10), at)
        drawLine(primary.copy(alpha = 0.10f), center, at, px(1.5f))
    }
    drawCircle(primary.copy(alpha = 0.30f), px(24), center)
}

private fun DrawScope.drawGlobe(primary: Color, secondary: Color) {
    val center = Offset(size.width / 2f, size.height * 0.4f)
    val globe = px(45)
    repeat(3) { ring -> drawCircle(primary.copy(alpha = 0.25f - ring * 0.07f), globe * (1f + ring * 0.9f), center, style = Stroke(px(2))) }
    drawCircle(primary.copy(alpha = 0.18f), globe, center)
    drawOval(primary.copy(alpha = 0.30f), Offset(center.x - globe * 0.45f, center.y - globe), Size(globe * 0.9f, globe * 2f), style = Stroke(px(1.5f)))
    drawLine(primary.copy(alpha = 0.30f), center - Offset(globe, 0f), center + Offset(globe, 0f), px(1.5f))
    repeat(3) { index ->
        val angle = TWO_PI * index / 3
        val at = center + Offset(cos(angle) * px(140), sin(angle) * px(140))
        drawLine(secondary.copy(alpha = 0.22f), center, at, px(1.5f))
        drawCircle(secondary.copy(alpha = 0.40f), px(7), at)
    }
}

private fun DrawScope.px(value: Number): Float = value.toFloat() * density
