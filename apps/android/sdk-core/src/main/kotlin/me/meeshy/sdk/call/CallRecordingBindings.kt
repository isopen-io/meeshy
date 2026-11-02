package me.meeshy.sdk.call

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingRules
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import javax.inject.Inject
import javax.inject.Singleton

/** Les verbes d'enregistrement sur le socket des appels. */
@Singleton
class SocketCallRecordingSignals @Inject constructor(
    private val manager: CallSocialSignalManager,
) : CallRecordingSignals {
    override val events: Flow<CallRecordingSocketEvent> get() = manager.recordingEvents

    override suspend fun request(callId: String, kind: CallRecordingKind): Result<String> =
        manager.requestCallRecording(callId, kind)

    override suspend fun answer(callId: String, recordingId: String, accepted: Boolean): Result<Unit> =
        manager.answerCallRecording(callId, recordingId, accepted)

    override suspend fun stop(callId: String, recordingId: String): Result<Unit> =
        manager.stopCallRecording(callId, recordingId)
}

/** Le lecteur est l'utilisateur de la session ouverte. */
@Singleton
class SessionCallRecordingViewer @Inject constructor(
    private val session: SessionRepository,
) : CallRecordingViewer {
    override fun id(): String? = session.currentUserId
}

/**
 * FAIL-CLOSED : le mode de chiffrement de la conversation se relit à la passerelle ; si on ne
 * peut pas le savoir, la demande est refusée plutôt que de risquer un clair dans une conversation chiffrée.
 */
@Singleton
class ConversationCallRecordingEncryptionGate @Inject constructor(
    private val conversations: ConversationApi,
) : CallRecordingEncryptionGate {
    override suspend fun isEndToEnd(conversationId: String?): Boolean {
        if (conversationId.isNullOrBlank()) return false
        return try {
            CallRecordingRules.isEndToEnd(conversations.getById(conversationId).data?.encryptionMode)
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            true
        }
    }
}
