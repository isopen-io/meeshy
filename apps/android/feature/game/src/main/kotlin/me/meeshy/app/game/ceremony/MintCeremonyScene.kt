package me.meeshy.app.game.ceremony

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.TextUnit
import kotlin.math.roundToInt
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyFrame
import me.meeshy.sdk.model.game.ceremony.MintCeremonyHitter
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPaint
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPose
import me.meeshy.sdk.model.game.ceremony.MintCeremonyStage as Stage
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.component.game.MeeshCoin

/** Ce que la scène écrit, résolu par l'hôte dans la langue de l'interface. */
internal data class MintCeremonyWords(
    val light: String,
    val tchak: String,
    val tchakFinal: String,
    val ancestors: String,
    val ancestorsLine: String,
    val say: String,
    val glory: String,
)

/** Pose une boîte de la scène — coin haut-gauche ([x], [y]), taille [w] × [h] en unités de la scène — dans l'écran. */
internal fun Modifier.stageBox(fit: MintCeremonyFit, x: Double, y: Double, w: Double, h: Double): Modifier = layout { measurable, _ ->
    val width = (w * fit.k).roundToInt().coerceAtLeast(0)
    val height = (h * fit.k).roundToInt().coerceAtLeast(0)
    val placeable = measurable.measure(Constraints.fixed(width, height))
    layout(width, height) { placeable.place(IntOffset((fit.offX + x * fit.k).roundToInt(), (fit.offY + y * fit.k).roundToInt())) }
}

/**
 * LA SCÈNE DE LA FRAPPE (miroir de `MintCeremonyScene` + `MintCeremonyLayers` iOS) — elle ne fait qu'appliquer, à chaque
 * image, l'image que la loi rend ([MintCeremonyFrame]) : les particules et la forge dans UN `Canvas`, Mee, Meo, la pièce
 * et les phrases en position, rotation et opacité. La pièce se dessine dans son édition d'AFFICHAGE ([look]).
 */
@Composable
internal fun MintCeremonyScene(
    frame: MintCeremonyFrame,
    paint: MintCeremonyPaint,
    edition: MeeshEdition,
    look: MeeshEdition,
    number: Int,
    year: Int,
    reduced: Boolean,
    words: MintCeremonyWords,
    modifier: Modifier = Modifier,
) {
    val palette = MintCeremonyPalette(edition)
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
    BoxWithConstraints(modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val fit = with(density) { MintCeremonyFit(maxWidth.toPx(), maxHeight.toPx()) }
        fun sp(size: Double): TextUnit = with(density) { (size * fit.k).toFloat().toSp() }
        fun dp(size: Double): Dp = with(density) { (size * fit.k).toFloat().toDp() }
        Canvas(Modifier.fillMaxSize().graphicsLayer { alpha = frame.backdrop.toFloat() }) {
            drawRect(Brush.radialGradient(0f to palette.bg[0], 0.62f to palette.bg[1], 1f to palette.bg[2],
                center = Offset(size.width / 2, size.height * 0.45f), radius = maxOf(size.width, size.height) * 0.62f))
        }
        Box(
            Modifier.fillMaxSize().graphicsLayer {
                translationX = (frame.shake.x * fit.k).toFloat()
                translationY = (frame.shake.y * fit.k).toFloat()
            },
        ) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = frame.backdrop.toFloat() }) {
                Canvas(Modifier.fillMaxSize()) { drawForge(fit, frame, palette, edition, reduced) }
                if (!reduced) MintCeremonyParticleCanvas(fit, paint, palette)
                if (!reduced) Canvas(Modifier.fillMaxSize()) { drawShadow(fit, frame, palette) }
                StageText(words.ancestors, fit, 20.0, 150.0, 320.0, 22.0, sp(15.0), palette.sign, FontWeight.SemiBold, alpha = frame.sign)
                StageText(words.ancestorsLine, fit, 20.0, 172.0, 320.0, 18.0, sp(11.5), palette.signSub, FontWeight.Medium, alpha = frame.sign)
                if (!reduced) StageText(words.light, fit, 100.0, 128.0, 160.0, 16.0, sp(11.0), palette.orbInk, FontWeight.SemiBold)
                Actor(MintCeremonyHitter.Mee, edition, frame.mee, fit, dp(Stage.BIRD))
                Actor(MintCeremonyHitter.Meo, edition, frame.meo, fit, dp(Stage.BIRD))
                Canvas(Modifier.fillMaxSize()) { drawTools(fit, frame, palette) }
                Box(
                    Modifier.stageBox(fit, 60.0, 318.0, 240.0, 36.0).graphicsLayer {
                        alpha = frame.tchak.opacity.toFloat()
                        scaleX = frame.tchak.scale.toFloat()
                        scaleY = frame.tchak.scale.toFloat()
                    },
                ) {
                    TchakText(words.tchak, sp(28.0), palette, visible = !frame.tchak.isFinal)
                    TchakText(words.tchakFinal, sp(28.0), palette, visible = frame.tchak.isFinal)
                }
                Canvas(Modifier.fillMaxSize()) { drawFlash(fit, frame, palette) }
                StageText(words.say, fit, 16.0, 600.0, 328.0, 40.0, sp(14.0), palette.say, FontWeight.Normal, alpha = frame.say, italic = true)
            }
            CoinLayers(frame, look, number, year, fit, palette)
            StageText(words.glory, fit, Stage.DEFAULT_TARGET.x - 80, Stage.DEFAULT_TARGET.y - 24 - 40 * frame.glory.rise, 160.0, 18.0,
                sp(13.0), palette.gloryInk, FontWeight.ExtraBold, alpha = frame.glory.opacity)
        }
    }
    }
}

@Composable
private fun StageText(
    text: String,
    fit: MintCeremonyFit,
    x: Double,
    y: Double,
    w: Double,
    h: Double,
    size: TextUnit,
    color: Color,
    weight: FontWeight,
    alpha: Double = 1.0,
    italic: Boolean = false,
) {
    Text(
        text,
        Modifier.stageBox(fit, x, y, w, h).graphicsLayer { this.alpha = alpha.toFloat() },
        style = TextStyle(color = color, fontSize = size, fontWeight = weight, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            textAlign = TextAlign.Center),
    )
}

@Composable
private fun TchakText(text: String, size: TextUnit, palette: MintCeremonyPalette, visible: Boolean) {
    Text(
        text,
        Modifier.fillMaxSize().graphicsLayer { alpha = if (visible) 1f else 0f },
        style = TextStyle(color = palette.tchak, fontSize = size, fontWeight = FontWeight.Black, textAlign = TextAlign.Center),
    )
}

