package me.meeshy.sdk.e2ee.libsignal

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.e2ee.seal.E2eeSealException
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber

/** La ligne d'outbox d'un envoi chiffré : AUCUN clair — il attend au coffre, sous le `cid_`. */
@Serializable
internal data class EndToEndSendPayload(val conversationId: String, val peerUserId: String, val clientMessageId: String)

/**
 * `SEND_E2EE_MESSAGE` (#14591) : relit le clair au coffre, le scelle pour chaque appareil de la directe et de mes appareils
 * approuvés, le remet par l'envoi libsignal, range le clair sous l'identifiant servi, puis réconcilie la bulle.
 *
 * Fail-closed : un clair absent du coffre, un correspondant sans appareil chiffré, un refus de la passerelle autre
 * qu'un défaut réseau — rien ne repart, et JAMAIS en clair ; la bulle passe en échec, avec « Réessayer ».
 */
internal class EndToEndSendHandler @Inject constructor(
    private val runtime: EndToEndMessagingRuntime,
    private val session: SessionRepository,
    private val messageRepository: MessageRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val payload = runCatching { json.decodeFromString(EndToEndSendPayload.serializer(), row.payload) }
            .getOrElse { return SendResult.PermanentFailure("Bad payload", unreadable = true) }
        val userId = session.currentUserId ?: return SendResult.Deferred(REASON_NO_SESSION)
        val readable = runtime.plaintext(userId, payload.clientMessageId) as? E2eePlaintextEntry.Readable
            ?: return SendResult.PermanentFailure(REASON_PLAINTEXT_MISSING)
        return try {
            val served = runtime.deliver(userId, payload.conversationId, payload.peerUserId, readable.content, readable.content.replyTo)
            runtime.remember(userId, readable.content, listOf(served.id))
            messageRepository.reconcileSent(payload.clientMessageId, served)
            SendResult.Success
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (refused: E2eeRemoteException) {
            refusal(refused)
        } catch (sealing: E2eeSealException) {
            Timber.w("e2ee send not sealed: %s", sealing.javaClass.simpleName)
            SendResult.PermanentFailure(REASON_NOT_SEALED)
        } catch (failure: Exception) {
            Timber.w("e2ee send failed: %s", failure.javaClass.simpleName)
            SendResult.TransientFailure
        }
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.markSendFailed(row.cmid, row.lastError)
    }

    /** Un défaut de transport (5xx, 429, 401 que le rafraîchissement rejouera) ou un appareil à relier se réessaie ; un refus juge. */
    private fun refusal(refused: E2eeRemoteException): SendResult {
        val status = refused.httpStatus
        return when {
            status == null || status >= 500 || status == 429 || status == 401 -> SendResult.TransientFailure
            refused.code == E2eeErrorCode.DEVICE_NOT_BOUND -> SendResult.TransientFailure
            else -> SendResult.PermanentFailure("$REASON_REFUSED ${refused.code}")
        }
    }

    companion object {
        const val REASON_NO_SESSION: String = "E2EE_NO_SESSION: waiting for a signed-in account"
        const val REASON_PLAINTEXT_MISSING: String = "E2EE_PLAINTEXT_MISSING: the message text is no longer on this device"
        const val REASON_NOT_SEALED: String = "E2EE_NOT_SEALED: the recipient has no device that encrypts, or its devices keep changing"
        const val REASON_REFUSED: String = "E2EE_REFUSED:"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EndToEndSendModule {
    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.SEND_E2EE_MESSAGE)
    fun sendEndToEnd(handler: EndToEndSendHandler): OutboxKindHandler

    @Binds
    fun thread(impl: LibsignalEndToEndThread): EndToEndThreadAccess
}
