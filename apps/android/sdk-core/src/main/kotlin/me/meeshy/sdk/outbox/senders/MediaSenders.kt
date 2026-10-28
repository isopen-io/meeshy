package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadSender
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.outbox.MediaUploadPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import javax.inject.Inject

/**
 * `UPLOAD_MEDIA`: uploads the durably-stored blob (resumable TUS when the row carries a
 * known upload context, the legacy attachment upload otherwise) and drops the bytes once
 * they are delivered.
 *
 * A PUBLICATION's bytes (post, reel, story, status — [PUBLICATION_CONTEXTS]) stay on the
 * device after a failure (#13417): the author's work is only gone once the server confirmed
 * it or the author discarded it, so a refused or exhausted upload keeps them for a retry
 * from « Publications non envoyées » — the explicit discard ([me.meeshy.sdk.media.MediaUploadQueue.cancel])
 * is what drops them. A chat or comment upload keeps its old rule: its bytes leave with
 * the row once it is no longer retryable.
 */
public class UploadMediaHandler @Inject constructor(
    private val mediaBlobStore: MediaBlobStore,
    private val mediaRepository: MediaRepository,
    private val tusUploadRepository: TusUploadRepository,
    private val json: Json,
    private val progressLedger: MediaUploadProgressLedger,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val item = mediaBlobStore.get(row.cmid, row.ownerId)
        val context = uploadContextOf(row)
        val result = try {
            if (context != null) {
                MediaUploadSender.send(item) {
                    tusUploadRepository.upload(it, context) { sent, total -> progressLedger.report(row.cmid, sent, total) }
                }
            } else {
                MediaUploadSender.send(item) { mediaRepository.upload(listOf(it)) }
            }
        } finally {
            progressLedger.clear(row.cmid)
        }
        if (result.dropsBytes(context)) {
            mediaBlobStore.remove(row.cmid)
        }
        return result
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        if (uploadContextOf(row) in PUBLICATION_CONTEXTS) return
        mediaBlobStore.remove(row.cmid)
    }

    private fun SendResult.dropsBytes(context: TusUploadContext?): Boolean = when (this) {
        is SendResult.Success, is SendResult.SuccessWithId -> true
        is SendResult.TransientFailure, is SendResult.Deferred -> false
        is SendResult.PermanentFailure -> context !in PUBLICATION_CONTEXTS
    }

    /**
     * A blank payload (every row enqueued before [MediaUploadPayload] existed, and every
     * still-legacy chat-attachment enqueue) means "no TUS context" — not a decode failure,
     * so it never takes the permanent-failure path a genuinely malformed payload does.
     */
    private fun uploadContextOf(row: OutboxEntity): TusUploadContext? =
        row.payload.takeIf { it.isNotBlank() }
            ?.let { runCatching { json.decodeFromString<MediaUploadPayload>(it) }.getOrNull() }
            ?.uploadContext
            ?.let { TusUploadContext.fromWire(it) }

    private companion object {
        val PUBLICATION_CONTEXTS = setOf(TusUploadContext.POST, TusUploadContext.STORY, TusUploadContext.STATUS)
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface MediaSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPLOAD_MEDIA)
    public fun uploadMedia(handler: UploadMediaHandler): OutboxKindHandler
}
