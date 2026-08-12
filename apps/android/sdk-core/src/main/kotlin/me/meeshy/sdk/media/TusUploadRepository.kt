package me.meeshy.sdk.media

import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.entity.TusUploadCheckpointEntity
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusCheckpointKey
import me.meeshy.sdk.model.media.TusChunkPlan
import me.meeshy.sdk.model.media.TusChunkRange
import me.meeshy.sdk.model.media.TusResumeDecision
import me.meeshy.sdk.model.media.TusResumePlanner
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.media.TusUploadMetadata
import me.meeshy.sdk.model.toUploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TusApi
import me.meeshy.sdk.net.api.createSession
import me.meeshy.sdk.net.api.patchChunk
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
 * ([TusResumePlanner] decides — see its doc comment for the safety trade-off)
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
    ): NetworkResult<List<UploadedMedia>> {
        val fileName = MediaUpload.fileName(item.fileName)
        val mimeType = MediaUpload.mimeType(item.mimeType)
        val totalBytes = item.bytes.size.toLong()
        val checkpointKey = TusCheckpointKey.of(context, fileName, mimeType, totalBytes)

        val existing = checkpoints.find(checkpointKey)
        val decision = TusResumePlanner.plan(
            existingLocation = existing?.location,
            existingUploadedBytes = existing?.uploadedBytes ?: 0L,
            totalBytes = totalBytes,
        )

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
                resumeOffset = 0L
            }
        }

        val ranges = TusChunkPlan.chunks(totalBytes = totalBytes, chunkSize = chunkSizeBytes)
            .filter { it.offset >= resumeOffset }
        for (range in ranges) {
            if (!range.isFinal) {
                val chunkResult = tusApi.patchChunk(
                    location = location,
                    uploadOffset = range.offset,
                    tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                    body = rangeBody(item.bytes, range),
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
                continue
            }

            val finishResult = apiCall {
                tusApi.uploadData(
                    location = location,
                    uploadOffset = range.offset,
                    tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                    body = rangeBody(item.bytes, range),
                )
            }
            if (finishResult is NetworkResult.Failure) return finishResult
            checkpoints.delete(checkpointKey)
            return finishResult.map { data -> listOfNotNull(data.attachment?.toUploadedMedia()) }
        }

        // Unreachable: TusChunkPlan.chunks always returns at least one (final) range, and
        // TusResumePlanner never resumes at an offset that has already reached totalBytes.
        error("TusChunkPlan produced no ranges for ${item.bytes.size} bytes at resumeOffset=$resumeOffset")
    }

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
    ): NetworkResult<List<UploadedMedia>> {
        val uploaded = mutableListOf<UploadedMedia>()
        for (item in items) {
            when (val result = upload(item, context)) {
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

        private val OCTET_STREAM_MEDIA_TYPE = "application/offset+octet-stream".toMediaTypeOrNull()
    }
}
