package me.meeshy.ui.component.talkie

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.relation.TalkieHeaderBadgeDot
import me.meeshy.sdk.model.relation.TalkieHeaderBarLook
import me.meeshy.sdk.model.relation.TalkieHeaderDelivery
import me.meeshy.sdk.model.relation.TalkieHeaderVoice
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le fond de la barre (#17339) : le dégradé de la conversation et un reflet en haut ; hors ligne, il s'assombrit et prend
 * un liseré pointillé — l'œil voit que la voix ne passe pas en direct.
 */
internal fun Modifier.talkieBarBackground(accent: Color, secondary: Color, look: TalkieHeaderBarLook): Modifier = drawBehind {
    val radius = CornerRadius(size.height / 2, size.height / 2)
    drawRoundRect(Brush.horizontalGradient(listOf(accent, secondary)), cornerRadius = radius)
    if (look.dimAlpha > 0f) drawRoundRect(Color.Black.copy(alpha = look.dimAlpha), cornerRadius = radius)
    drawRoundRect(
        Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.28f), Color.Transparent), endY = size.height / 2),
        cornerRadius = radius,
    )
    drawBorder(look.dashedBorder, radius)
}

private fun DrawScope.drawBorder(dashed: Boolean, radius: CornerRadius) {
    val width = 1.dp.toPx()
    val inset = width / 2
    val effect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())) else null
    drawRoundRect(
        color = Color.White.copy(alpha = if (dashed) 0.45f else 0.4f),
        topLeft = Offset(inset, inset),
        size = Size(size.width - width, size.height - width),
        cornerRadius = CornerRadius(radius.x - inset, radius.y - inset),
        style = Stroke(width = width, pathEffect = effect),
    )
}

/** La pastille du mode : un point blanc qui pulse « En direct », un point rouge qui clignote hors ligne. */
@Composable
internal fun TalkieDeliveryBadge(delivery: TalkieHeaderDelivery, voice: TalkieHeaderVoice, look: TalkieHeaderBarLook) {
    Row(
        Modifier
            .background(Color.White.copy(alpha = look.badgeFillAlpha), CircleShape)
            .padding(horizontal = MeeshySpacing.sm, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        TalkieBadgeDot(look.dot)
        Icon(badgeIcon(delivery, voice), contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
        Text(
            text = stringResource(TalkieWording.badge(delivery)).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Black,
            letterSpacing = 0.6.sp,
            color = Color.White,
            maxLines = 1,
            softWrap = false,
        )
    }
}

private fun badgeIcon(delivery: TalkieHeaderDelivery, voice: TalkieHeaderVoice): ImageVector = when (delivery) {
    TalkieHeaderDelivery.LIVE -> if (voice == TalkieHeaderVoice.INCOMING) MeeshyIcons.VolumeUp else MeeshyIcons.Mic
    TalkieHeaderDelivery.RELAYED -> MeeshyIcons.Schedule
    TalkieHeaderDelivery.RECORDED -> MeeshyIcons.WaveformMic
}

/** Le point, redessiné à chaque image sans recomposer la pastille ; figé avec « Réduire les animations ». */
@Composable
private fun TalkieBadgeDot(dot: TalkieHeaderBadgeDot) {
    val reduceMotion = LocalReduceMotion.current
    var seconds by remember { mutableDoubleStateOf(0.0) }
    LaunchedEffect(reduceMotion) {
        if (reduceMotion) return@LaunchedEffect
        val origin = nextFrameNanos(reduceMotion = false)
        while (true) seconds = (nextFrameNanos(reduceMotion = false) - origin) / 1e9
    }
    Canvas(Modifier.size(14.dp)) {
        when (dot) {
            TalkieHeaderBadgeDot.PULSE -> drawPulse(TalkieHeaderBarLook.pulse(seconds, reduceMotion))
            TalkieHeaderBadgeDot.BLINK -> drawBlink(TalkieHeaderBarLook.blink(seconds, reduceMotion))
        }
    }
}

private fun DrawScope.drawPulse(pulse: Float) {
    val core = 3.5.dp.toPx()
    drawCircle(Color.White.copy(alpha = 0.35f * (1 - pulse)), radius = size.minDimension / 2 * (1 + 0.8f * pulse) / 1.8f)
    drawCircle(Color.White, radius = core)
}

private fun DrawScope.drawBlink(blink: Float) {
    drawCircle(MeeshyPalette.ErrorStrong.copy(alpha = blink), radius = 4.dp.toPx())
    drawCircle(Color.White.copy(alpha = 0.8f), radius = 4.5.dp.toPx(), style = Stroke(width = 1.dp.toPx()))
}
