package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable

@Immutable
sealed class DeliveryStatus {
    @Immutable data object Pending : DeliveryStatus()
    @Immutable data object Sent : DeliveryStatus()
    @Immutable data object Delivered : DeliveryStatus()
    @Immutable data object Read : DeliveryStatus()
    @Immutable data object Failed : DeliveryStatus()
}

/** The kind of media a quoted-reply target carries, for previewing a media-only reply. */
@Immutable
public enum class ReplyMediaKind { None, Image, File }

/**
 * Frozen preview of the post/story a message replies to — port of the
 * story/mood branch of iOS `BubbleQuotedReply`. A non-null [moodEmoji] means the
 * quoted target is a mood/status (emoji + preview text render); otherwise it is
 * a story reply (thumbnail + reaction/comment/share metrics).
 */
@Immutable
public data class BubbleStoryReply(
    val previewText: String = "",
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
    val shareCount: Int = 0,
    val thumbnailUrl: String? = null,
    val moodEmoji: String? = null,
) {
    /** True when the quoted target is a mood/status rather than a story. */
    val isMood: Boolean get() = moodEmoji != null

    /** True when at least one engagement metric is worth surfacing. */
    val hasMetrics: Boolean get() = reactionCount > 0 || commentCount > 0 || shareCount > 0
}

@Immutable
data class ReactionEntry(
    val emoji: String,
    val count: Int,
    val includesMe: Boolean = false,
)

@Immutable
public data class BubbleImage(
    val attachmentId: String,
    val url: String,
    val thumbnailUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
)

@Immutable
public data class BubbleFile(
    val attachmentId: String,
    val name: String?,
    val sizeBytes: Int? = null,
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

@Immutable
public data class BubbleContent(
    val messageId: String,
    val text: String,
    val isOutgoing: Boolean,
    val isTranslated: Boolean,
    val isShowingOriginal: Boolean = false,
    val originalText: String?,
    val senderName: String?,
    val showSenderName: Boolean,
    val isEdited: Boolean,
    val isDeleted: Boolean,
    val createdAtIso: String?,
    val deliveryStatus: DeliveryStatus = DeliveryStatus.Sent,
    val reactions: List<ReactionEntry> = emptyList(),
    val replyToId: String? = null,
    val replyToText: String? = null,
    val replyToSenderName: String? = null,
    val replyToDeleted: Boolean = false,
    val replyToMediaKind: ReplyMediaKind = ReplyMediaKind.None,
    val replyToThumbnailUrl: String? = null,
    val storyReply: BubbleStoryReply? = null,
    val isPending: Boolean = false,
    val clientMessageId: String? = null,
    val images: List<BubbleImage> = emptyList(),
    val files: List<BubbleFile> = emptyList(),
    val locations: List<BubbleLocation> = emptyList(),
    val emojiOnlyCount: Int = 0,
    val pinnedAtIso: String? = null,
    val isForwarded: Boolean = false,
    val isStarred: Boolean = false,
)
