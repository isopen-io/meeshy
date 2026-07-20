package me.meeshy.sdk.model

/**
 * Immutable registry of the live-location sessions active in one conversation — the pure
 * heart of what iOS scatters across `ConversationSocketManager.activeLiveLocations`
 * (the `started` / `updated` / `stopped` socket handlers maintain a `[userId: session]`
 * map). Keyed by `userId`, at most one session per participant; every transition returns
 * a new value so the store stays a testable reducer with no in-place mutation.
 *
 * Surpasses iOS on hygiene: [pruneExpired] and [active] drop lapsed sessions the moment
 * the clock passes their deadline (iOS keeps expired entries in the map until a `stopped`
 * event arrives), and [update] on an unknown user is an inert no-op rather than
 * resurrecting a session that never started.
 */
data class LiveLocationSessions(
    val sessions: Map<String, ActiveLiveLocation> = emptyMap(),
) {
    val isEmpty: Boolean get() = sessions.isEmpty()

    /** The session broadcast by [userId], or `null` when they are not sharing. */
    fun sessionFor(userId: String): ActiveLiveLocation? = sessions[userId]

    /**
     * Records the start of [session], replacing any prior session for the same user
     * (a fresh `started` event supersedes a stale window). Insertion order is preserved
     * for a stable render; re-starting an existing user keeps their slot.
     */
    fun start(session: ActiveLiveLocation): LiveLocationSessions =
        copy(sessions = sessions + (session.userId to session))

    /**
     * Applies a position update for [userId] — moves the pin, refreshes the motion
     * vector and stamps [atMillis] as the last-updated clock, **without** touching the
     * deadline (a live share cannot extend itself by moving). No-op when the user has no
     * active session. The fresh reading fully describes the current motion, so a `null`
     * [speed]/[heading] clears the previous value rather than lingering.
     */
    fun update(
        userId: String,
        latitude: Double,
        longitude: Double,
        atMillis: Long,
        speed: Double? = null,
        heading: Double? = null,
    ): LiveLocationSessions {
        val existing = sessions[userId] ?: return this
        val moved = existing.copy(
            latitude = latitude,
            longitude = longitude,
            speed = speed,
            heading = heading,
            lastUpdatedMillis = atMillis,
        )
        return copy(sessions = sessions + (userId to moved))
    }

    /** Ends [userId]'s share. No-op (same instance) when they were not sharing. */
    fun stop(userId: String): LiveLocationSessions =
        if (!sessions.containsKey(userId)) this else copy(sessions = sessions - userId)

    /**
     * The sessions still live at [nowEpochMillis], in registry order — the render list.
     * An expired session is filtered out even if a `stopped` event never arrived.
     */
    fun active(nowEpochMillis: Long): List<ActiveLiveLocation> =
        sessions.values.filterNot { it.isExpired(nowEpochMillis) }

    /**
     * Drops every session whose deadline has passed at [nowEpochMillis]. Returns the same
     * instance when nothing expired, so a periodic prune allocates nothing while all
     * shares remain live.
     */
    fun pruneExpired(nowEpochMillis: Long): LiveLocationSessions {
        val kept = sessions.filterValues { !it.isExpired(nowEpochMillis) }
        return if (kept.size == sessions.size) this else copy(sessions = kept)
    }

    companion object {
        val EMPTY = LiveLocationSessions()
    }
}
