package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallSwipeDismissRule
import me.meeshy.sdk.model.call.CallSwipeOutcome

private const val PREDICTION_SECONDS = 0.25f

/**
 * Le glissé vers le bas qui réduit l'appel : l'écran suit le doigt sur 300 dp, revient si le
 * geste est relâché avant 75 % de la course, se réduit sinon (ou sur un lancer franc). La
 * décision est [CallSwipeDismissRule] ; ce modificateur ne fait que l'exécuter. Inerte quand
 * [enabled] est faux (appel de groupe, panneau ouvert, appel non réductible).
 */
@Composable
internal fun Modifier.callSwipeToMinimize(
    enabled: Boolean,
    isGroup: Boolean = false,
    isPanelOpen: Boolean = false,
    onMinimize: () -> Unit,
): Modifier {
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val offsetPx = remember { Animatable(0f) }
    val currentMinimize = rememberUpdatedState(onMinimize)
    val dragModifier = if (enabled) {
        Modifier.pointerInput(isGroup, isPanelOpen) {
            val tracker = VelocityTracker()
            var travelled = 0f
            detectVerticalDragGestures(
                onDragStart = {
                    tracker.resetTracking()
                    travelled = 0f
                },
                onDragEnd = {
                    val velocity = tracker.calculateVelocity().y
                    val outcome = CallSwipeDismissRule.outcome(
                        translation = travelled / density.density,
                        predictedTranslation = (travelled + velocity * PREDICTION_SECONDS) / density.density,
                        isGroup = isGroup,
                        isPanelOpen = isPanelOpen,
                    )
                    scope.launch {
                        offsetPx.animateTo(0f, spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMedium))
                    }
                    if (outcome == CallSwipeOutcome.Minimize) currentMinimize.value()
                },
                onDragCancel = { scope.launch { offsetPx.animateTo(0f) } },
                onVerticalDrag = { change, dy ->
                    tracker.addPosition(change.uptimeMillis, change.position)
                    travelled += dy
                    val followed = CallSwipeDismissRule.offset(travelled / density.density, isGroup, isPanelOpen)
                    scope.launch { offsetPx.snapTo(followed * density.density) }
                },
            )
        }
    } else {
        Modifier
    }
    return this
        .graphicsLayer { translationY = offsetPx.value }
        .then(dragModifier)
}
