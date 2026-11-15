package me.meeshy.ui.component.auth

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.brand.BrandMarkGeometry
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le logo Meeshy qui se dessine (iOS `AnimatedLogoView`) : trois traits à bouts ronds qui se
 * révèlent l'un après l'autre, de gauche à droite, à un dixième de seconde d'écart. En mode
 * [continuous] le logo respire ensuite — cinq pour cent plus grand, deux traits qui
 * s'éclaircissent pendant que le troisième s'estompe — sans fin.
 *
 * La géométrie est celle de `MeeshyBrandMark` dans l'espace 1024 × 1024 ([BrandMarkGeometry]),
 * pas celle du lanceur : c'est le logo tel que l'écran d'accès le dessine sur iOS.
 *
 * **Sous « Réduire les animations »** ([reduceMotion]) le logo est tout de suite entier et
 * immobile : le message est la marque, pas le mouvement. La respiration n'est alors pas
 * créée.
 *
 * @param lineWidth l'épaisseur des traits ; iOS pose 8 par défaut, 10 sur l'écran de connexion.
 * @param contentDescription `null` : le logo est décoratif (il accompagne le mot « Meeshy »,
 *   qui le nomme déjà) et TalkBack le saute.
 */
@Composable
public fun AnimatedBrandLogo(
    modifier: Modifier = Modifier,
    color: Color = MeeshyPalette.White,
    lineWidth: Dp = 8.dp,
    continuous: Boolean = false,
    reduceMotion: Boolean = rememberAnimationsReduced(),
    contentDescription: String? = null,
) {
    val reveals = rememberDashReveals(reduceMotion)
    val breath = rememberPulsePhase(
        enabled = continuous && !reduceMotion,
        durationMillis = BrandMarkGeometry.BREATH_DURATION_MILLIS,
    )

    Canvas(
        modifier = modifier
            .aspectRatio(1f)
            .then(
                if (contentDescription == null) {
                    Modifier.clearAndSetSemantics { }
                } else {
                    Modifier.semantics { this.contentDescription = contentDescription }
                },
            ),
    ) {
        val phase = breath.value
        scale(scale = 1f + (BrandMarkGeometry.BREATH_SCALE - 1f) * phase) {
            drawBrandDashes(
                color = color,
                lineWidthPx = lineWidth.toPx(),
                progress = { index -> reveals[index].value },
                phase = phase,
            )
        }
    }
}

/**
 * La révélation de chaque trait, de 0 (rien) à 1 (entier). Les traits se dessinent l'un après
 * l'autre ; sous « Réduire les animations » ils sont entiers d'emblée, sans transition.
 */
@Composable
internal fun rememberDashReveals(reduceMotion: Boolean): List<Animatable<Float, AnimationVector1D>> {
    val reveals = remember { BrandMarkGeometry.dashes.map { Animatable(if (reduceMotion) 1f else 0f) } }
    LaunchedEffect(reduceMotion) {
        if (reduceMotion) {
            reveals.forEach { it.snapTo(1f) }
        } else {
            BrandMarkGeometry.dashes.forEachIndexed { index, dash ->
                launch {
                    reveals[index].animateTo(
                        targetValue = 1f,
                        animationSpec = tween(
                            durationMillis = BrandMarkGeometry.REVEAL_DURATION_MILLIS,
                            delayMillis = dash.revealDelayMillis,
                            easing = EaseOut,
                        ),
                    )
                }
            }
        }
    }
    return reveals
}

/**
 * Dessine les trois traits dans le plus grand carré centré, à l'échelle de l'espace de
 * référence. [progress] dit jusqu'où chaque trait est révélé (0..1) ; un trait à zéro ne
 * laisse pas même le point de son bout rond.
 */
internal fun DrawScope.drawBrandDashes(
    color: Color,
    lineWidthPx: Float,
    progress: (index: Int) -> Float,
    phase: Float = 0f,
) {
    val side = size.minDimension
    val unit = side / BrandMarkGeometry.REFERENCE_SIDE
    val originX = (size.width - side) / 2f
    val originY = (size.height - side) / 2f
    BrandMarkGeometry.dashes.forEachIndexed { index, dash ->
        val revealed = progress(index)
        if (revealed <= 0f) return@forEachIndexed
        drawLine(
            color = color.copy(alpha = color.alpha * dash.alphaAt(phase)),
            start = Offset(originX + dash.startX * unit, originY + dash.y * unit),
            end = Offset(originX + dash.endXAt(revealed) * unit, originY + dash.y * unit),
            strokeWidth = lineWidthPx,
            cap = StrokeCap.Round,
        )
    }
}
