package me.meeshy.app.calls

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.ui.theme.MeeshyMediaChromeColors

/**
 * The sentence of a caption line in ONE piece: « Me · text », then the language label (« EN », « EN → FR ») and,
 * while a translation is awaited, three dots (iOS `CallCaptionSentence`). One `Text`, so it wraps like a sentence
 * and is read in one go (the plate, views P3 to P5).
 */
internal object CallCaptionSentence {
    private val dotsRest = 0.6f
    private val dotLit = 0.9f
    private val dotDim = 0.35f

    /** The alpha of each of the three dots: all at rest when [phase] is null (still), else the lit one travels. */
    fun dotAlphas(phase: Int?): List<Float> =
        (0 until DOTS).map { index -> phase?.let { if (it == index) dotLit else dotDim } ?: dotsRest }

    fun text(
        line: CallLiveCaptionLine,
        nameColor: Color,
        textColor: Color,
        dotAlphas: List<Float>?,
    ): AnnotatedString = buildAnnotatedString {
        append(captureSentence(line.speakerName, nameColor, line.text, elapsed = null, ink = textColor))
        line.languageTag?.let { tag ->
            append(" ")
            withStyle(
                SpanStyle(
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp,
                    color = MeeshyMediaChromeColors.ChromeTertiary,
                    background = MeeshyMediaChromeColors.MediaFill,
                ),
            ) { append(" $tag ") }
        }
        dotAlphas?.let { alphas ->
            append(" ")
            alphas.forEachIndexed { index, alpha ->
                withStyle(SpanStyle(color = Color.White.copy(alpha = alpha), fontSize = 11.sp)) { append(if (index == 0) "•" else " •") }
            }
        }
    }

    private const val DOTS = 3
}
