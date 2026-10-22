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
 * the row is no longer retryable. An exhausted upload drops them too.
 */
public class UploadMediaHandler @Inject constructor(
    private val mediaBlobStore: MediaBlobStore,
    private val mediaRepository: MediaRepository,
    private val tusUploadRepository: TusUploadRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val item = mediaBlobStore.get(row.cmid)
        val context = uploadContextOf(row)
        val result = if (context != null) {
            MediaUploadSender.send(item) { tusUploadRepository.upload(it, context) }
        } else {
            MediaUploadSender.send(item) { mediaRepository.upload(listOf(it)) }
        }
        if (result !is SendResult.TransientFailure) {
            mediaBlobStore.remove(row.cmid)
        }
        return result
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        mediaBlobStore.remove(row.cmid)
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
}

@Module
@InstallIn(SingletonComponent::class)
public interface MediaSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPLOAD_MEDIA)
    public fun uploadMedia(handler: UploadMediaHandler): OutboxKindHandler
}
