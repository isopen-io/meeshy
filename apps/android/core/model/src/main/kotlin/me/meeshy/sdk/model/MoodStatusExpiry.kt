package me.meeshy.sdk.model

/**
 * Pure expiry law for ephemeral mood statuses — the Android port of
 * `StatusEntry.timeRemaining` (StoryModels.swift) and the gateway rule
 * `STATUS_EXPIRY_HOURS = 1` (PostService.ts).
 *
 * A status expires **one hour** after creation (NOT the 21h STORY rule — the two
 * were conflated in an early parity note). The gateway delivers `expiresAt`
 * authoritatively; this law treats it as the source of truth and only derives
 * `createdAt + 1h` as a fallback when the server omits it. `now` is injected so
 * the law is deterministic and unit-testable — the badge re-derives it off the
 * clock. Localised wording ("expired", "… remaining") stays app-side; this
 * returns only the numeric shape plus a [Tier], mirroring [LiveLocationCountdown].
 */
object MoodStatusExpiry {

    /** The status time-to-live in hours (gateway `STATUS_EXPIRY_HOURS`). */
    const val STATUS_EXPIRY_HOURS: Long = 1L

    private const val MILLIS_PER_HOUR: Long = 60L * 60L * 1_000L

    /** Which magnitude band the remaining time falls in — drives the label shape. */
    enum class Tier {
        /** Already past the deadline — no numeric label (app shows "expired"). */
        EXPIRED,

        /** Under a minute left — `"Xs"` (`"42s"`). */
        SECONDS,

        /** A minute or more left — `"Xmin"` (`"5min"`). */
        MINUTES,
    }

    /**
     * The remaining time as whole [totalSeconds] plus its display [tier]. iOS floors
     * to whole seconds and shows only a seconds- or minutes-magnitude label.
     */
    data class Remaining(
        val totalSeconds: Long,
        val tier: Tier,
    ) {
        /** Whole minutes remaining (floored). */
        val minutes: Long get() = totalSeconds / 60L

        /** The numeric label, or `null` when expired (the app localises "expired"). */
        val label: String?
            get() = when (tier) {
                Tier.EXPIRED -> null
                Tier.SECONDS -> "${totalSeconds}s"
                Tier.MINUTES -> "${minutes}min"
            }
    }

    /**
     * The effective expiry instant in epoch-millis: the explicit [expiresAt] when it
     * parses, else [createdAt] `+ 1h`, else `null` when no reliable timestamp exists.
     */
    fun effectiveExpiresAtMillis(createdAt: String?, expiresAt: String?): Long? {
        isoToEpochMillisOrNull(expiresAt)?.let { return it }
        val created = isoToEpochMillisOrNull(createdAt) ?: return null
        return created + STATUS_EXPIRY_HOURS * MILLIS_PER_HOUR
    }

    /**
     * Whether the status has expired at [nowMillis]. A status with no derivable
     * timestamp is never treated as expired (we never hide content we cannot date).
     */
    fun isExpired(createdAt: String?, expiresAt: String?, nowMillis: Long): Boolean {
        val effective = effectiveExpiresAtMillis(createdAt, expiresAt) ?: return false
        return effective <= nowMillis
    }

    /**
     * The remaining-time breakdown at [nowMillis], or `null` when no timestamp is
     * derivable. Mirrors iOS `timeRemaining`: `<= 0` → [Tier.EXPIRED], `< 60s` →
     * [Tier.SECONDS], otherwise [Tier.MINUTES].
     */
    fun remaining(createdAt: String?, expiresAt: String?, nowMillis: Long): Remaining? {
        val effective = effectiveExpiresAtMillis(createdAt, expiresAt) ?: return null
        val remainingMillis = effective - nowMillis
        if (remainingMillis <= 0L) return Remaining(totalSeconds = 0L, tier = Tier.EXPIRED)
        val totalSeconds = remainingMillis / 1_000L
        val tier = if (totalSeconds < 60L) Tier.SECONDS else Tier.MINUTES
        return Remaining(totalSeconds = totalSeconds, tier = tier)
    }
}
