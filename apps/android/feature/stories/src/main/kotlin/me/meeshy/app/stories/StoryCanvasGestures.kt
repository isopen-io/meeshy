package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.withTimeoutOrNull

/** Seuil de l'appui long qui fige une story — iOS `StoryGestureOverlayView` (200 ms). */
internal const val STORY_HOLD_MILLIS: Long = 200L

/**
 * Les gestes de la scène du lecteur, décidés par [StoryGestureDecisions] : un tap court navigue
 * (ou reprend une story figée au toucher, le relâchement suivant étant consommé), un appui tenu
 * [holdMillis] la fige et le relâchement ne fait RIEN, un glissé de plus de 14 dp n'est pas un tap,
 * une surface ouverte ou le composeur engagé reçoivent le premier toucher sans navigation.
 *
 * Un tap dans la bande centrale attend un second toucher pendant le délai système du double
 * toucher ; les bords, eux, partent sans attendre.
 */
internal suspend fun PointerInputScope.detectStoryCanvasTaps(
    holdMillis: Long = STORY_HOLD_MILLIS,
    context: () -> StoryGestureContext,
    onHold: () -> Unit,
    onAction: (StoryGestureAction) -> Unit,
) {
    val slopPx = StoryGestureDecisions.SLOP_DP.dp.toPx()
    awaitEachGesture {
        val width = size.width.toFloat()
        val down = awaitFirstDown()
        val base = context()
        val resuming = StoryGestureDecisions.decideTouchDown(base, down.position.x, width) ==
            StoryGestureAction.ResumeFromPause
        if (resuming) onAction(StoryGestureAction.ResumeFromPause)
        val touch = base.copy(isResumingTap = resuming)
        var cancelled = false
        var exceeded = false
        val up: PointerInputChange? = withTimeoutOrNull(holdMillis) {
            var released: PointerInputChange? = null
            var done = false
            while (!done) {
                val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id }
                when {
                    change == null || change.isConsumed -> { cancelled = true; done = true }
                    change.changedToUp() -> { released = change; done = true }
                    (change.position - down.position).getDistance() > slopPx -> { exceeded = true; done = true }
                }
            }
            released
        }
        when {
            cancelled -> Unit
            exceeded -> { waitForUpOrCancellation(); Unit }
            up == null -> {
                val engaged = touch.isComposerEngaged || touch.isSurfaceOpen
                if (!resuming && !engaged) onHold()
                val released = waitForUpOrCancellation()?.also { it.consume() }
                if (released != null) {
                    val held = touch.copy(holdActive = !resuming && !engaged)
                    onAction(StoryGestureDecisions.decideTouchUp(held, released.position.x, width, holdMillis))
                }
            }
            else -> {
                up.consume()
                val elapsed = up.uptimeMillis - down.uptimeMillis
                val immediate = resuming || touch.isComposerEngaged || touch.isSurfaceOpen ||
                    StoryTapZone.of(up.position.x, width) != StoryTapZone.Center
                if (immediate) {
                    onAction(StoryGestureDecisions.decideTouchUp(touch, up.position.x, width, elapsed))
                } else {
                    awaitDoubleTap(touch, up.position, width, onAction)
                }
            }
        }
    }
}

private suspend fun androidx.compose.ui.input.pointer.AwaitPointerEventScope.awaitDoubleTap(
    touch: StoryGestureContext,
    first: Offset,
    width: Float,
    onAction: (StoryGestureAction) -> Unit,
) {
    val second = withTimeoutOrNull(viewConfiguration.doubleTapTimeoutMillis) {
        awaitFirstDown(requireUnconsumed = false)
    } ?: return
    waitForUpOrCancellation()?.consume()
    onAction(StoryGestureDecisions.decideDoubleTap(touch, first.x, width))
}
