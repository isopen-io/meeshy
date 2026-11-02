package me.meeshy.ui.appearance

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.InfiniteTransition
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.tan
import me.meeshy.sdk.model.appearance.FrameMotionLayerPlan
import me.meeshy.sdk.model.appearance.FrameMotionPlan
import me.meeshy.sdk.model.appearance.FrameMotionStep
import me.meeshy.sdk.model.appearance.FrameStepDirection
import me.meeshy.sdk.model.appearance.FrameStepKind
import me.meeshy.sdk.model.appearance.FrameSweepPlan

/*
 * FrameMotionLayers (#10935) — l'exécuteur Compose d'un [FrameMotionPlan] (miroir de `FrameMotionLayers.swift`).
 * Chaque couche du plan devient un arbre de boîtes, un porteur par mouvement ancré à son origine, le dessin
 * au cœur. UNE seule [InfiniteTransition] porte toutes les horloges, et chaque valeur n'est lue qu'en phase
 * de couche ou de dessin (`graphicsLayer`, `drawWithContent`) : AUCUNE recomposition par image, transform et
 * opacité seuls. Le reflet glisse sous un masque à la forme de ses cibles.
 *
 * La décision de mouvement vit dans [FrameVisibility] : interdit ⇒ le cadre fixe (couches au repos), hors
 * écran ou en arrière-plan ⇒ aucune horloge ne tourne.
 */

private const val TWO_PHASES = 2
private const val SWEEP_TRAVEL = 0.55f
private const val SWEEP_SKEW_DEGREES = -24f
private const val SHEEN_BAND_FRACTION = 0.3f
private const val SHEEN_BAND_MIN = 8f
private const val SHEEN_PEAK_ALPHA = 0.55f
private val SweepGlide = CubicBezierEasing(0.45f, 0.05f, 0.35f, 1f)

/**
 * Dessine le plan d'un cadre. [drawElements] dessine les éléments désignés, dans le repère du dessin
 * ([viewBoxWidth] × [viewBoxHeight]) ; le contenu fixe du cadre (les éléments hors [FrameMotionPlan.animated])
 * reste au dessin de l'appelant, sous cette boîte.
 */
@Composable
public fun FrameMotionLayers(
    plan: FrameMotionPlan,
    viewBoxWidth: Float,
    viewBoxHeight: Float,
    drawElements: DrawScope.(List<Int>) -> Unit,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
) {
    if (plan.isStill) return
    val gate = rememberFrameMotionGate(animates)
    val geometry = ViewBox(viewBoxWidth, viewBoxHeight)
    Box(modifier.then(gate.modifier)) {
        if (gate.run == FrameMotionRun.RUNNING) {
            val transition = rememberInfiniteTransition(label = "frame-motion")
            key(plan) {
                val clock = MotionClock(
                    steps = plan.layers.map { layer -> layer.chain.map { transition.stepProgress(it) } },
                    sweeps = plan.sweeps.map { transition.sweepProgress(it) },
                )
                MotionTree(plan, clock, geometry, drawElements)
            }
        } else {
            MotionTree(plan, MotionClock.rest(plan), geometry, drawElements)
        }
    }
}

private class ViewBox(val width: Float, val height: Float)

private class MotionClock(val steps: List<List<State<Float>>>, val sweeps: List<State<Float>>) {
    companion object {
        private val Zero = object : State<Float> {
            override val value: Float = 0f
        }

        fun rest(plan: FrameMotionPlan) = MotionClock(
            steps = plan.layers.map { layer -> layer.chain.map { Zero } },
            sweeps = emptyList(),
        )
    }
}

@Composable
private fun MotionTree(
    plan: FrameMotionPlan,
    clock: MotionClock,
    box: ViewBox,
    drawElements: DrawScope.(List<Int>) -> Unit,
) {
    plan.layers.forEachIndexed { index, layer ->
        StepHost(layer, clock.steps[index], 0, box) {
            Spacer(Modifier.fillMaxSize().drawBehind { scaledToViewBox(box) { drawElements(layer.elements) } })
        }
    }
    plan.sweeps.forEachIndexed { index, sweep ->
        clock.sweeps.getOrNull(index)?.let { progress ->
            Spacer(Modifier.fillMaxSize().sweepLayer(sweep, progress, box, drawElements))
        }
    }
}

@Composable
private fun StepHost(
    layer: FrameMotionLayerPlan,
    progress: List<State<Float>>,
    index: Int,
    box: ViewBox,
    content: @Composable () -> Unit,
) {
    val step = layer.chain.getOrNull(index)
    if (step == null) {
        content()
        return
    }
    Box(Modifier.fillMaxSize().stepModifier(step, progress[index], box)) {
        StepHost(layer, progress, index + 1, box, content)
    }
}

private fun DrawScope.scaledToViewBox(box: ViewBox, block: DrawScope.() -> Unit) {
    if (box.width <= 0f || box.height <= 0f) return
    scale(size.width / box.width, size.height / box.height, pivot = Offset.Zero, block = block)
}

private fun Modifier.stepModifier(step: FrameMotionStep, progress: State<Float>, box: ViewBox): Modifier {
    val pivotX = if (box.width > 0f) (step.origin.x / box.width).toFloat() else 0.5f
    val pivotY = if (box.height > 0f) (step.origin.y / box.height).toFloat() else 0.5f
    return when (step.kind) {
        FrameStepKind.ROTATE -> graphicsLayer {
            transformOrigin = TransformOrigin(pivotX, pivotY)
            rotationZ = stepValue(step, progress.value)
        }
        FrameStepKind.PULSE -> graphicsLayer {
            transformOrigin = TransformOrigin(pivotX, pivotY)
            val scale = stepValue(step, progress.value)
            scaleX = scale
            scaleY = scale
        }
        FrameStepKind.TWINKLE -> graphicsLayer { alpha = stepValue(step, progress.value) }
        FrameStepKind.SKEW -> drawWithContent {
            val matrix = Matrix().apply { values[Matrix.SkewX] = tan(Math.toRadians(stepValue(step, progress.value).toDouble())).toFloat() }
            withTransform({
                translate(pivotX * size.width, pivotY * size.height)
                transform(matrix)
                translate(-pivotX * size.width, -pivotY * size.height)
            }) { this@drawWithContent.drawContent() }
        }
    }
}

/** La valeur d'un mouvement à l'avancement [progress] (0..1) : de `from` à `to`, échangés quand le sens est inversé. */
internal fun stepValue(step: FrameMotionStep, progress: Float): Float {
    val swapped = step.direction == FrameStepDirection.REVERSE || step.direction == FrameStepDirection.ALTERNATE_REVERSE
    val (from, to) = if (swapped) step.to to step.from else step.from to step.to
    return (from + (to - from) * progress).toFloat()
}

/** Pulsation et scintillement vont-et-viennent en une demi-durée ; rotation et inclinaison selon leur sens. */
internal fun isAutoReversing(step: FrameMotionStep): Boolean = when (step.kind) {
    FrameStepKind.PULSE, FrameStepKind.TWINKLE -> true
    FrameStepKind.ROTATE, FrameStepKind.SKEW ->
        step.direction == FrameStepDirection.ALTERNATE || step.direction == FrameStepDirection.ALTERNATE_REVERSE
}

internal fun stepDurationMillis(step: FrameMotionStep): Int {
    val seconds = when (step.kind) {
        FrameStepKind.PULSE, FrameStepKind.TWINKLE -> step.duration / TWO_PHASES
        FrameStepKind.ROTATE, FrameStepKind.SKEW -> step.duration
    }
    return (seconds * 1000).roundToInt().coerceAtLeast(1)
}

@Composable
private fun InfiniteTransition.stepProgress(step: FrameMotionStep): State<Float> = animateFloat(
    initialValue = 0f,
    targetValue = 1f,
    animationSpec = infiniteRepeatable(
        animation = tween(stepDurationMillis(step), easing = if (step.linear) LinearEasing else EaseInOut),
        repeatMode = if (isAutoReversing(step)) RepeatMode.Reverse else RepeatMode.Restart,
        initialStartOffset = StartOffset((step.delay * 1000).roundToInt()),
    ),
    label = "frame-step",
)

@Composable
private fun InfiniteTransition.sweepProgress(sweep: FrameSweepPlan): State<Float> {
    val total = (sweep.duration * 1000).roundToInt().coerceAtLeast(2)
    return animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = total
                0f at 0 using SweepGlide
                1f at (total * SWEEP_TRAVEL).roundToInt().coerceIn(1, total - 1)
                1f at total
            },
            repeatMode = RepeatMode.Restart,
            initialStartOffset = StartOffset((sweep.delay * 1000).roundToInt()),
        ),
        label = "frame-sweep",
    )
}

/** Le reflet : un bandeau incliné qui traverse la boîte, découpé à la forme de ses cibles. */
private fun Modifier.sweepLayer(
    sweep: FrameSweepPlan,
    progress: State<Float>,
    box: ViewBox,
    drawElements: DrawScope.(List<Int>) -> Unit,
): Modifier = graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawBehind {
    val band = max(size.height * SHEEN_BAND_FRACTION, SHEEN_BAND_MIN)
    val start = -band * 1.5f
    val end = start + size.width + band * 3f
    val p = progress.value
    val x = if (sweep.reverse) end + (start - end) * p else start + (end - start) * p
    val skew = Matrix().apply { values[Matrix.SkewX] = tan(Math.toRadians(SWEEP_SKEW_DEGREES.toDouble())).toFloat() }
    withTransform({
        translate(x, size.height / 2)
        transform(skew)
        translate(0f, -size.height / 2)
    }) {
        drawRect(
            brush = Brush.horizontalGradient(
                colors = listOf(Color.White.copy(alpha = 0f), Color.White.copy(alpha = SHEEN_PEAK_ALPHA), Color.White.copy(alpha = 0f)),
                startX = 0f,
                endX = band,
            ),
            size = androidx.compose.ui.geometry.Size(band, size.height),
        )
    }
    drawIntoCanvas { canvas ->
        canvas.saveLayer(Rect(0f, 0f, size.width, size.height), Paint().apply { blendMode = BlendMode.DstIn })
        scaledToViewBox(box) { drawElements(sweep.elements) }
        canvas.restore()
    }
}
