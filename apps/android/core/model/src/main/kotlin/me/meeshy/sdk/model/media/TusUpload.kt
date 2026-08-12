package me.meeshy.sdk.model.media

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.MediaAttachmentWire
import java.util.Base64

/**
 * The `uploadcontext` a TUS upload is destined for — the gateway (`@tus/server`,
 * `services/gateway/src/routes/uploads/tus-handler.ts`) creates a `PostMedia` row
 * (pending, `postId`/`commentId` null until claimed) for exactly these four wire
 * strings (`isPostMediaUploadContext`, `services/gateway/src/services/posts/
 * mediaOwnership.ts`) and a `MessageAttachment` for anything else — a genuinely
 * different collection with its own id space. A `mediaId` referenced by
 * `CreatePostRequest`/`CreateStoryRequest.mediaIds` is claimed **exclusively**
 * against `PostMedia`, so only a [TusUploadContext]-tagged upload can ever be
 * legitimately attached to a post/story/status/comment.
 */
public enum class TusUploadContext(public val wire: String) {
    POST("post"),
    STORY("story"),
    STATUS("status"),
    COMMENT("comment"),
    ;

    public companion object {
        /** Inverse of [wire] — `null` for anything the gateway would not recognise. */
        public fun fromWire(raw: String): TusUploadContext? = entries.firstOrNull { it.wire == raw }
    }
}

/**
 * Pure builder for the TUS `Upload-Metadata` request header (protocol: comma-joined
 * `key base64(value)` pairs, RFC — see the [tus.io resumable upload protocol](https://
 * tus.io/protocols/resumable-upload#upload-metadata)). Byte-for-byte mirror of iOS
 * `TusUploadManager.postCreateUpload`'s inline construction so both clients speak the
 * identical wire format the shared gateway parses (`upload.metadata?.filename`/
 * `filetype`/`uploadcontext`, same file).
 *
 * Kept pure and JVM-testable in `:core:model`: no Android runtime, no network — the
 * actual two-call HTTP exchange (`POST` create, `PATCH` data) is `:sdk-core`'s
 * `TusUploadRepository`.
 */
public object TusUploadMetadata {
    /** The only TUS protocol version the gateway's `@tus/server` speaks. */
    public const val TUS_RESUMABLE_VERSION: String = "1.0.0"

    public fun headerValue(fileName: String, mimeType: String, context: TusUploadContext): String =
        listOf(
            "filename" to fileName,
            "filetype" to mimeType,
            "uploadcontext" to context.wire,
        ).joinToString(",") { (key, value) -> "$key ${encode(value)}" }

    private fun encode(value: String): String = Base64.getEncoder().encodeToString(value.toByteArray())
}

/**
 * Wire envelope of the gateway's TUS `onUploadFinish` response body —
 * `{ success: true, data: { attachment: {...} } }` — for **both** a `PostMedia`- and
 * a `MessageAttachment`-backed upload (`tus-handler.ts` returns the identical shape
 * either way, so [MediaAttachmentWire] — already the domain mapping for `POST
 * /attachments/upload`'s per-item shape — is reused verbatim rather than duplicated).
 */
@Serializable
public data class TusUploadFinishData(val attachment: MediaAttachmentWire? = null)

/**
 * One PATCH-sized slice of a TUS upload body: the half-open byte range
 * `[offset, offset + length)` of the source bytes. [isFinal] marks the slice whose
 * successful PATCH response carries the gateway's `onUploadFinish` JSON body
 * ([TusUploadFinishData]) — per the [tus.io protocol](https://tus.io/protocols/
 * resumable-upload), every other slice gets a bare `204 No Content` (headers only,
 * no body) until the upload reaches its declared length.
 */
public data class TusChunkRange(
    public val offset: Long,
    public val length: Long,
    public val isFinal: Boolean,
)

/**
 * Pure chunk-boundary computation for a TUS upload body, splitting it into
 * PATCH-sized pieces of at most a caller-chosen size each. Port of iOS
 * `TusUploadManager`'s own fixed-size chunking loop (its `chunkSize`: 10 MB) — this
 * object only computes WHERE each chunk starts/ends, so that decision stays
 * JVM-testable without a network; the actual sequential PATCH loop lives in
 * `:sdk-core`'s `TusUploadRepository`.
 */
public object TusChunkPlan {
    /**
     * Splits [totalBytes] into ordered, contiguous, non-overlapping ranges of at most
     * [chunkSize] bytes each. Always returns at least one range — even for
     * `totalBytes == 0` (a single zero-length final range; a zero-byte file still
     * needs one PATCH to reach the gateway's `onUploadFinish` hook). The last range
     * is the only one with [TusChunkRange.isFinal] `true`.
     */
    public fun chunks(totalBytes: Long, chunkSize: Long): List<TusChunkRange> {
        require(chunkSize > 0) { "chunkSize must be positive, was $chunkSize" }
        require(totalBytes >= 0) { "totalBytes must not be negative, was $totalBytes" }

        if (totalBytes == 0L) return listOf(TusChunkRange(offset = 0L, length = 0L, isFinal = true))

        val ranges = mutableListOf<TusChunkRange>()
        var offset = 0L
        while (offset < totalBytes) {
            val length = minOf(chunkSize, totalBytes - offset)
            val chunkStart = offset
            offset += length
            ranges += TusChunkRange(offset = chunkStart, length = length, isFinal = offset >= totalBytes)
        }
        return ranges
    }
}
