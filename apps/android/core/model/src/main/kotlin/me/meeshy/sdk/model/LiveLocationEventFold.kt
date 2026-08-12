package me.meeshy.sdk.model

/**
 * Folds the live-location socket events into the [LiveLocationSessions] reducer — the
 * pure port of the three `ConversationSocketHandler` sinks that iOS scatters across its
 * `activeLiveLocations` book-keeping (`liveLocationStarted` builds + replaces a session,
 * `liveLocationUpdated` moves an existing pin, `liveLocationStopped` removes it).
 *
 * The wire dates arrive as ISO-8601 strings; each is resolved through the shared
 * [isoToEpochMillisOrNull] and, when absent or unparseable, replaced with the reference
 * `nowMillis` the caller supplies — the same fallbacks iOS applies with `Date()`
 * (`expiresAt ?? now + durationMinutes·60`, `startedAt ?? now`, `timestamp ?? now`).
 * Threading `now` in keeps the fold pure and testable off the wall clock.
 */
object LiveLocationEventFold {

    private const val MILLIS_PER_MINUTE = 60_000L

    /**
     * Records a `location:live-started` event, replacing any prior session for the same
     * user. The deadline uses the server `expiresAt` when present, else `now` plus the
     * requested window (a non-positive window collapses to `now`, so a bogus duration
     * never grants an endless share).
     */
    fun started(
        sessions: LiveLocationSessions,
        event: LiveLocationStartedEvent,
        nowMillis: Long,
    ): LiveLocationSessions {
        val startedAt = isoToEpochMillisOrNull(event.startedAt) ?: nowMillis
        val window = event.durationMinutes.coerceAtLeast(0) * MILLIS_PER_MINUTE
        val expiresAt = isoToEpochMillisOrNull(event.expiresAt) ?: (nowMillis + window)
        return sessions.start(
            ActiveLiveLocation(
                userId = event.userId,
                username = event.username,
                latitude = event.latitude,
                longitude = event.longitude,
                expiresAtMillis = expiresAt,
                startedAtMillis = startedAt,
                lastUpdatedMillis = startedAt,
            ),
        )
    }

    /**
     * Applies a `location:live-updated` event — moves the pin and refreshes the motion
     * vector, stamping the server `timestamp` (or `now` when absent) as the last-updated
     * clock without touching the deadline. Inert for an unknown user.
     */
    fun updated(
        sessions: LiveLocationSessions,
        event: LiveLocationUpdatedEvent,
        nowMillis: Long,
    ): LiveLocationSessions =
        sessions.update(
            userId = event.userId,
            latitude = event.latitude,
            longitude = event.longitude,
            atMillis = isoToEpochMillisOrNull(event.timestamp) ?: nowMillis,
            speed = event.speed,
            heading = event.heading,
        )

    /** Applies a `location:live-stopped` event — ends the user's share. Inert when absent. */
    fun stopped(
        sessions: LiveLocationSessions,
        event: LiveLocationStoppedEvent,
    ): LiveLocationSessions = sessions.stop(event.userId)
}
