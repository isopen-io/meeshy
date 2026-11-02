package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadSender
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.ConversationModeReader
import me.meeshy.sdk.outbox.MediaUploadPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxPlaintextAdmission
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
 *
 * A chat upload names its conversation to the gateway ([MediaUploadPayload.conversationId], #13820), which never STORES
 * the piece of an end-to-end conversation (the bytes already on the wire are received, then dropped). That refusal is
 * final, like a refused message ([PlaintextRefusal]): the conversation is learned end-to-end and the row fails at once;
 * a conversation the GATEWAY does not find (404 [ConversationModeReader.GATEWAY_NOT_FOUND_CODE]) fails at once too. A raw
 * 404 from a proxy (Traefik while the gateway restarts) is retried, its bytes kept. A chat upload exhausted because its
 * conversation's mode could not be read ([OutboxPlaintextAdmission.isModeUnconfirmed]) keeps its bytes for « Réessayer ».
 */
public class UploadMediaHandler @Inject constructor(
    private val mediaBlobStore: MediaBlobStore,
    private val mediaRepository: MediaRepository,
    private val tusUploadRepository: TusUploadRepository,
    private val json: Json,
    private val progressLedger: MediaUploadProgressLedger,
    private val regimes: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val item = mediaBlobStore.get(row.cmid, row.ownerId)
        val payload = payloadOf(row)
        val context = contextOf(payload)
        val result = try {
            if (context != null) {
                MediaUploadSender.send(item) {
                    tusUploadRepository.upload(it, context) { sent, total -> progressLedger.report(row.cmid, sent, total) }
                }
            } else {
                val destination = payload?.conversationId?.takeIf { it.isNotBlank() }
                MediaUploadSender.send(item, refusal = { destinationRefusal(it, destination) }) {
                    mediaRepository.upload(listOf(it), destination)
                }
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
        if (contextOf(payloadOf(row)) in PUBLICATION_CONTEXTS) return
        if (OutboxPlaintextAdmission.isModeUnconfirmed(row.lastError)) return
        mediaBlobStore.remove(row.cmid)
    }

    private fun destinationRefusal(failure: NetworkResult.Failure, destination: String?): SendResult? {
        PlaintextRefusal.of(failure, destination, regimes)?.let { return it }
        if (destination == null || !ConversationModeReader.isGatewayNotFound(failure.error.httpStatus, failure.error.code)) return null
        return SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_CONVERSATION_UNREACHABLE)
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
    private fun payloadOf(row: OutboxEntity): MediaUploadPayload? =
        row.payload.takeIf { it.isNotBlank() }
            ?.let { runCatching { json.decodeFromString<MediaUploadPayload>(it) }.getOrNull() }

    private fun contextOf(payload: MediaUploadPayload?): TusUploadContext? =
        payload?.uploadContext?.let { TusUploadContext.fromWire(it) }

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
