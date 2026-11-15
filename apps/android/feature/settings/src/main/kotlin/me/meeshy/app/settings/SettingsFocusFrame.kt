package me.meeshy.app.settings

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.ui.theme.MeeshyRadius

/** Le réglage qu'une invite vient d'ouvrir porte ce marqueur tant qu'il est mis en évidence (témoins, #16339). */
const val SETTINGS_FOCUS_TAG: String = "settings-focus-highlight"

private const val GLOW_IN_MS = 250
private const val GLOW_HOLD_MS = 2_200L
private const val GLOW_OUT_MS = 700
private val GlowInset = 6.dp
private val GlowStroke = 2.dp

/**
 * Le cadre d'une section du hub : quand une invite l'a désignée ([highlighted]), un halo de [tint] l'entoure le temps
 * qu'on la repère, puis s'efface. Le halo se dessine HORS du contenu : la mise en évidence ne déplace rien.
 */
@Composable
internal fun SettingsFocusFrame(
    highlighted: Boolean,
    tint: Color,
    modifier: Modifier = Modifier,
    onSettled: () -> Unit = {},
    content: @Composable () -> Unit,
) {
    val glow = remember { Animatable(0f) }
    LaunchedEffect(highlighted) {
        if (!highlighted) return@LaunchedEffect
        glow.animateTo(1f, tween(GLOW_IN_MS))
        delay(GLOW_HOLD_MS)
        glow.animateTo(0f, tween(GLOW_OUT_MS))
        onSettled()
    }
    val marker = if (highlighted) Modifier.testTag(SETTINGS_FOCUS_TAG) else Modifier
    Box(
        modifier = modifier
            .then(marker)
            .drawBehind {
                val alpha = glow.value
                if (alpha <= 0f) return@drawBehind
                val inset = GlowInset.toPx()
                val topLeft = Offset(-inset, -inset)
                val box = Size(size.width + inset * 2, size.height + inset * 2)
                val corner = CornerRadius(MeeshyRadius.lg.toPx() + inset)
                drawRoundRect(tint.copy(alpha = 0.10f * alpha), topLeft, box, corner)
                drawRoundRect(tint.copy(alpha = 0.85f * alpha), topLeft, box, corner, style = Stroke(GlowStroke.toPx()))
            },
    ) { content() }
}
