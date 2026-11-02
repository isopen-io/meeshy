package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerInputScope

/** Seuil de l'appui long qui fige une story — iOS `StoryGestureOverlayView` (200 ms). */
internal const val STORY_HOLD_MILLIS: Long = 200L

/**
 * Les gestes de la scène du lecteur : un tap court navigue (ou reprend une story figée),
 * un appui tenu [holdMillis] la fige, et le relâchement qui suit ne fait RIEN — la story
 * reste en pause jusqu'au tap suivant. Un geste emporté par le glisser (consommé) n'est
 * ni un tap ni un appui long.
 *
 * Un tap dont [isDoubleTapZone] vaut `true` (la bande centrale, iOS `StoryTapZone`) attend
 * un second toucher pendant le délai système du double toucher : s'il arrive, c'est
 * [onDoubleTap] ; sinon c'est un tap simple. Les bords, eux, partent sans attendre.
 */
internal suspend fun PointerInputScope.detectStoryCanvasTaps(
    holdMillis: Long = STORY_HOLD_MILLIS,
    isDoubleTapZone: (Offset) -> Boolean = { false },
    onDoubleTap: (Offset) -> Unit = {},
    onHold: () -> Unit,
    onTap: (Offset) -> Unit,
) {
    awaitEachGesture {
        awaitFirstDown()
        var cancelled = false
        val up = withTimeoutOrNull(holdMillis) {
            waitForUpOrCancellation().also { if (it == null) cancelled = true }
        }
        when {
            cancelled -> Unit
            up == null -> {
                onHold()
                waitForUpOrCancellation()?.consume()
            }
            !isDoubleTapZone(up.position) -> {
                up.consume()
                onTap(up.position)
            }
            else -> {
                up.consume()
                val second = withTimeoutOrNull(viewConfiguration.doubleTapTimeoutMillis) {
                    awaitFirstDown(requireUnconsumed = false)
                }
                if (second == null) {
                    onTap(up.position)
                } else {
                    waitForUpOrCancellation()?.consume()
                    onDoubleTap(up.position)
                }
            }
        }
    }
}
