package me.meeshy.app.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.util.Locale

/** La fraction d'une barre de palier et la façon de la dire : une valeur bornée, jamais un pourcentage recopié. */
internal object ProgressionBarValue {

    /** Bornée à 0..1 ; une valeur illisible (NaN) vaut 0. */
    fun fraction(progress: Double): Float = if (progress.isNaN()) 0f else progress.coerceIn(0.0, 1.0).toFloat()

    /** Le glyphe « % » et son espacement viennent de la LOCALE (« 50 % » en français, « 50% » en anglais). */
    fun spokenPercent(fraction: Float, locale: Locale): String =
        NumberFormat.getPercentInstance(locale).format(Math.round(fraction * 100) / 100.0)
}

/**
 * UNE BARRE DE PALIER (iOS `ProgressionBar`) : la fraction parcourue entre deux paliers, dans la teinte de son échelle.
 * C'est une information, pas un ornement : TalkBack la lit avec sa valeur ([label] est celui de l'échelle) et la plage
 * 0..1 de sa sémantique de progression.
 */
@Composable
internal fun ProgressionBar(
    progress: Double,
    tint: Color,
    label: String,
    modifier: Modifier = Modifier,
) {
    val fraction = ProgressionBarValue.fraction(progress)
    val locale = LocalConfiguration.current.locales[0]
    val spoken = remember(fraction, locale) { ProgressionBarValue.spokenPercent(fraction, locale) }
    val track = tint.copy(alpha = TRACK_ALPHA)
    Canvas(
        modifier
            .fillMaxWidth()
            .height(BAR_HEIGHT)
            .clearAndSetSemantics {
                contentDescription = label
                stateDescription = spoken
                progressBarRangeInfo = ProgressBarRangeInfo(fraction, 0f..1f)
            },
    ) {
        val radius = CornerRadius(size.height / 2f)
        drawRoundRect(track, size = size, cornerRadius = radius)
        if (fraction > 0f) drawRoundRect(tint, size = Size(size.width * fraction, size.height), cornerRadius = radius)
    }
}

private val BAR_HEIGHT = 6.dp
private const val TRACK_ALPHA = 0.18f
