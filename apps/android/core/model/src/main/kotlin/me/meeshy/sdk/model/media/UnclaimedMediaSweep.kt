package me.meeshy.sdk.model.media

import java.time.Duration
import java.time.Instant

/**
 * The gateway sweeps every media no publication claimed after [WINDOW] (`cleanupOrphanedPostMedia`,
 * #8012). A media uploaded while composing is therefore safe only until the composition is published
 * or abandoned: a draft picked up after the window holds ids that no longer exist, and publishing it
 * would lose those media without a word (iOS #5086 names the same danger).
 *
 * The law only ever condemns what is CERTAIN: a media was uploaded no later than the draft was
 * saved, so a draft saved at least [WINDOW] ago holds only swept ids. A missing or unreadable date
 * condemns nothing.
 */
public object UnclaimedMediaSweep {

    public val WINDOW: Duration = Duration.ofHours(24)

    public fun hasSweptMediaUploadedBefore(savedAt: Instant?, now: Instant): Boolean =
        savedAt != null && !Duration.between(savedAt, now).minus(WINDOW).isNegative

    public fun hasSweptMediaUploadedBeforeIso(savedAtIso: String?, now: Instant): Boolean =
        hasSweptMediaUploadedBefore(savedAtIso?.let { runCatching { Instant.parse(it) }.getOrNull() }, now)
}
