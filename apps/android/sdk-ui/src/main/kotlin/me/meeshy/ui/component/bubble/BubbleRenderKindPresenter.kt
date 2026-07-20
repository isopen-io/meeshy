package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import java.time.Instant
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.BubbleRenderKind
import me.meeshy.sdk.model.EphemeralLifecycle
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Live [BubbleRenderKind.Kind] for a bubble — the coverage-exempt Compose glue behind
 * the pure [BubbleRenderKind.resolve]. A deleted message and a consumed view-once
 * message both resolve immediately (server-authoritative, no clock read); an ephemeral
 * message ticks [EphemeralLifecycle.evaluate] each second until it reaches
 * [EphemeralLifecycle.State.Expired], at which point the bubble collapses.
 *
 * Mirrors the tick loop of [EphemeralCountdownBadge] (same SSOT parsing +
 * [EphemeralLifecycle]) so the badge and the collapse stay in lock-step.
 */
@Composable
internal fun rememberBubbleRenderKind(
    isDeleted: Boolean,
    expiresAtIso: String?,
    isViewOnce: Boolean = false,
    viewOnceCount: Int = 0,
): BubbleRenderKind.Kind {
    if (isDeleted) return BubbleRenderKind.Kind.Deleted
    if (isViewOnce && viewOnceCount > 0) return BubbleRenderKind.Kind.Burned

    val expiresAt: Instant? = remember(expiresAtIso) {
        isoToEpochMillisOrNull(expiresAtIso)?.let(Instant::ofEpochMilli)
    }
    if (expiresAt == null) return BubbleRenderKind.Kind.Standard

    val ephemeral by produceState<EphemeralLifecycle.State>(
        initialValue = EphemeralLifecycle.evaluate(expiresAt, Instant.now()),
        expiresAt,
    ) {
        while (true) {
            val next = EphemeralLifecycle.evaluate(expiresAt, Instant.now())
            value = next
            if (next is EphemeralLifecycle.State.Expired) break
            delay(1_000)
        }
    }

    return BubbleRenderKind.resolve(isDeleted = false, ephemeral = ephemeral)
}
