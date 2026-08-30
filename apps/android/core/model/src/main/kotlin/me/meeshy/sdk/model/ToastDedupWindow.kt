package me.meeshy.sdk.model

/**
 * Immutable, time-windowed dedup guard for the in-app real-time toast (feature-parity §M): the
 * "was this notification id already surfaced in the last [ttlMillis]" check that produces
 * [NotificationToastPolicy]'s `isDuplicateDelivery` boolean (an APN foreground delivery and the
 * socket `notification:new` fire for the same event within milliseconds).
 *
 * A faithful port of iOS `NotificationToastManager.recentNotificationIds` — a mutable
 * `Set<String>` plus one detached 2 s removal `Task` per id — expressed instead as a pure value
 * type. SOTA over iOS: no scheduled cleanup task per id (a burst of N notifications spawns N
 * coroutines there); expired ids are pruned lazily the next time any id is admitted, and the
 * whole thing is a clock-free building block whose every branch is unit-testable — the "when"
 * (the [nowMillis] to pass) belongs to the orchestrator.
 *
 * The window carries no capacity bound because pruning-on-admit already bounds it to the ids
 * seen within [ttlMillis]; the caller admits at most one id per real event, so it cannot grow
 * unbounded in practice.
 */
@ConsistentCopyVisibility
data class ToastDedupWindow private constructor(
    private val seenAtMillisById: Map<String, Long>,
    val ttlMillis: Long,
) {
    /** How many ids are currently tracked (expired ids are shed on the next [admit]). */
    val size: Int get() = seenAtMillisById.size

    /**
     * Records [notificationId] observed at [nowMillis] and reports whether it is a duplicate
     * within the window. Expired entries (`nowMillis - seenAt >= ttlMillis`, boundary exclusive
     * like iOS's 2 s removal) are pruned first; a still-fresh id is a duplicate and its ORIGINAL
     * timestamp stands (a duplicate never extends the window — parity with iOS, where the
     * removal task is scheduled once at first sight and never rescheduled). A blank id is never
     * deduplicated and never stored. Returns the same instance when nothing changed.
     */
    fun admit(notificationId: String, nowMillis: Long): AdmitResult {
        if (notificationId.isBlank()) return AdmitResult(this, isDuplicate = false)
        val fresh = seenAtMillisById.filterValues { nowMillis - it < ttlMillis }
        val isDuplicate = fresh.containsKey(notificationId)
        val next = if (isDuplicate) fresh else fresh + (notificationId to nowMillis)
        val window = if (next == seenAtMillisById) this else copy(seenAtMillisById = next)
        return AdmitResult(window, isDuplicate)
    }

    /** The pruned+updated [window] and whether the admitted id was a [isDuplicate]. */
    data class AdmitResult(val window: ToastDedupWindow, val isDuplicate: Boolean)

    companion object {
        /** iOS `NotificationToastManager` dedup window: 2 s. */
        const val DEFAULT_TTL_MILLIS: Long = 2_000L

        fun empty(ttlMillis: Long = DEFAULT_TTL_MILLIS): ToastDedupWindow {
            require(ttlMillis > 0) { "ttlMillis must be > 0, was $ttlMillis" }
            return ToastDedupWindow(emptyMap(), ttlMillis)
        }
    }
}
