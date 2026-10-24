package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable

@Immutable
public data class BubbleImage(
    val attachmentId: String,
    val url: String,
    val thumbnailUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    /** Author-authored accessibility description (`MessageAttachment.alt`, #6813). Read by TalkBack as `contentDescription`. */
    val alt: String? = null,
)

@Immutable
public data class BubbleFile(
    val attachmentId: String,
    val name: String?,
    val sizeBytes: Int? = null,
    val url: String? = null,
    val isVideo: Boolean = false,
    val isContactCard: Boolean = false,
)

/**
 * A shared contact card (vCard attachment). [name] is the card's display name when known, else
 * the attachment's file name without extension; [accountUsername] is the resolved Meeshy account
 * handle (without `@`) when the contact is registered.
 */
@Immutable
public data class BubbleContactCard(
    val attachmentId: String,
    val name: String? = null,
    val accountUsername: String? = null,
)

/**
 * A shared-location attachment (mime `application/x-location`) — port of the
 * `.location` branch of iOS `BubbleAttachmentView`. Coordinates are nullable so a
 * malformed location still renders a "position shared" placeholder rather than
 * collapsing into a generic file row.
 */
@Immutable
public data class BubbleLocation(
    val attachmentId: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val placeName: String? = null,
) {
    /** True when both coordinates are present and the point can be shown/opened. */
    val hasCoordinates: Boolean get() = latitude != null && longitude != null

    /**
     * A `geo:` URI to hand to an external maps app, or null when coordinates are
     * absent. `Double.toString()` is locale-independent (always a `.` separator),
     * so the URI is safe to build in any locale. A non-blank [placeName] is added
     * as the standard `(label)` suffix.
     */
    val geoUri: String? get() {
        val lat = latitude ?: return null
        val lon = longitude ?: return null
        val base = "geo:$lat,$lon?q=$lat,$lon"
        val label = placeName?.trim()?.ifBlank { null }
        return if (label != null) "$base($label)" else base
    }
}

/**
 * An audio-message attachment (an `audio/…` mime) — port of the `.audio` branch of
 * iOS `BubbleAttachmentView` / `AudioPlayerView`. The transcription is resolved
 * through the Prisme Linguistique at build time: [transcriptionText] already holds
 * the text in the viewer's preferred language when a matching translation exists,
 * otherwise the original transcription. [url] is null until the audio is available
 * locally, in which case [sizeBytes] drives a "needs download" affordance instead.
 */
@Immutable
public data class BubbleAudio(
    val attachmentId: String,
    val url: String? = null,
    val durationSeconds: Int? = null,
    val sizeBytes: Int? = null,
    val transcriptionText: String? = null,
    val transcriptionLanguage: String? = null,
    val isTranscriptionTranslated: Boolean = false,
    val isAudioTranslated: Boolean = false,
    val audioLanguage: String? = null,
) {
    /** True when the audio has a playable URL (already downloaded / remote-ready). */
    val isPlayable: Boolean get() = !url.isNullOrBlank()

    /** True when a non-blank transcription line is worth surfacing under the player. */
    val hasTranscription: Boolean get() = !transcriptionText.isNullOrBlank()

    /**
     * Human-readable `m:ss` duration (unpadded minutes, zero-padded seconds — the
     * same shape as iOS `String(format: "%d:%02d", …)`), or null when the duration
     * is unknown or negative (a malformed value never renders a nonsense label).
     */
    val formattedDuration: String? get() {
        val total = durationSeconds ?: return null
        if (total < 0) return null
        val minutes = total / 60
        val seconds = total % 60
        return "$minutes:${seconds.toString().padStart(2, '0')}"
    }
}
