package me.meeshy.app.game.ceremony

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
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
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPaint

/** Le budget des particules : au plus 4 500 à l'écran, moitié moins sur un appareil modeste (la loi le garantit). */
internal object MintCeremonyBudget {
    const val MAX_PARTICLES: Int = 4_500
}

/**
 * UN SEUL `Canvas` pour toutes les particules : les lots que la loi rend (une encre, une opacité, un mode de fusion)
 * sont peints d'un seul trait chacun. Aucun composable par particule.
 */
@Composable
internal fun MintCeremonyParticleCanvas(fit: MintCeremonyFit, paint: MintCeremonyPaint, palette: MintCeremonyPalette, modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxSize()) { drawParticles(fit, paint, palette) }
}

internal fun DrawScope.drawParticles(fit: MintCeremonyFit, paint: MintCeremonyPaint, palette: MintCeremonyPalette) =
    translate(fit.offX, fit.offY) {
        scale(fit.k, fit.k, pivot = Offset.Zero) {
            paint.batches.forEach { batch ->
                val color = palette.color(batch.ink)
                val alpha = batch.opacity.toFloat()
                val blend = if (batch.additive) BlendMode.Plus else BlendMode.SrcOver
                batch.rects.forEach { r -> drawRect(color, Offset(r.x.toFloat(), r.y.toFloat()), Size(r.width.toFloat(), r.height.toFloat()), alpha, blendMode = blend) }
                batch.circles.forEach { c ->
                    drawCircle(color, (c.width / 2).toFloat(), Offset((c.x + c.width / 2).toFloat(), (c.y + c.height / 2).toFloat()), alpha, blendMode = blend)
                }
            }
        }
    }
