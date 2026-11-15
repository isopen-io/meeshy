package me.meeshy.ui.component.chrome

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.sdk.model.appearance.ConversationBackgroundPlan

/**
 * La surcouche de chiffrement : un cadenas dessiné (anse + corps), un anneau de plus quand le chiffrement est de bout en
 * bout. Décorative : jamais lue par TalkBack.
 */
internal fun DrawScope.drawEncryptionOverlay(encryption: ConversationBackgroundPlan.Encryption, color: Color) {
    val center = Offset(size.width * 0.8f, size.height * 0.22f)
    val unit = density
    drawRoundRect(color.copy(alpha = 0.8f), Offset(center.x - 18 * unit, center.y - 4 * unit), Size(36 * unit, 28 * unit), CornerRadius(6 * unit))
    drawArc(color, 180f, 180f, false, Offset(center.x - 11 * unit, center.y - 20 * unit), Size(22 * unit, 32 * unit), style = Stroke(4 * unit))
    if (encryption == ConversationBackgroundPlan.Encryption.END_TO_END) {
        drawCircle(color, 38 * unit, center + Offset(0f, 8 * unit), style = Stroke(2 * unit))
    }
}

/** La surcouche multilingue : les drapeaux des langues principales posés sur un anneau, fixes au repos. */
internal fun DrawScope.drawFlagsOverlay(flags: List<String>, measurer: TextMeasurer) {
    if (flags.isEmpty()) return
    val center = Offset(size.width / 2f, size.height * 0.4f)
    val radius = 170 * density
    val style = TextStyle(fontSize = 22.sp)
    flags.forEachIndexed { index, flag ->
        val angle = (2 * PI * index / flags.size).toFloat()
        val layout = measurer.measure(flag, style)
        drawText(
            layout,
            topLeft = center + Offset(cos(angle) * radius - layout.size.width / 2f, sin(angle) * radius - layout.size.height / 2f),
        )
    }
}
