package me.meeshy.app.calls

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallHeaderLaw
import me.meeshy.sdk.model.call.CallSignalGlyphSpec
import me.meeshy.sdk.model.call.CallSignalLabel
import me.meeshy.sdk.model.call.CallSignalStrength
import me.meeshy.sdk.model.call.CallSignalTone
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private val GLYPH_WIDTH = 18.dp
private val GLYPH_HEIGHT = 14.dp
private const val EMPTY_BAR_ALPHA = 0.3f

@Composable
internal fun CallSignalTone.color(): Color = when (this) {
    CallSignalTone.SUCCESS -> MeeshyPalette.Success
    CallSignalTone.WARNING -> MeeshyTheme.tokens.warning
    CallSignalTone.ERROR -> MeeshyPalette.Error
    CallSignalTone.NEGOTIATING -> MeeshyPalette.Indigo400
}

@Composable
internal fun CallSignalLabel.text(): String = stringResource(
    when (this) {
        CallSignalLabel.GOOD -> R.string.call_quality_good
        CallSignalLabel.FAIR -> R.string.call_signal_fair
        CallSignalLabel.POOR -> R.string.call_signal_poor
        CallSignalLabel.LOST -> R.string.call_signal_lost
        CallSignalLabel.CONNECTING -> R.string.call_signal_connecting
    },
)

/**
 * Le glyphe de signal (miroir de iOS `CallSignalGlyph`) : quatre barres au Canvas, pleines à 1 / 0,75 / 0,5 /
 * 0,25 / 0, teintées par le ton du niveau. Son libellé TalkBack dit la FORCE du signal, jamais un événement de
 * reconnexion ; il se fond dans la sémantique de la puce quand il y est posé.
 */
@Composable
internal fun CallSignalGlyph(strength: CallSignalStrength, modifier: Modifier = Modifier, size: Dp = GLYPH_HEIGHT) {
    val tint = strength.tone.color()
    val label = strength.label.text()
    val filled = strength.filledBars
    val width = GLYPH_WIDTH * (size / GLYPH_HEIGHT)
    Canvas(modifier.size(width, size).semantics { contentDescription = label }) {
        val count = CallSignalGlyphSpec.BAR_COUNT
        val gap = this.size.width * 0.12f
        val barWidth = (this.size.width - gap * (count - 1)) / count
        repeat(count) { index ->
            val barHeight = this.size.height * (index + 1) / count
            drawRoundRect(
                color = if (index < filled) tint else tint.copy(alpha = EMPTY_BAR_ALPHA),
                topLeft = Offset(index * (barWidth + gap), this.size.height - barHeight),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(barWidth / 2f),
            )
        }
    }
}

/** Invisible sur un lien sain ; apparaît à la dégradation, suit la qualité, reste vert 30 s après la guérison. */
@Composable
internal fun TransientCallSignalGlyph(strength: CallSignalStrength, modifier: Modifier = Modifier) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(strength.isDegraded) {
        if (strength.isDegraded) {
            shown = true
        } else if (shown) {
            delay(CallHeaderLaw.SIGNAL_RECOVERY_LINGER_MILLIS)
            shown = false
        }
    }
    if (shown) CallSignalGlyph(strength, modifier)
}
