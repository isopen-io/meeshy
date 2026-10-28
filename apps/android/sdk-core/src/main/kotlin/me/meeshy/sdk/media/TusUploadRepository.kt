package me.meeshy.sdk.media

import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.entity.TusUploadCheckpointEntity
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusCheckpointKey
import me.meeshy.sdk.model.media.TusChunkPlan
import me.meeshy.sdk.model.media.TusChunkRange
import me.meeshy.sdk.model.media.TusResumeDecision
import me.meeshy.sdk.model.media.TusResumePlanner
import me.meeshy.sdk.model.media.TusServerProbe
import me.meeshy.sdk.model.media.TusSessionOrigin
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.media.TusUploadMetadata
import me.meeshy.sdk.model.toUploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TusApi
import me.meeshy.sdk.net.api.createSession
import me.meeshy.sdk.net.api.patchChunk
import me.meeshy.sdk.net.api.probeSession
import me.meeshy.sdk.net.apiCall
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Uploads media via the [tus.io resumable protocol](https://tus.io/protocols/
 * resumable-upload) and returns the domain [UploadedMedia] a post/story/status/
 * comment composer references by id. Unlike [MediaRepository] (`POST
 * /attachments/upload`, which only ever produces a `MessageAttachment`), a TUS
 * upload tagged with a [TusUploadContext] is the **only** path that produces a
 * `PostMedia` row — the id space `CreatePostRequest`/`CreateStoryRequest.mediaIds`
 * actually claims against server-side (`services/gateway/src/services/posts/
 * mediaOwnership.ts`). Port of iOS `TusUploadManager`: the body is split into
 * bounded PATCH calls of at most [DEFAULT_CHUNK_SIZE_BYTES] each ([TusChunkPlan]),
 * matching iOS's own fixed-size chunking loop.
 *
 * **Checkpointed retries** (`feature-parity.md` §Q): every acknowledged
 * intermediate chunk persists a [TusUploadCheckpointEntity] keyed by
 * [TusCheckpointKey]. A retried [upload] call for the same content
 * (the gateway is asked what it holds — [TusResumePlanner.reconcile])
 * resumes at the last confirmed offset instead of re-uploading from byte zero,
 * skipping [TusApi.createUpload] entirely. The row is deleted once the final
 * chunk succeeds. This does **not** yet survive an app kill mid-upload — the
 * source bytes ([MediaUploadItem.bytes]) are still fully resident in memory for
 * the call's lifetime, so a killed process loses them regardless of the Room
 * checkpoint; genuine app-kill survival additionally needs a lazily-read file
 * source and a boot-time recovery scan, both tracked separately in
 * `feature-parity.md` §Q ("Crash-safe boot recovery for in-flight queue items").
 * A body no larger than one chunk (the common case — compressed images) still
 * makes exactly one PATCH, unchanged from before — it never writes an
 * intermediate checkpoint (there is no partial progress to persist) but a
 * successful completion still defensively clears any row for its key, a
 * harmless no-op when none exists.
 */
@Singleton
public class TusUploadRepository @Inject constructor(
    private val tusApi: TusApi,
    private val checkpoints: TusUploadCheckpointDao,
    private val sanitizer: OutgoingMediaSanitizer,
    private val config: MeeshyConfig,
) {
    /**
     * Uploads one [item] tagged with [context]. See [TusUploadRepository].
     * [chunkSizeBytes] defaults to [DEFAULT_CHUNK_SIZE_BYTES] — exposed as a
     * parameter (not a constructor field, to keep DI construction untouched) so
     * tests can exercise multi-chunk plans without allocating megabytes of test
     * fixture bytes.
     */
    public suspend fun upload(
        item: MediaUploadItem,
        context: TusUploadContext,
        chunkSizeBytes: Long = DEFAULT_CHUNK_SIZE_BYTES,
        onProgress: (sent: Long, total: Long) -> Unit = { _, _ -> },
    ): NetworkResult<List<UploadedMedia>> {
        val outgoing = when (val result = sanitizer.sanitize(item)) {
            is NetworkResult.Failure -> return result
            is NetworkResult.Success -> result.data
        }
        val fileName = MediaUpload.fileName(outgoing.fileName)
        val mimeType = MediaUpload.mimeType(outgoing.mimeType)
        val totalBytes = outgoing.bytes.size.toLong()
        val checkpointKey = TusCheckpointKey.of(context, fileName, mimeType, totalBytes)

        val decision = when (val verdict = resolveSession(checkpointKey, totalBytes)) {
            is NetworkResult.Failure -> return verdict
            is NetworkResult.Success -> verdict.data
        }

        val location: String
        val resumeOffset: Long
        when (decision) {
            is TusResumeDecision.Resume -> {
                location = decision.location
                resumeOffset = decision.resumeOffsetBytes
            }
            TusResumeDecision.Fresh -> {
                val locationResult = tusApi.createSession(
                    uploadLength = totalBytes,
                    uploadMetadata = TusUploadMetadata.headerValue(fileName, mimeType, context),
                    tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                )
                location = when (locationResult) {
                    is NetworkResult.Failure -> return locationResult
                    is NetworkResult.Success -> locationResult.data
                }
                if (!isOurs(location)) return NetworkResult.Failure(foreignSessionError())
                resumeOffset = 0L
            }
        }

        onProgress(resumeOffset, totalBytes)
        val ranges = TusChunkPlan.chunks(totalBytes = totalBytes - resumeOffset, chunkSize = chunkSizeBytes)
            .map { it.copy(offset = it.offset + resumeOffset) }
        for (range in ranges) {
            if (!range.isFinal) {
                val chunkResult = tusApi.patchChunk(
                    location = location,
                    uploadOffset = range.offset,
                    tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                    body = rangeBody(outgoing.bytes, range),
                )
                if (chunkResult is NetworkResult.Failure) return chunkResult
                checkpoints.upsert(
                    TusUploadCheckpointEntity(
                        checkpointKey = checkpointKey,
                        location = location,
                        uploadedBytes = range.offset + range.length,
                        totalBytes = totalBytes,
                        updatedAt = System.currentTimeMillis(),
                    ),
                )
                onProgress(range.offset + range.length, totalBytes)
                continue
            }

            val finishResult = apiCall {
                tusApi.uploadData(
                    location = location,
                    uploadOffset = range.offset,
                    tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                    body = rangeBody(outgoing.bytes, range),
                )
            }
            if (finishResult is NetworkResult.Failure) return finishResult
            checkpoints.delete(checkpointKey)
            onProgress(totalBytes, totalBytes)
            return finishResult.map { data -> listOfNotNull(data.attachment?.toUploadedMedia()) }
        }

        // Unreachable: TusChunkPlan.chunks always returns at least one (final) range, and
        // TusResumePlanner never resumes at an offset that has already reached totalBytes.
        error("TusChunkPlan produced no ranges for ${outgoing.bytes.size} bytes at resumeOffset=$resumeOffset")
    }

    /**
     * Whether to resume a stored session or open a new one (#13429). A stored session is never trusted
     * on its own: the gateway is asked (`HEAD`) what it really holds, so a lost acknowledgement does not
     * earn a `409` forever and a session the gateway swept does not fail every retry — its checkpoint
     * is dropped and the upload starts over. An unreachable gateway is a failure the caller retries.
     */
    private suspend fun resolveSession(checkpointKey: String, totalBytes: Long): NetworkResult<TusResumeDecision> {
        val existing = checkpoints.find(checkpointKey)
        val location = existing?.location
        if (location.isNullOrBlank()) return NetworkResult.Success(TusResumeDecision.Fresh)
        if (!isOurs(location)) {
            checkpoints.delete(checkpointKey)
            return NetworkResult.Success(TusResumeDecision.Fresh)
        }
        val probe = when (val result = tusApi.probeSession(location, TusUploadMetadata.TUS_RESUMABLE_VERSION)) {
            is NetworkResult.Failure -> return result
            is NetworkResult.Success -> result.data
        }
        if (probe == TusServerProbe.Gone) checkpoints.delete(checkpointKey)
        return NetworkResult.Success(TusResumePlanner.reconcile(location, probe, totalBytes))
    }

    /** The bearer rides on every call to a session address: only the API's own origin may receive it (#13429). */
    private fun isOurs(location: String): Boolean = TusSessionOrigin.isSameOrigin(location, config.apiBaseUrl)

    private fun foreignSessionError() = ApiError(message = "Upload session outside the API origin", code = FOREIGN_SESSION_CODE)

    private fun rangeBody(bytes: ByteArray, range: TusChunkRange) =
        bytes.copyOfRange(range.offset.toInt(), (range.offset + range.length).toInt()).toRequestBody(OCTET_STREAM_MEDIA_TYPE)

    /**
     * Uploads every item in [items], sequentially and in order, all tagged with the
     * same [context]. TUS has no batch endpoint (unlike [MediaRepository.upload]'s
     * single multipart call for a whole list) — this folds N single-file uploads into
     * the same all-or-nothing [NetworkResult] contract callers already expect:
     * **stops at the first failure** and returns it (mirrors iOS `TusUploadManager.
     * uploadFiles`'s task group, which cancels its siblings on the first thrown
     * error) rather than uploading the remainder or silently dropping the failed one.
     */
    public suspend fun uploadAll(
        items: List<MediaUploadItem>,
        context: TusUploadContext,
        onProgress: (index: Int, sent: Long, total: Long) -> Unit = { _, _, _ -> },
    ): NetworkResult<List<UploadedMedia>> {
        val uploaded = mutableListOf<UploadedMedia>()
        for ((index, item) in items.withIndex()) {
            when (val result = upload(item, context) { sent, total -> onProgress(index, sent, total) }) {
                is NetworkResult.Success -> uploaded += result.data
                is NetworkResult.Failure -> return result
            }
        }
        return NetworkResult.Success(uploaded)
    }

    public companion object {
        /**
         * Default PATCH chunk size — matches iOS `TusUploadManager.chunkSize` (10 MB)
         * so both clients place the same load shape against the gateway's `@tus/server`
         * mount. Public so it's usable as a real default for [upload]'s [chunkSizeBytes]
         * parameter from any caller/module.
         */
        public const val DEFAULT_CHUNK_SIZE_BYTES: Long = 10L * 1024 * 1024

        private const val FOREIGN_SESSION_CODE = "TUS_FOREIGN_SESSION"

        private val OCTET_STREAM_MEDIA_TYPE = "application/offset+octet-stream".toMediaTypeOrNull()
    }
}
