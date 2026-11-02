package me.meeshy.sdk.model.media

/** What became of one media of a publication the device holds. */
public enum class MediaFate {
    /** Already on the gateway. */
    UPLOADED,

    /** Bytes held on the device, upload queued or in flight. */
    WAITING,

    /** The gateway refused it; bytes still on the device. */
    REFUSED,

    /** Bytes gone (swept, evicted) — it cannot be sent any more. */
    LOST,

    /**
     * Refused on the device because its location cannot be removed (#13550): the same bytes would be refused on every retry,
     * so it can only be replaced, like a [LOST] one.
     */
    LOCATION_REFUSED,
}

/** The one gesture that helps, never a menu of options. */
public enum class RuptureGesture { NONE, WAIT_FOR_NETWORK, RETRY, REPLACE_MISSING }

/**
 * A break told, not suffered (the `2j` doctrine applied to sending, #13429): what is missing, what is
 * intact, and the single useful gesture — never a bare « échec ». Pure.
 *
 * - a media whose bytes are gone, or whose location cannot be removed, can only be replaced, whatever the connection does;
 * - otherwise a connection that is down is waited for (a retry could not succeed);
 * - otherwise a failed publication is retried; one still on its way needs nothing.
 */
public data class PublicationRupture(val missing: Int, val intact: Int, val gesture: RuptureGesture) {
    public companion object {
        public fun of(fates: List<MediaFate>, failed: Boolean, offline: Boolean): PublicationRupture {
            val missing = fates.count { it == MediaFate.LOST || it == MediaFate.LOCATION_REFUSED }
            val gesture = when {
                missing > 0 -> RuptureGesture.REPLACE_MISSING
                offline && (failed || fates.any { it == MediaFate.WAITING }) -> RuptureGesture.WAIT_FOR_NETWORK
                failed -> RuptureGesture.RETRY
                else -> RuptureGesture.NONE
            }
            return PublicationRupture(missing = missing, intact = fates.size - missing, gesture = gesture)
        }
    }
}
