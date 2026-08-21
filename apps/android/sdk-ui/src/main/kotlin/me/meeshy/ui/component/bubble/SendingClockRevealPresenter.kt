package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.SendLifecycleResolver
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Whether the online in-flight clock glyph should be shown yet — the
 * coverage-exempt Compose glue behind the pure
 * [SendLifecycleResolver.shouldRevealSendingGlyph]. Mirrors iOS
 * `BubbleDeliveryCheck.SendingClockGlyph`: a send that round-trips faster than
 * [SendLifecycleResolver.SENDING_REVEAL_DELAY_MILLIS] never flashes a clock the
 * user has no time to perceive, but a send that genuinely lingers past the window
 * reveals it via a one-shot [delay].
 *
 * Follows the same [produceState] + [delay] shape as [rememberBubbleRenderKind]
 * so the debounce reads consistently with the ephemeral tick loop. Applies ONLY to
 * the online clock ([DeliveryStatus.Pending]); the offline outbox hourglass and
 * every settled tier render immediately, so this presenter is never consulted for
 * them.
 */
@Composable
internal fun rememberSendingGlyphRevealed(sendStartedAtIso: String?): Boolean {
    val startMillis: Long? = remember(sendStartedAtIso) {
        isoToEpochMillisOrNull(sendStartedAtIso)
    }

    val revealed by produceState(
        initialValue = SendLifecycleResolver.shouldRevealSendingGlyph(
            sendStartedAtMillis = startMillis,
            nowMillis = System.currentTimeMillis(),
        ),
        startMillis,
    ) {
        if (value || startMillis == null) return@produceState
        val remaining = SendLifecycleResolver.SENDING_REVEAL_DELAY_MILLIS -
            (System.currentTimeMillis() - startMillis)
        if (remaining > 0) delay(remaining)
        value = true
    }

    return revealed
}
