package me.meeshy.sdk.story

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreateStoryRequest

/**
 * The second half of the durable upload→publish chain (ARCHITECTURE.md §5): when
 * a media-upload outbox row is delivered, the gateway hands back the real
 * `mediaId`, which must be grafted into every still-queued story publish that was
 * enqueued **before** the upload finished.
 *
 * A media story queued offline carries the prerequisite upload's `cmid` as a
 * **placeholder** in its `mediaIds` (the real id is unknowable at enqueue time);
 * [graft] swaps that placeholder for the real id the moment the upload lands, so
 * the gated publish delivers with the correct id. Surpasses iOS, which uploads
 * synchronously and cannot queue a media story while offline.
 *
 * Pure and total: it decodes a [CreateStoryRequest] payload, rewrites its media
 * list and re-encodes, returning `null` whenever the write-back is a no-op (no
 * placeholder, no media, undecodable, or an identity swap) so the caller can skip
 * a pointless durable write.
 */
public object PublishMediaWriteBack {

    /**
     * Returns [payload] with every [placeholder] media id replaced by [realId]
     * (order preserved, duplicates collapsed), or `null` when nothing changes:
     * the payload is undecodable, carries no media, lacks the placeholder, or the
     * swap would leave the list identical.
     */
    public fun graft(payload: String, placeholder: String, realId: String): String? {
        val request = runCatching {
            MeeshyApi.json.decodeFromString<CreateStoryRequest>(payload)
        }.getOrNull() ?: return null
        val media = request.mediaIds ?: return null
        if (placeholder !in media) return null
        val grafted = media.map { if (it == placeholder) realId else it }.distinct()
        if (grafted == media) return null
        return MeeshyApi.json.encodeToString(request.copy(mediaIds = grafted))
    }
}
