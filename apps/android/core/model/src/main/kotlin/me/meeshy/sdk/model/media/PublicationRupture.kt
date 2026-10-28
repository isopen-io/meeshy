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
}

/** The one gesture that helps, never a menu of options. */
public enum class RuptureGesture { NONE, WAIT_FOR_NETWORK, RETRY, REPLACE_MISSING }

/**
 * A break told, not suffered (the `2j` doctrine applied to sending, #13429): what is missing, what is
 * intact, and the single useful gesture — never a bare « échec ». Pure.
 *
 * - a media whose bytes are gone can only be replaced, whatever the connection does;
 * - otherwise a connection that is down is waited for (a retry could not succeed);
 * - otherwise a failed publication is retried; one still on its way needs nothing.
 */
public data class PublicationRupture(val missing: Int, val intact: Int, val gesture: RuptureGesture) {
    public companion object {
        public fun of(fates: List<MediaFate>, failed: Boolean, offline: Boolean): PublicationRupture {
            val missing = fates.count { it == MediaFate.LOST }
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
