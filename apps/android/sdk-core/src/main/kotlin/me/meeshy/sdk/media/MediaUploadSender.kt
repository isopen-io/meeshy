package me.meeshy.sdk.media

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.SendResult

/**
 * Pure delivery logic for an `UPLOAD_MEDIA` outbox row (ARCHITECTURE.md §5;
 * ADR-006) — the heart of the producer half of the durable upload→publish chain.
 *
 * Kept out of [me.meeshy.sdk.outbox.OutboxFlushWorker] so the "blob gone / network
 * down / nothing uploaded / delivered with a real id" decision is JVM-testable
 * without a `WorkManager` or a network. The worker stays thin glue: it looks the
 * blob up, calls [send], and drops the bytes once the row is no longer retryable.
 *
 * Outcomes map to the durable-queue semantics:
 * - the blob is **gone** (process death between enqueue and drain, or a double
 *   delivery) → [SendResult.PermanentFailure]: there is nothing to upload and a
 *   retry can never recover it, so the row is exhausted rather than spun forever.
 * - the upload **fails transiently** (offline, 5xx) → [SendResult.TransientFailure]:
 *   the lane stops and WorkManager retries with the bytes still durably held.
 * - the upload **succeeds but yields no usable media** → [SendResult.PermanentFailure]:
 *   a retry would produce the same empty result, so the chain is abandoned.
 * - the upload **succeeds with a real media id** → [SendResult.SuccessWithId]:
 *   the drainer grafts that id into every still-queued dependent publish.
 */
object MediaUploadSender {

    /**
     * Delivers one media upload. [item] is the durably-stored bytes (or `null`
     * when the blob is gone); [upload] performs the network upload of a single
     * item, returning the produced [UploadedMedia] rows. [upload] is **not**
     * called when [item] is `null`.
     */
    suspend fun send(
        item: MediaUploadItem?,
        upload: suspend (MediaUploadItem) -> NetworkResult<List<UploadedMedia>>,
    ): SendResult {
        if (item == null) return SendResult.PermanentFailure(REASON_BLOB_GONE)
        return when (val result = upload(item)) {
            is NetworkResult.Failure -> SendResult.TransientFailure
            is NetworkResult.Success -> {
                val producedId = result.data.firstOrNull()?.id
                if (producedId.isNullOrBlank()) {
                    SendResult.PermanentFailure(REASON_NO_MEDIA)
                } else {
                    SendResult.SuccessWithId(producedId)
                }
            }
        }
    }

    const val REASON_BLOB_GONE: String = "Upload bytes are no longer available"
    const val REASON_NO_MEDIA: String = "Upload returned no usable media"
}
