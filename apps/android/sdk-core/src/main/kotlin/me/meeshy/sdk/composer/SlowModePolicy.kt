package me.meeshy.sdk.composer

import me.meeshy.sdk.model.MemberRole

/**
 * Immutable verdict describing whether a conversation's slow mode throttles the
 * viewer's composer, and how long until the next send is allowed.
 *
 * - [isActive] — slow mode is configured *and* applies to this viewer (an exempt
 *   moderator is never active). Drives the subtle slow-mode indicator.
 * - [canSend] — the composer's send action is currently allowed.
 * - [remainingSeconds] — whole seconds left on the cooldown (ceil), `0` when
 *   [canSend]. The ceiling guarantees the countdown never reads `0` while the
 *   send is still blocked.
 */
public data class SlowModeState(
    val isActive: Boolean,
    val canSend: Boolean,
    val remainingSeconds: Int,
) {
    public companion object {
        /** Slow mode off, or the viewer is exempt: send always allowed, no countdown. */
        public val UNTHROTTLED: SlowModeState =
            SlowModeState(isActive = false, canSend = true, remainingSeconds = 0)
    }
}

/**
 * Pure cooldown math for a conversation's slow mode. Stateless — the "when to
 * recompute / tick the countdown" orchestration lives app-side in the chat
 * ViewModel and its Compose screen.
 *
 * SOTA over iOS: iOS surfaces `slowModeSeconds` only in the admin settings picker
 * and never throttles the composer itself, so a member can fire messages faster
 * than the configured interval and let the server reject them. Android enforces
 * the interval at the source of truth and shows a live countdown.
 */
public object SlowModePolicy {

    private const val MILLIS_PER_SECOND = 1_000L

    /**
     * True when [role] bypasses slow mode. A conversation's moderators, admins and
     * creators keep an unthrottled composer (parity with the server, which exempts
     * them). An unknown/absent role decodes to [MemberRole.MEMBER] and is throttled.
     */
    public fun isExemptRole(role: String?): Boolean =
        MemberRole.from(role).hasMinimumRole(MemberRole.MODERATOR)

    /**
     * Evaluate the composer's slow-mode posture.
     *
     * @param slowModeSeconds the conversation's configured interval; `null`/`<= 0` = off.
     * @param lastSelfSentAtMillis when the viewer last sent in this conversation; `null` = never.
     * @param nowMillis the current clock reading.
     * @param isExempt whether the viewer's role bypasses slow mode (see [isExemptRole]).
     */
    public fun evaluate(
        slowModeSeconds: Int?,
        lastSelfSentAtMillis: Long?,
        nowMillis: Long,
        isExempt: Boolean,
    ): SlowModeState {
        val interval = slowModeSeconds ?: 0
        if (interval <= 0 || isExempt) return SlowModeState.UNTHROTTLED
        if (lastSelfSentAtMillis == null) {
            return SlowModeState(isActive = true, canSend = true, remainingSeconds = 0)
        }
        val elapsedMillis = (nowMillis - lastSelfSentAtMillis).coerceAtLeast(0L)
        val intervalMillis = interval.toLong() * MILLIS_PER_SECOND
        if (elapsedMillis >= intervalMillis) {
            return SlowModeState(isActive = true, canSend = true, remainingSeconds = 0)
        }
        val remainingMillis = intervalMillis - elapsedMillis
        val remainingSeconds =
            ((remainingMillis + MILLIS_PER_SECOND - 1) / MILLIS_PER_SECOND).toInt()
        return SlowModeState(isActive = true, canSend = false, remainingSeconds = remainingSeconds)
    }
}
