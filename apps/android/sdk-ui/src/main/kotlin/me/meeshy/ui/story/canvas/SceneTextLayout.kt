package me.meeshy.ui.story.canvas

import android.graphics.Paint
import android.graphics.Rect
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalFontFamilyResolver
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontSynthesis
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import me.meeshy.sdk.model.scene.SceneTextFrameGeometry

/**
 * L'hôte de flou de la scène, quand un lot de flou en fournit un : il rend le [Modifier] qui floute ce qui est derrière
 * la boîte d'un texte à fond « verre ». Absent (défaut), la boîte se contente d'un voile teinté : le texte en verre ne
 * dépend d'aucun autre lot pour se lire.
 */
public fun interface SceneGlassHost {
    public fun backdrop(sigmaPx: Float): Modifier
}

public val LocalSceneGlassHost: androidx.compose.runtime.ProvidableCompositionLocal<SceneGlassHost?> =
    staticCompositionLocalOf { null }

/** Le voile d'un fond en verre : plus appuyé sans hôte de flou, où il est seul à détacher le texte du fond. */
internal fun glassVeilAlpha(hasHost: Boolean): Float = if (hasHost) 0.10f else 0.22f

/**
 * L'encre qui déborde l'avance typographique, par côté, en pixels (iOS `maxInkOverhangPerSide`) : la différence entre le
 * tracé réel des glyphes et la somme de leurs avances, pour chaque ligne du texte mis en lignes à [wrapPx]. Les
 * empattements et les boucles calligraphiques dépassent l'avance ; sans cette réserve, le premier ou le dernier glyphe
 * serait rogné. 0 si la mesure échoue.
 */
internal fun inkOverhangPx(measurer: TextMeasurer, text: String, style: TextStyle, typeface: android.graphics.Typeface, fontPx: Float, wrapPx: Int): Float {
    if (text.isEmpty() || wrapPx <= 0 || !(fontPx > 0f)) return 0f
    return runCatching {
        val layout = measurer.measure(text, style, constraints = Constraints(maxWidth = wrapPx))
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = fontPx
            this.typeface = typeface
        }
        val (left, right) = layout.lineInkOverhangs(text, paint)
        SceneTextFrameGeometry.inkReserve(left.toDouble(), right.toDouble()).toFloat()
    }.getOrDefault(0f)
}

private fun TextLayoutResult.lineInkOverhangs(text: String, paint: Paint): Pair<Float, Float> {
    var left = 0f
    var right = 0f
    val bounds = Rect()
    for (line in 0 until lineCount) {
        val slice = text.substring(getLineStart(line), getLineEnd(line, visibleEnd = true)).trimEnd('\n', ' ')
        if (slice.isEmpty()) continue
        paint.getTextBounds(slice, 0, slice.length, bounds)
        left = maxOf(left, -bounds.left.toFloat())
        right = maxOf(right, bounds.right - paint.measureText(slice))
    }
    return left to right
}

/** Le `Typeface` plateforme de [style], résolu par la même chaîne que le texte Compose (polices embarquées comprises). */
@Composable
internal fun rememberTextTypeface(style: TextStyle): android.graphics.Typeface {
    val resolver = LocalFontFamilyResolver.current
    val state = remember(style.fontFamily, style.fontWeight, style.fontStyle, resolver) {
        resolver.resolve(
            style.fontFamily ?: FontFamily.Default,
            style.fontWeight ?: FontWeight.Normal,
            style.fontStyle ?: FontStyle.Normal,
            FontSynthesis.All,
        )
    }
    return state.value as? android.graphics.Typeface ?: android.graphics.Typeface.DEFAULT
}
