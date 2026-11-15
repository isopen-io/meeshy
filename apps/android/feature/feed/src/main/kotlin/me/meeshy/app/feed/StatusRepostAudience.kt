package me.meeshy.app.feed

import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.composer.StoryRepostAudience

/**
 * The audience law of a mood republication — the PROJECTION of [StoryRepostAudience] (the one Kotlin mirror of
 * `allowedRepostVisibilities`, `packages/shared/utils/repost-audience.ts`) onto the audiences a mood can carry. The
 * gateway enforces it (403 `REPOST_AUDIENCE_WIDENING`); this only caps the picker.
 *
 * `EXCEPT` / `ONLY` cannot be expressed by this composer (no user picker), so an original under them reduces to
 * `PRIVATE`; an absent or unknown audience reads as the most restrictive one, never as the backend's `PUBLIC` default. A
 * `BLOOD` mood is never republished (RG-18): no audience at all.
 */
internal object StatusRepostAudience {

    /** The audiences a republisher may choose; the first is the widest, hence the initial one. Empty: not republishable. */
    fun allowed(original: String?): List<StatusVisibility> {
        val source = StatusVisibility.entries.firstOrNull { it.wire == original?.uppercase() }
            ?: return listOf(StatusVisibility.PRIVATE)
        return StoryRepostAudience.allowed(StoryVisibility.fromWire(source.wire))
            .mapNotNull { allowed -> StatusVisibility.entries.firstOrNull { it.wire == allowed.wire } }
    }

    /** A republication with no audience to choose is not offered at all: no button for an empty choice. */
    fun isRepublishable(original: String?): Boolean = allowed(original).isNotEmpty()
}
