package me.meeshy.sdk.model.cache

import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persisted cursor of an infinite-scroll surface — the Android mirror of iOS
 * `PaginationCursor`. Stored beside the cached items so a cold start resumes scrolling from
 * the deepest position the user reached instead of refetching page 1.
 *
 * [nextCursor] is the opaque handle the gateway returned (typically the last item's id);
 * [hasMore] tells "ran out of items" from "haven't paged yet". The JSON keys are the iOS ones.
 */
@Serializable
public data class PaginationCursor(
    val nextCursor: String? = null,
    val hasMore: Boolean,
) {
    public fun toJson(): String = codec.encodeToString(this)

    public companion object {
        private val codec = Json { ignoreUnknownKeys = true }

        /** The stored cursor, or `null` when none was stored or the payload is unreadable. */
        public fun fromJson(raw: String?): PaginationCursor? {
            if (raw.isNullOrBlank()) return null
            return try {
                codec.decodeFromString<PaginationCursor>(raw)
            } catch (_: SerializationException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            }
        }
    }
}
