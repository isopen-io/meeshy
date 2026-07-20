package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * A successfully uploaded media item — the domain value a composer references
 * when attaching media to a story or post. Its [id] is the gateway attachment id
 * used as a `mediaId` in `CreateStoryRequest.mediaIds`; [url] is the access URL.
 * Image/video metadata ([width]/[height]/[durationMs]/[thumbnailUrl]) is surfaced
 * when present so a preview can render at the correct aspect/length.
 *
 * Port of iOS `AttachmentUploader`'s upload response, but carries the [id] (which
 * iOS discards, since it references media by URL) because stories reference media
 * by id.
 */
data class UploadedMedia(
    val id: String,
    val url: String,
    val mimeType: String,
    val fileSize: Long,
    val width: Int?,
    val height: Int?,
    val durationMs: Long?,
    val thumbnailUrl: String?,
)

/** Wire envelope for `POST /attachments/upload` — `{ attachments: [...] }`. */
@Serializable
data class MediaUploadResponse(
    val attachments: List<MediaAttachmentWire> = emptyList(),
)

/**
 * Wire shape of one uploaded attachment (a subset of `messageAttachmentSchema`).
 * Only the id matters for referencing; every field is defaulted/nullable so a
 * sparse gateway payload never fails decoding.
 */
@Serializable
data class MediaAttachmentWire(
    val id: String = "",
    val fileUrl: String? = null,
    val mimeType: String? = null,
    val fileSize: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
    val duration: Long? = null,
    val thumbnailUrl: String? = null,
)

/** Octet-stream fallback when the gateway omits (or blanks) a MIME type. */
const val DEFAULT_MEDIA_MIME_TYPE: String = "application/octet-stream"

/**
 * Maps a wire attachment to its domain [UploadedMedia], or `null` when the
 * payload can't be used to reference media: a blank [id] (can't be a `mediaId`)
 * or a blank/absent [fileUrl] (nothing to display). A blank [mimeType] collapses
 * to [DEFAULT_MEDIA_MIME_TYPE]; a negative [fileSize] collapses to `0`; blank
 * thumbnail and zero-or-negative dimensions/duration collapse to `null` so a
 * preview never renders a degenerate value.
 */
fun MediaAttachmentWire.toUploadedMedia(): UploadedMedia? {
    val mediaId = id.takeIf { it.isNotBlank() } ?: return null
    val mediaUrl = fileUrl?.takeIf { it.isNotBlank() } ?: return null
    return UploadedMedia(
        id = mediaId,
        url = mediaUrl,
        mimeType = mimeType?.takeIf { it.isNotBlank() } ?: DEFAULT_MEDIA_MIME_TYPE,
        fileSize = fileSize?.takeIf { it >= 0 } ?: 0L,
        width = width?.takeIf { it > 0 },
        height = height?.takeIf { it > 0 },
        durationMs = duration?.takeIf { it > 0 },
        thumbnailUrl = thumbnailUrl?.takeIf { it.isNotBlank() },
    )
}
