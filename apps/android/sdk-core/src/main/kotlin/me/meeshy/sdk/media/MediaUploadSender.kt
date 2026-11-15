package me.meeshy.sdk.media

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
 * - the bytes are **refused before leaving** because their location cannot be removed
 *   ([OutgoingMediaSanitizer.REFUSED_CODE], [OutgoingMediaSanitizer.MEDIA_REFUSED_CODE]) →
 *   [SendResult.PermanentFailure]: the same bytes are refused on every retry, so the row is
 *   failed at once instead of being replayed until the attempts run out (#13543).
 * - the held bytes **no longer read** ([OutgoingMediaSanitizer.UNREADABLE_CODE] AND a whole read of them fails: altered,
 *   or sealed under a key lost with the process) → [SendResult.PermanentFailure] with the same reason as a gone blob
 *   ([MediaLoss], #13554): a retry would read the same unreadable file. The same code with bytes that still read whole
 *   (the cleaned copy could not be written: disk full) is a [SendResult.TransientFailure].
 * - the gateway **refuses the destination** of the piece ([refusal], #13820: an end-to-end conversation, a conversation
 *   it does not find) → whatever [refusal] answers, a [SendResult.PermanentFailure]: the same refusal on every retry.
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
     * called when [item] is `null`. [refusal] reads a failed upload first: a non-null answer is the outcome.
     */
    suspend fun send(
        item: MediaUploadItem?,
        refusal: suspend (NetworkResult.Failure) -> SendResult? = { null },
        upload: suspend (MediaUploadItem) -> NetworkResult<List<UploadedMedia>>,
    ): SendResult {
        if (item == null) return SendResult.PermanentFailure(REASON_BLOB_GONE)
        return when (val result = upload(item)) {
            is NetworkResult.Failure -> refusal(result) ?: when (result.error.code) {
                in LOCATION_REFUSALS -> SendResult.PermanentFailure(REASON_LOCATION_NOT_REMOVABLE)
                OutgoingMediaSanitizer.UNREADABLE_CODE ->
                    if (readsWhole(item)) SendResult.TransientFailure else SendResult.PermanentFailure(REASON_BLOB_GONE)
                else -> SendResult.TransientFailure
            }
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

    /**
     * Whether every octet of [item] still reads (#13554): a sealed blob authenticates each segment as it is read, so a
     * whole read is the only proof it is intact — its first segment opening is not. The cleaning reports the same
     * [OutgoingMediaSanitizer.UNREADABLE_CODE] when its OWN copy cannot be written (disk full): bytes that still read
     * are then retried, never declared lost and dropped.
     */
    private suspend fun readsWhole(item: MediaUploadItem): Boolean = withContext(Dispatchers.IO) {
        try {
            item.source.open().use { input ->
                val buffer = ByteArray(READ_BUFFER_BYTES)
                while (input.read(buffer) >= 0) Unit
            }
            true
        } catch (failure: java.io.IOException) {
            false
        } catch (failure: java.security.GeneralSecurityException) {
            false
        }
    }

    private const val READ_BUFFER_BYTES = 64 * 1024

    const val REASON_BLOB_GONE: String = "Upload bytes are no longer available"
    const val REASON_NO_MEDIA: String = "Upload returned no usable media"
    const val REASON_LOCATION_NOT_REMOVABLE: String = "The location of this file could not be removed, so it was not sent"
    private val LOCATION_REFUSALS = setOf(OutgoingMediaSanitizer.REFUSED_CODE, OutgoingMediaSanitizer.MEDIA_REFUSED_CODE)
}
