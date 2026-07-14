package me.meeshy.sdk.model

import java.time.Instant

/**
 * Pure lifecycle logic for an ephemeral (self-destruct) message — a direct port of
 * iOS `BubbleEphemeralLifecycle` (`BubbleEphemeralLifecycle.swift`). The ticking
 * `Timer.publish` lives in the Compose consumer; the state derivation and the
 * countdown formatting are pure so they can be fully unit-tested off the clock.
 */
object EphemeralLifecycle {

    /** The countdown state derived from an expiry deadline and the current instant. */
    sealed interface State {
        /** The message is still live; [remainingSeconds] seconds remain before expiry. */
        data class Running(val remainingSeconds: Double) : State

        /** The deadline has passed — the message should be treated as burned. */
        data object Expired : State

        /** The message carries no expiry — it never self-destructs. */
        data object None : State
    }

    /**
     * Derives the countdown [State] from an [expiresAt] deadline and the current
     * instant [now] — mirrors iOS `State.evaluate(expiresAt:now:)`:
     *
     * - `null` deadline → [State.None].
     * - `remaining <= 0` (deadline reached or passed) → [State.Expired].
     * - otherwise → [State.Running] with the remaining seconds (fractional, matching
     *   iOS `TimeInterval`).
     */
    fun evaluate(expiresAt: Instant?, now: Instant): State {
        if (expiresAt == null) return State.None
        val remaining = (expiresAt.toEpochMilli() - now.toEpochMilli()) / 1_000.0
        return if (remaining <= 0.0) State.Expired else State.Running(remaining)
    }

    /**
     * Compact countdown label — port of iOS `format(remaining:)`:
     *
     * - `< 10s` → the raw seconds (`"7s"`); a fractional remaining truncates toward
     *   zero and a negative remaining clamps to `"0s"`.
     * - the minute band → `"1m 05s"` (unpadded minutes, zero-padded seconds).
     * - the hour band → `"2h 03m"` (seconds dropped once hours appear).
     */
    fun format(remainingSeconds: Double): String {
        val total = maxOf(0, remainingSeconds.toInt())
        if (total < 10) return "${total}s"
        val hours = total / 3_600
        val minutes = (total % 3_600) / 60
        val seconds = total % 60
        return when {
            hours > 0 -> "%dh %02dm".format(hours, minutes)
            minutes > 0 -> "%dm %02ds".format(minutes, seconds)
            else -> "${seconds}s"
        }
    }
}
