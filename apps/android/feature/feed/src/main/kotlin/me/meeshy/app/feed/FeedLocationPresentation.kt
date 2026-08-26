package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.SharedPlace

/**
 * A shared place projected for the feed location sticker. Pure data — built by
 * [FeedPostLocationBuilder] so the label resolution stays unit-testable and the
 * Compose layer stays dumb.
 *
 * [label] is the human-readable place name, resolved name → address (mirror of iOS
 * `FeedPostLocationSticker.displayLabel`), or `null` when the place carries neither.
 * A `null` label is NOT an absent sticker: the cell renders the localized
 * "Position partagée" fallback so a hand-dropped pin still shows a sticker.
 */
@Immutable
data class FeedLocationPresentation(
    val label: String?,
    val latitude: Double,
    val longitude: Double,
)

object FeedPostLocationBuilder {

    /**
     * Project [place] for the feed location sticker, or `null` when the post carries
     * no location. The label prefers the place name, then the address, then `null`
     * (the cell supplies the localized fallback) — same precedence as iOS.
     */
    fun build(place: SharedPlace?): FeedLocationPresentation? {
        place ?: return null
        return FeedLocationPresentation(
            label = place.name?.takeIf { it.isNotBlank() }
                ?: place.address?.takeIf { it.isNotBlank() },
            latitude = place.latitude,
            longitude = place.longitude,
        )
    }
}
