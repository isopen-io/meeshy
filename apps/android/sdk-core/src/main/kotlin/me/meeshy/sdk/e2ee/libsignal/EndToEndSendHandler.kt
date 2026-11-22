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
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.device.E2eeEnrollmentException
import me.meeshy.core.e2ee.seal.E2eeSealException
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber

/**
 * La ligne d'outbox d'un envoi chiffré : AUCUN clair — il attend au coffre, sous le `cid_`. L'effet du geste (vue unique,
 * éphémère, flou) y voyage pour qu'une redirection vers le tête-à-tête lisible le garde (#20182) ; absent des lignes
 * écrites avant lui, il vaut « aucun effet ».
 */
@Serializable
internal data class EndToEndSendPayload(
    val conversationId: String,
    val peerUserId: String,
    val clientMessageId: String,
    val effects: MessageEffects? = null,
)

/**
 * `SEND_E2EE_MESSAGE` (#14591) : relit le clair au coffre, le scelle pour chaque appareil de la directe et de mes appareils
 * approuvés, le remet par l'envoi libsignal, range le clair sous l'identifiant servi, puis réconcilie la bulle.
 *
 * Un correspondant qui n'a JAMAIS chiffré pour cet appareil : le texte part dans le tête-à-tête lisible de la paire (#20076).
 * Un correspondant connu chiffré, ou listé sans session ouvrable : le refus et le bandeau « Écrire sans chiffrement » (#20181).
 *
 * Fail-closed : un clair absent du coffre, une redirection impossible, un refus de la passerelle autre
 * qu'un défaut réseau — rien ne repart, et JAMAIS en clair ; la bulle passe en échec, avec « Réessayer ».
 */
internal class EndToEndSendHandler @Inject constructor(
    private val runtime: EndToEndMessagingRuntime,
    private val session: SessionRepository,
    private val messageRepository: MessageRepository,
    private val json: Json,
    private val reach: EndToEndPeerDeviceReach,
    private val readableRedirect: EndToEndReadableRedirect,
    private val erasures: PlaintextErasureLedger,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val payload = runCatching { json.decodeFromString(EndToEndSendPayload.serializer(), row.payload) }
            .getOrElse { return SendResult.PermanentFailure("Bad payload", unreadable = true) }
        val userId = session.currentUserId ?: return SendResult.Deferred(REASON_NO_SESSION)
        return try {
            // Un coffre qui ne s'ouvre pas dit sa raison (#18977) ; un coffre verrouillé se réessaie ; seul un clair ABSENT juge.
            val readable = runtime.plaintext(userId, payload.clientMessageId) as? E2eePlaintextEntry.Readable
                ?: return SendResult.PermanentFailure(REASON_PLAINTEXT_MISSING)
            val served = try {
                runtime.deliver(userId, payload.conversationId, payload.peerUserId, readable.content, readable.content.replyTo)
            } catch (_: E2eeSealException.RecipientHasNoDevice) {
                return redirected(userId, payload, readable.content)
            } catch (_: E2eeSealException.RecipientDevicesUnreachable) {
                // #20181 — connu chiffré, ou listé sans session ouvrable : le refus d'avant et le bandeau, jamais seul en clair.
                reach.confirmUnreachable(payload.peerUserId)
                return SendResult.PermanentFailure(REASON_NOT_SEALED)
            }
            reach.confirmReachable(payload.peerUserId)
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
        } catch (_: E2eeEnrollmentException.DeviceLimitReached) {
            SendResult.PermanentFailure(EndToEndDeviceLimit.REASON)
        } catch (_: E2eeVaultUnavailableException) {
            SendResult.PermanentFailure(REASON_UNAVAILABLE)
        } catch (failure: Exception) {
            Timber.w("e2ee send failed: %s", failure.javaClass.simpleName)
            SendResult.TransientFailure
        }
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        messageRepository.markSendFailed(row.cmid, row.lastError)
    }

    /**
     * #20076 (iOS #20074) — le correspondant n'a aucun appareil chiffré : le texte part dans le tête-à-tête LISIBLE de la
     * paire, qui s'ouvre ; la bulle et son clair quittent le fil chiffré, et la ligne de liste revient au dernier message
     * réel. Une redirection qui échoue garde le refus d'avant — rien ne part jamais en clair ICI (#12949).
     */
    private suspend fun redirected(userId: String, payload: EndToEndSendPayload, content: E2eeContent): SendResult {
        reach.confirmWithoutDevice(payload.peerUserId)
        val text = content.text.orEmpty()
        val delivered = readableRedirect.deliver(
            payload.conversationId,
            payload.peerUserId,
            payload.clientMessageId,
            text,
            content.language,
            payload.effects ?: MessageEffects(),
        )
        if (!delivered) return SendResult.PermanentFailure(REASON_NOT_SEALED)
        messageRepository.withdrawLocal(payload.clientMessageId)
        // #20182 — un clair que le coffre n'a pas effacé s'inscrit à la file durable des effacements : jamais oublié.
        if (!runtime.erase(userId, listOf(payload.clientMessageId))) erasures.recordNamed(listOf(payload.clientMessageId))
        return SendResult.Success
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
        const val REASON_UNAVAILABLE: String = "E2EE_UNAVAILABLE: this device keeps no durable end-to-end vault"
    }
}

/**
 * **La limite d'appareils chiffrés atteinte** (#18976) : le compte a déjà `E2EE_MAX_ACTIVE_DEVICES` appareils actifs, et
 * celui-ci ne peut pas s'enrôler. Un nouvel essai échouerait à l'identique tant qu'aucun appareil n'est retiré : l'échec
 * est DÉFINITIF et lisible, et la bulle dit où en retirer un (« Mes appareils chiffrés »).
 */
public object EndToEndDeviceLimit {
    public const val REASON: String = "E2EE_DEVICE_LIMIT: remove one of your encrypted devices to encrypt on this one"

    public fun isReason(reason: String?): Boolean = reason == REASON
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
