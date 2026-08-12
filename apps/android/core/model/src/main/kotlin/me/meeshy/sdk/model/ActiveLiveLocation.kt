package me.meeshy.sdk.model

/**
 * A live-location session in progress — port of iOS `ActiveLiveLocation`
 * (`LocationModels.swift`). One participant broadcasting their moving position until
 * a fixed deadline. Keyed by [userId] (iOS `id == userId`), so a conversation holds at
 * most one live session per user.
 *
 * The expiry/remaining derivations take an explicit `now` (epoch millis) rather than
 * reading the wall clock, keeping the model a pure, fully-testable value — the Compose
 * badge supplies `System.currentTimeMillis()` and re-ticks each second.
 */
data class ActiveLiveLocation(
    val userId: String,
    val username: String,
    val latitude: Double,
    val longitude: Double,
    val speed: Double? = null,
    val heading: Double? = null,
    val expiresAtMillis: Long,
    val startedAtMillis: Long,
    val lastUpdatedMillis: Long,
) {
    /** Stable identity for list rendering — matches iOS `id = userId`. */
    val id: String get() = userId

    /** iOS `isExpired`: `now >= expiresAt` — the deadline is inclusive. */
    fun isExpired(nowEpochMillis: Long): Boolean = nowEpochMillis >= expiresAtMillis

    /** iOS `remainingTime`: `max(0, expiresAt - now)` — never negative past the deadline. */
    fun remainingMillis(nowEpochMillis: Long): Long =
        (expiresAtMillis - nowEpochMillis).coerceAtLeast(0L)

    companion object {
        /**
         * Builds a session that starts at [startedAtMillis] and expires
         * [durationMinutes] later — the reduction of a `LiveLocationStartedEvent` whose
         * server timestamps are absent, so the deadline is derived from the requested
         * window. A non-positive [durationMinutes] collapses to an already-expired
         * session (deadline == start), so a bogus window never grants an endless share.
         */
        fun startingAt(
            userId: String,
            username: String,
            latitude: Double,
            longitude: Double,
            durationMinutes: Int,
            startedAtMillis: Long,
            speed: Double? = null,
            heading: Double? = null,
        ): ActiveLiveLocation {
            val window = durationMinutes.coerceAtLeast(0) * 60_000L
            return ActiveLiveLocation(
                userId = userId,
                username = username,
                latitude = latitude,
                longitude = longitude,
                speed = speed,
                heading = heading,
                expiresAtMillis = startedAtMillis + window,
                startedAtMillis = startedAtMillis,
                lastUpdatedMillis = startedAtMillis,
            )
        }
    }
}
