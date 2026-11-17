package me.meeshy.ui.component.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val HALO_ALPHA = 0.15f
private const val DOT_LENGTH = 0.01f
private const val HEAD_RING_DP = 2

private fun toPath(path: MeeshyMapTracePath, density: Float): Path = Path().apply {
    val first = path.segments.firstOrNull() ?: return@apply
    moveTo(first.start.x * density, first.start.y * density)
    path.segments.forEach { s ->
        cubicTo(s.c1.x * density, s.c1.y * density, s.c2.x * density, s.c2.y * density, s.end.x * density, s.end.y * density)
    }
}

/**
 * **Le tracé de carte** (K54) : un chemin entre des points d'écran déjà projetés par l'hôte (en dp, dans le repère de ce
 * composant), à la teinte donnée, sur un liseré sombre qui le garde lisible sur toute carte. Trois genres : le trajet (points
 * qui avancent vers l'arrivée), le lien (deux bouts, mince) et l'historique (trait plein épais sur un halo). Avec [progress], la
 * part parcourue est pleine, le reste à 30 %, et une tête marque la position, posée sur le trait dessiné. Le trajet et le lien
 * défilent du premier point vers le dernier ; l'historique ne défile jamais.
 *
 * Le tracé relie, il ne sait pas par où passer : itinéraire, distance, durée, projection et fournisseur de carte sont à
 * l'hôte, qui remet [midLabel] déjà composé (posé au milieu, seulement si le tracé fait 96 dp au moins). Sous deux points ou
 * 24 dp, rien n'est dessiné. UN élément pour la voix ([label]) ; le dessin se tait. Sous mouvement réduit, les points sont
 * fixes. Jumeau iOS : `MeeshyMapTrace`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyMapTrace(
    points: List<MeeshyMapTracePoint>,
    kind: MeeshyMapTraceKind,
    modifier: Modifier = Modifier,
    tint: Color = MeeshyPalette.Indigo500,
    weight: MeeshyMapTraceWeight = MeeshyMapTraceWeight.Regular,
    progress: Float? = null,
    isStale: Boolean = false,
    isAnimated: Boolean = true,
    onLightMap: Boolean = false,
    smoothing: Boolean = true,
    label: String? = null,
    midLabel: String? = null,
) {
    val trace = remember(points, kind, smoothing) { MeeshyMapTracePath.of(points, kind, smoothing) }
    if (!trace.isDrawable) return
    val reduce = LocalReduceMotion.current
    val tokens = MeeshyTheme.tokens
    val v = MeeshyMapTraceRecipe.resolve(kind, weight, progress, isStale, isAnimated, onLightMap, reduce, trace.length)
    val flow = if (v.flows) {
        rememberInfiniteTransition(label = "trace-flow").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(v.flowMillis, easing = LinearEasing)),
            label = "trace-flow-phase",
        )
    } else {
        null
    }
    val said = if (label != null) Modifier.semantics(mergeDescendants = true) { contentDescription = label } else Modifier.decorative()
    Box(modifier.then(said)) {
        Spacer(
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = v.opacity }
                .drawWithCache {
                    val path = toPath(trace, density)
                    val measure = PathMeasure().apply { setPath(path, false) }
                    val split = (v.progress ?: 1f) * measure.length
                    val done = Path().also { measure.getSegment(0f, split, it, true) }
                    val head = measure.getPosition(split)
                    val round = Stroke(v.strokeDp.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val halo = Stroke(v.haloDp.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val casing = Stroke(v.casingDp.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val every = v.dotEveryDp.dp.toPx()
                    val headRadius = (MeeshyMapTraceRecipe.HEAD_DP / 2f).dp.toPx()
                    val ring = HEAD_RING_DP.dp.toPx()
                    onDrawBehind {
                        if (kind == MeeshyMapTraceKind.History) drawPath(path, tint.copy(alpha = HALO_ALPHA), style = halo)
                        drawPath(path, Color.Black.copy(alpha = v.casingOpacity), style = casing)
                        val stroke = if (kind == MeeshyMapTraceKind.History) {
                            round
                        } else {
                            val phase = (flow?.value ?: 0f) * every
                            Stroke(round.width, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(DOT_LENGTH, every), -phase))
                        }
                        if (v.progress != null) drawPath(path, tint.copy(alpha = MeeshyMapTraceRecipe.UPCOMING_OPACITY), style = stroke)
                        drawPath(if (v.progress != null) done else path, tint, style = stroke)
                        if (v.progress != null) {
                            drawCircle(Color.White, radius = headRadius + ring, center = head)
                            drawCircle(tint, radius = headRadius, center = head)
                        }
                    }
                },
        )
        if (midLabel != null && v.showsMidLabel) {
            Box(
                Modifier
                    .offset(trace.midpoint.x.dp, trace.midpoint.y.dp)
                    .graphicsLayer { translationX = -size.width / 2f; translationY = -size.height / 2f }
                    .background(tokens.backgroundPrimary.copy(alpha = 0.92f), CircleShape)
                    .padding(horizontal = 10.dp, vertical = 4.dp)
                    .decorative(),
            ) {
                Text(midLabel, color = tokens.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}
