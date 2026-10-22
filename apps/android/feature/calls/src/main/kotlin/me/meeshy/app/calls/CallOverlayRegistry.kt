package me.meeshy.app.calls

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Knows every registered [CallOverlay] and answers, for a slot and a snapshot of
 * the call, which of them are on screen and in which order. The decision is pure
 * (no Compose) so it is proven off-device; [CallOverlaySlotHost] is its thin
 * projection.
 *
 * Inside a slot overlays are ordered by descending priority, then by id. A
 * replacing slot ([CallOverlaySlot.replacing]) keeps only the first of the visible
 * ones — a higher-priority overlay replaces a lower one the moment it becomes
 * visible, and the lower one comes back when it goes away.
 */
@Singleton
class CallOverlayRegistry @Inject constructor(
    overlays: Set<@JvmSuppressWildcards CallOverlay>,
) {
    private val bySlot: Map<CallOverlaySlot, List<CallOverlay>> = overlays
        .sortedWith(compareByDescending<CallOverlay> { it.priority }.thenBy { it.id })
        .groupBy { it.slot }

    /** The overlays to draw in [slot] for [state], first = top-most / winning. */
    fun visible(slot: CallOverlaySlot, state: CallUiState): List<CallOverlay> {
        val showing = bySlot[slot].orEmpty().filter { isShowing(it, state) }
        return if (slot.replacing) showing.take(1) else showing
    }

    /** An overlay that cannot decide is hidden, never a crash of the call screen. */
    private fun isShowing(overlay: CallOverlay, state: CallUiState): Boolean =
        runCatching { overlay.isVisible(state) }.getOrDefault(false)
}

/**
 * Draws the overlays of one [slot], or nothing at all when there are none — an
 * empty slot adds no node, so a screen with no capability registered lays out
 * exactly as it did before the extension point existed. [modifier] places the
 * slot's container (the screen decides the geometry, the overlays fill it).
 */
@Composable
fun CallOverlaySlotHost(
    registry: CallOverlayRegistry,
    slot: CallOverlaySlot,
    context: CallOverlayContext,
    modifier: Modifier = Modifier,
) {
    val visible = registry.visible(slot, context.state)
    if (visible.isEmpty()) return
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        visible.forEach { overlay ->
            key(overlay.id) { overlay.Content(context) }
        }
    }
}
