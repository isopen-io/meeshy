package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val VERTICAL_THRESHOLD = 120.dp

/** Courbe du commit du cube (iOS `StoryGroupCube.commitAnimation`). */
private val CubeCommitEasing = CubicBezierEasing(0.25f, 0.8f, 0.35f, 1f)
private const val CUBE_COMMIT_MS = 340

/** Amorti critique (iOS `settleAnimation`, réponse 0,3 s) : jamais de dépassement de l'autre côté. */
private val CubeSettleSpring = spring<Float>(dampingRatio = 1f, stiffness = 438.6f)

/** Retour de la carte tirée vers le bas (iOS `snapDragOffsetBack`, réponse 0,35 s, amorti 0,75). */
private val DismissSettleSpring = spring<Float>(dampingRatio = 0.75f, stiffness = 322.3f)

/** Sortie de la carte (iOS `dismissViewer`, réponse 0,5 s, amorti 0,82), lecteur fermé à 450 ms. */
private val DismissExitSpring = spring<Float>(dampingRatio = 0.82f, stiffness = 157.9f)
private const val DISMISS_CLOSE_DELAY_MS = 450L

/**
 * L'état du geste qui porte la carte du lecteur. Les valeurs animées ne sont lues qu'en
 * phase de dessin ; seul [dragging] est lu par la composition, deux fois par geste, pour
 * figer la lecture tant que le doigt tient la carte (iOS : pause état-dirigée par
 * `gestureAxis != 0`).
 */
@Stable
internal class StoryCardMotion {
    val offsetX = Animatable(0f)
    val dragY = Animatable(0f)
    val dismissal = Animatable(0f)
    var dragging by mutableStateOf(false)
    var transitioning = false
    var width = 0f
}

@Composable
internal fun rememberStoryCardMotion(): StoryCardMotion = remember { StoryCardMotion() }

/**
 * Un changement d'auteur qui ne vient pas d'un glissé (tap en bord, fin du dernier
 * segment) entre lui aussi en cube, par le côté du sens de lecture.
 */
@Composable
internal fun StoryCubeEntryOnAuthorChange(motion: StoryCardMotion, authorKey: String?, groupIndex: Int) {
    val previous = remember { intArrayOf(-1) }
    LaunchedEffect(authorKey) {
        val before = previous[0]
        previous[0] = groupIndex
        if (before < 0 || before == groupIndex || motion.transitioning || motion.width <= 0f) return@LaunchedEffect
        val side = if (groupIndex > before) motion.width else -motion.width
        motion.offsetX.snapTo(side)
        motion.offsetX.animateTo(0f, tween(CUBE_COMMIT_MS, easing = CubeCommitEasing))
    }
}

/** Le cadre de la carte : face de cube, réduction de la fermeture, voile d'ombre. */
internal fun Modifier.storyCardFrame(motion: StoryCardMotion): Modifier = this
    .onSizeChanged { motion.width = it.width.toFloat() }
    .graphicsLayer {
        val width = size.width
        val offset = motion.offsetX.value
        translationX = offset
        rotationY = StoryCubeTransform.faceDegrees(offset, width)
        transformOrigin = TransformOrigin(StoryCubeTransform.pivotFractionX(offset), 0.5f)
        cameraDistance = StoryCubeTransform.cameraDistance(width)
        val progress = StoryCubeTransform.dismissProgress(
            motion.dragY.value,
            StoryCubeTransform.DISMISS_TRAVEL_DP.dp.toPx(),
        )
        val leaving = motion.dismissal.value
        val scale = lerp(StoryCubeTransform.dismissScale(progress), 0.12f, leaving)
        scaleX = scale
        scaleY = scale
        translationY = lerp(motion.dragY.value, size.height * 0.35f, leaving)
        alpha = lerp(StoryCubeTransform.dismissAlpha(progress), 0f, leaving).coerceIn(0f, 1f)
        val corner = lerp(
            StoryCubeTransform.DISMISS_CORNER_DP * progress,
            StoryCubeTransform.DISMISSING_CORNER_DP,
            leaving,
        ).dp.toPx()
        clip = corner > 0f
        if (clip) shape = RoundedCornerShape(corner)
    }
    .drawWithContent {
        drawContent()
        val shade = StoryCubeTransform.shade(motion.offsetX.value, size.width)
        if (shade > 0f) drawRect(Color.Black, alpha = shade)
    }

/**
 * Le glissé de la carte : horizontal = changement d'auteur en cube, vertical vers le bas =
 * fermeture. L'axe est verrouillé au premier mouvement significatif ; une barre du rail
 * ouverte consomme le geste vertical qui franchit le seuil (elle se referme, rien d'autre).
 */
internal fun Modifier.storyCardDrag(
    motion: StoryCardMotion,
    scope: CoroutineScope,
    hasNextGroup: State<Boolean>,
    hasPreviousGroup: State<Boolean>,
    overlayActive: State<Boolean>,
    onOverlayDismiss: () -> Unit,
    onCommit: (StorySwipeAction) -> Unit,
    onCommitFeedback: () -> Unit,
): Modifier = pointerInput(motion) {
    val threshold = VERTICAL_THRESHOLD.toPx()
    val tracker = VelocityTracker()
    var axis = DragAxis.Undecided
    var rawX = 0f
    var rawY = 0f

    fun settle() {
        motion.dragging = false
        scope.launch {
            launch { motion.dragY.animateTo(0f, DismissSettleSpring) }
            motion.offsetX.animateTo(0f, CubeSettleSpring)
        }
    }

    fun commitAuthor(action: StorySwipeAction, exit: Float) {
        motion.transitioning = true
        onCommitFeedback()
        scope.launch {
            try {
                val remaining = 1f - abs(motion.offsetX.value / exit).coerceIn(0f, 1f)
                val exitMs = (CUBE_COMMIT_MS * remaining).toInt().coerceAtLeast(120)
                motion.offsetX.animateTo(exit, tween(exitMs, easing = CubeCommitEasing))
                onCommit(action)
                motion.offsetX.snapTo(-exit)
                motion.offsetX.animateTo(0f, tween(CUBE_COMMIT_MS, easing = CubeCommitEasing))
            } finally {
                motion.transitioning = false
                motion.dragging = false
            }
        }
    }

    fun dismiss() {
        motion.transitioning = true
        scope.launch {
            launch { motion.dismissal.animateTo(1f, DismissExitSpring) }
            delay(DISMISS_CLOSE_DELAY_MS)
            onCommit(StorySwipeAction.Dismiss)
        }
    }

    detectDragGestures(
        onDragStart = {
            rawX = 0f
            rawY = 0f
            axis = if (motion.transitioning) DragAxis.Ignored else DragAxis.Undecided
            tracker.resetTracking()
            if (axis != DragAxis.Ignored) motion.dragging = true
        },
        onDrag = { change, drag ->
            change.consume()
            if (axis == DragAxis.Ignored) return@detectDragGestures
            tracker.addPosition(change.uptimeMillis, change.position)
            rawX += drag.x
            rawY += drag.y
            if (axis == DragAxis.Undecided) {
                axis = if (abs(rawX) > abs(rawY)) DragAxis.Horizontal else DragAxis.Vertical
            }
            if (overlayActive.value) return@detectDragGestures
            val width = size.width.toFloat()
            scope.launch(start = CoroutineStart.UNDISPATCHED) {
                when (axis) {
                    DragAxis.Horizontal -> motion.offsetX.snapTo(
                        StoryGroupSwipeDecision.displayedTranslation(
                            rawX,
                            width,
                            hasNeighbor = if (rawX < 0f) hasNextGroup.value else hasPreviousGroup.value,
                        ),
                    )
                    DragAxis.Vertical -> motion.dragY.snapTo(rawY.coerceAtLeast(0f))
                    else -> Unit
                }
            }
        },
        onDragEnd = {
            if (axis == DragAxis.Ignored) return@detectDragGestures
            val velocity = tracker.calculateVelocity()
            val width = size.width.toFloat()
            when (axis) {
                DragAxis.Horizontal -> {
                    val outcome = if (overlayActive.value) {
                        StoryGroupSwipeOutcome.Cancel
                    } else {
                        StoryGroupSwipeDecision.decide(
                            translation = rawX,
                            predictedEnd = StoryGroupSwipeDecision.predictedEnd(rawX, velocity.x),
                            width = width,
                            hasNext = hasNextGroup.value,
                            hasPrevious = hasPreviousGroup.value,
                        )
                    }
                    when (outcome) {
                        StoryGroupSwipeOutcome.Next -> commitAuthor(StorySwipeAction.NextGroup, exit = -width)
                        StoryGroupSwipeOutcome.Previous -> commitAuthor(StorySwipeAction.PreviousGroup, exit = width)
                        StoryGroupSwipeOutcome.Cancel -> settle()
                    }
                }
                DragAxis.Vertical -> {
                    val predicted = StoryGroupSwipeDecision.predictedEnd(rawY, velocity.y)
                    when {
                        overlayActive.value -> {
                            if (StoryVerticalSwipeDecision.crossesThreshold(rawY, predicted, threshold)) onOverlayDismiss()
                            settle()
                        }
                        StoryVerticalSwipeDecision.dismisses(rawY, predicted, threshold) -> dismiss()
                        else -> settle()
                    }
                }
                else -> settle()
            }
        },
        onDragCancel = { if (axis != DragAxis.Ignored) settle() },
    )
}

private enum class DragAxis { Undecided, Horizontal, Vertical, Ignored }

private fun lerp(start: Float, stop: Float, fraction: Float): Float = start + (stop - start) * fraction
