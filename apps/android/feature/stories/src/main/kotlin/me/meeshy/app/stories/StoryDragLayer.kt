package me.meeshy.app.stories

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.animation.core.tween
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.hypot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * La session plein écran du lecteur — iOS `isFullscreenStorySession`. Un seul drapeau : le chrome n'est pas un état à
 * part, il se déduit du plein écran et du toucher qui fige la story ([StoryFullscreenChrome]).
 */
@Stable
internal class StoryFullscreenSession {
    var enabled by mutableStateOf(false)
        private set

    fun set(enabled: Boolean) {
        this.enabled = enabled
    }

    fun toggle() = set(!enabled)
}

/**
 * Les cadres que le glissé consulte à son départ : le rail et le composeur épinglé sont publiés par le lecteur, la
 * barre de réactions est lue au moment du geste. Hors composition d'état : lus une fois par glissé.
 */
@Stable
internal class StoryDragFrameSource {
    var originInRoot: Offset = Offset.Zero
    var size: IntSize = IntSize.Zero
    var railRegion: StoryDragRegion? = null
    var railShown: Boolean = false
    var composerHeightPx: Int = 0
    var hasScrollableSurface: Boolean = false
    var scrollableSurfaceTop: Float? = null

    fun snapshot(reactionBar: StoryDragRegion?): StoryDragFrames {
        val composer = composerHeightPx.takeIf { it > 0 }?.let {
            StoryDragRegion(
                left = originInRoot.x,
                top = originInRoot.y + size.height - it,
                right = originInRoot.x + size.width,
                bottom = originInRoot.y + size.height,
            )
        }
        return StoryDragFrames(
            rail = railRegion.takeIf { railShown },
            reactionBar = reactionBar,
            composer = composer,
            scrollableSurfaceTop = scrollableSurfaceTop.takeIf { hasScrollableSurface },
            hasScrollableSurface = hasScrollableSurface,
        )
    }
}

/** Publie le cadre du rail d'actions, que le glissé du lecteur ne doit jamais emporter. */
internal fun Modifier.trackStoryRailRegion(source: StoryDragFrameSource): Modifier = onGloballyPositioned {
    val bounds = it.boundsInRoot()
    source.railRegion = StoryDragRegion(bounds.left, bounds.top, bounds.right, bounds.bottom)
}

/** Le cadre de la barre de réactions ou de langues ouverte, en coordonnées racine ; `null` quand elle est fermée. */
internal fun StoryRailController.openBarRegion(): StoryDragRegion? {
    val tiles = when {
        reactionBarVisible -> reactionTileBounds.values
        languageBarVisible -> languageTileBounds.values
        else -> return null
    }
    return tiles.map { StoryDragRegion(it.left, it.top, it.right, it.bottom) }.reduceOrNull(StoryDragRegion::union)
}

/** Le décalage horizontal que la couche de glissé confie au cube d'auteurs, en pixels (négatif = vers l'auteur suivant). */
internal val StoryCardMotion.cubeOffsetX: Float get() = offsetX.value

/**
 * Un axe collé ne gèle jamais la lecture : un changement de slide libère l'axe, et la fin de la composition purge tout
 * (iOS `releaseAxis` + `resetGestureTracking`). La pause pendant le glissé suit l'axe, jamais un événement.
 */
@Composable
internal fun StoryDragAxisRelease(motion: StoryCardMotion, groupIndex: Int, index: Int) {
    LaunchedEffect(groupIndex, index) {
        motion.tracker.releaseAxis()
        if (!motion.transitioning) motion.dragging = false
    }
    DisposableEffect(motion) { onDispose { motion.tracker.reset() } }
}

/** Le rail et le composeur épinglé sont déclarés à chaque recomposition : un cadre périmé ne fait jamais céder un geste. */
@Composable
internal fun StoryDragFrameSync(source: StoryDragFrameSource, railShown: Boolean, composerHeightPx: Int, hasScrollableSurface: Boolean) {
    SideEffect {
        source.railShown = railShown
        source.composerHeightPx = composerHeightPx
        source.hasScrollableSurface = hasScrollableSurface
    }
}

/**
 * Le glissé unifié du lecteur — iOS `unifiedDragGesture`. Distance minimale 15 dp, axe décidé à 8 dp : horizontal =
 * changement d'auteur en cube ; bas = la carte suit le doigt puis se ferme (120 dp ou prédiction ×2,5) ; haut = session
 * plein écran ; bas en plein écran = retour fenêtré. Il CÈDE au rail, au composeur, à la barre de réactions (axe
 * horizontal) et à tout panneau défilant d'après son point de départ ([StoryReaderDragOwnership]). Une surface ouverte
 * consomme le glissé vertical : elle se ferme, la story reste (état photographié à la décision de l'axe).
 */
internal fun Modifier.storyDragLayer(
    motion: StoryCardMotion,
    scope: CoroutineScope,
    frames: StoryDragFrameSource,
    reactionBar: () -> StoryDragRegion?,
    hasNextGroup: State<Boolean>,
    hasPreviousGroup: State<Boolean>,
    surfaceOpen: State<Boolean>,
    composerEngaged: State<Boolean>,
    onDismissSurfaces: () -> Unit,
    onCommit: (StorySwipeAction) -> Unit,
    onCommitFeedback: () -> Unit,
): Modifier = this
    .onGloballyPositioned {
        frames.originInRoot = it.positionInRoot()
        frames.size = it.size
    }
    .pointerInput(motion) {
        val tracker = motion.tracker
        val threshold = StoryVerticalGestureDecisions.THRESHOLD_DP.dp.toPx()
        val minimumDistance = StoryReaderDragTracker.MINIMUM_DISTANCE_DP.dp.toPx()
        val toDp = 1f / density
        val velocityTracker = VelocityTracker()
        var rawX = 0f
        var rawY = 0f
        var engaged = false
        var ignored = false

        fun purge() {
            tracker.reset()
            motion.resetToken = tracker.resetToken
            motion.dragging = false
        }

        fun settle(resetTracking: Boolean) {
            if (resetTracking) purge() else motion.dragging = false
            scope.launch {
                launch { motion.dragY.animateTo(0f, DismissSettleSpring) }
                motion.offsetX.animateTo(0f, CubeSettleSpring)
                if (!motion.transitioning) motion.cubeNeighborsMounted = false
            }
        }

        fun commitAuthor(action: StorySwipeAction, exit: Float) {
            purge()
            motion.dragging = true
            motion.transitioning = true
            motion.cubeNeighborsMounted = true
            onCommitFeedback()
            scope.launch {
                try {
                    val remaining = 1f - abs(motion.offsetX.value / exit).coerceIn(0f, 1f)
                    val exitMs = (CUBE_COMMIT_MS * remaining).toInt().coerceAtLeast(MINIMUM_COMMIT_MS)
                    motion.offsetX.animateTo(exit, tween(exitMs, easing = CubeCommitEasing))
                    delay((StoryGroupCubeGeometry.SWAP_DELAY_MILLIS - exitMs).coerceAtLeast(0).toLong())
                    motion.entryPlayed = true
                    onCommit(action)
                    motion.offsetX.snapTo(0f)
                } finally {
                    motion.transitioning = false
                    motion.dragging = false
                    motion.cubeNeighborsMounted = false
                }
            }
        }

        fun dismiss() {
            purge()
            motion.dragging = true
            motion.transitioning = true
            scope.launch {
                launch { motion.dismissal.animateTo(1f, DismissExitSpring) }
                delay(DISMISS_CLOSE_DELAY_MS)
                onCommit(StoryVerticalGestureAction.DismissViewer.toSwipeAction())
            }
        }

        fun concludeVertical(hadFeature: Boolean, predictedY: Float) {
            when (
                StoryVerticalGestureDecisions.decide(
                    translationY = rawY,
                    predictedY = predictedY,
                    isFullscreen = motion.fullscreen.enabled,
                    threshold = threshold,
                    hasActiveFeature = hadFeature,
                )
            ) {
                StoryVerticalGestureAction.DismissViewer -> dismiss()
                StoryVerticalGestureAction.DismissActiveFeature -> { onDismissSurfaces(); settle(resetTracking = false) }
                StoryVerticalGestureAction.EnterFullscreen -> { onCommitFeedback(); motion.fullscreen.set(true); settle(resetTracking = false) }
                StoryVerticalGestureAction.ExitFullscreen -> { onCommitFeedback(); motion.fullscreen.set(false); settle(resetTracking = false) }
                StoryVerticalGestureAction.Cancel, StoryVerticalGestureAction.None -> settle(resetTracking = false)
            }
        }

        fun concludeHorizontal(hadFeature: Boolean, predictedX: Float) {
            val width = size.width.toFloat()
            val outcome = if (hadFeature) {
                StoryGroupSwipeOutcome.Cancel
            } else {
                StoryGroupSwipeDecision.decide(
                    translation = rawX,
                    predictedEnd = predictedX,
                    width = width,
                    hasNext = hasNextGroup.value,
                    hasPrevious = hasPreviousGroup.value,
                )
            }
            when (outcome) {
                StoryGroupSwipeOutcome.Next -> commitAuthor(StorySwipeAction.NextGroup, exit = -width)
                StoryGroupSwipeOutcome.Previous -> commitAuthor(StorySwipeAction.PreviousGroup, exit = width)
                StoryGroupSwipeOutcome.Cancel -> settle(resetTracking = true)
            }
        }

        detectDragGestures(
            onDragStart = { start ->
                rawX = 0f
                rawY = 0f
                engaged = false
                velocityTracker.resetTracking()
                tracker.releaseAxis()
                motion.entryPlayed = false
                ignored = motion.transitioning || composerEngaged.value
                tracker.owner = if (ignored) {
                    StoryDragOwner.Reader
                } else {
                    val root = start + frames.originInRoot
                    StoryReaderDragOwnership.ownerAt(root.x, root.y, frames.snapshot(reactionBar()))
                }
                if (StoryReaderDragOwnership.yieldsEverything(tracker.owner)) ignored = true
            },
            onDrag = { change, drag ->
                if (ignored) return@detectDragGestures
                change.consume()
                velocityTracker.addPosition(change.uptimeMillis, change.position)
                rawX += drag.x
                rawY += drag.y
                if (!engaged) {
                    if (hypot(rawX, rawY) < minimumDistance) return@detectDragGestures
                    engaged = true
                }
                val axis = tracker.track(
                    dx = rawX * toDp,
                    dy = rawY * toDp,
                    featureAtStart = surfaceOpen.value,
                    horizontalYields = StoryReaderDragOwnership.yieldsHorizontalAxis(tracker.owner),
                )
                motion.dragging = tracker.isInFlight
                val width = size.width.toFloat()
                scope.launch(start = CoroutineStart.UNDISPATCHED) {
                    when {
                        axis == StoryDragAxis.Horizontal && !surfaceOpen.value -> {
                            motion.cubeNeighborsMounted = true
                            motion.offsetX.snapTo(
                                StoryGroupSwipeDecision.displayedTranslation(
                                    rawX,
                                    width,
                                    hasNeighbor = if (rawX < 0f) hasNextGroup.value else hasPreviousGroup.value,
                                ),
                            )
                        }
                        axis == StoryDragAxis.Vertical && !tracker.hadActiveFeature -> motion.dragY.snapTo(rawY.coerceAtLeast(0f))
                        else -> Unit
                    }
                }
            },
            onDragEnd = {
                if (ignored) return@detectDragGestures
                val velocity = velocityTracker.calculateVelocity()
                val ended = tracker.finish()
                motion.dragging = false
                when (ended.axis) {
                    StoryDragAxis.Horizontal ->
                        concludeHorizontal(ended.hadActiveFeature || surfaceOpen.value, StoryGroupSwipeDecision.predictedEnd(rawX, velocity.x))
                    StoryDragAxis.Vertical ->
                        concludeVertical(ended.hadActiveFeature, StoryGroupSwipeDecision.predictedEnd(rawY, velocity.y))
                    StoryDragAxis.Undecided -> settle(resetTracking = true)
                }
            },
            onDragCancel = { if (!ignored) settle(resetTracking = true) },
        )
    }

private const val MINIMUM_COMMIT_MS = 120
