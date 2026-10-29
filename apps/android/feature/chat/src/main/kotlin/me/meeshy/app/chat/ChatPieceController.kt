package me.meeshy.app.chat

import androidx.work.WorkManager
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.conversation.MessageAttachmentRemover
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.PieceRemoval
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.piece.MessagePieceTarget
import me.meeshy.sdk.model.piece.PieceDeletion
import me.meeshy.sdk.outbox.ConversationPlaintextVerdict
import me.meeshy.sdk.outbox.OutboxAdmissionVerdict
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository

/** Ce qu'un geste sur une pièce n'a pas pu faire — l'écran le dit, dans la langue du lecteur. */
enum class PieceFailure { REMOVE }

/**
 * **Les gestes d'une pièce SEULE qui touchent le serveur** (#13596, miroir de `toggleAttachmentReaction` et
 * `deleteAttachment`, iOS) : réagir à la pièce affichée, la supprimer. Le transfert passe par la feuille de partage
 * ([ChatForwardController.openPiece]), « Enregistrer » par [ChatFileDownloadController].
 *
 * - **Réagir** : optimiste dans Room, confirmé par la socket (`attachment:reaction-add|remove`), défait par le geste
 *   inverse sur un refus ([ChatRealtimeController.toggleAttachmentReaction]). Jamais sur une pièce protégée ni sans le
 *   droit d'écrire.
 * - **Supprimer** : seulement SA pièce, sur un message accusé. Une pièce parmi d'autres (ou un message qui garde du
 *   texte) ne perd que la pièce, qui revient à sa place si la passerelle refuse ; la dernière pièce d'un message sans
 *   texte supprime le message entier, par le circuit ordinaire.
 *
 * **Les deux gestes partent HORS de l'outbox, donc sous SA loi du clair** (#13803) : [ConversationPlaintextVerdict] juge la
 * conversation (registre, mode en cache, relecture d'un mode inconnu) AVANT tout optimiste et tout envoi. Seule une
 * conversation connue claire les reçoit : chiffrée de bout en bout, inconnue ou illisible à temps, rien ne part — Room peut
 * encore dire `server` d'une conversation que le registre sait chiffrée. Une suppression retenue le dit au lecteur.
 */
class ChatPieceController @Inject constructor(
    private val remover: MessageAttachmentRemover,
    private val realtime: ChatRealtimeController,
    private val messageRepository: MessageRepository,
    private val workManager: WorkManager,
    private val sessionRepository: SessionRepository,
    private val verdict: ConversationPlaintextVerdict,
) : ChatController {

    private var host: ChatControllerHost? = null
    private val _failures = MutableSharedFlow<PieceFailure>(extraBufferCapacity = 4)

    /** Les échecs à dire à l'utilisateur ; l'écran les collecte pendant qu'il est ouvert. */
    val failures: SharedFlow<PieceFailure> = _failures.asSharedFlow()

    override fun attach(host: ChatControllerHost) {
        this.host = host
    }

    override fun detach() {
        host = null
    }

    private fun carrier(host: ChatControllerHost, messageId: String): ApiMessage? =
        host.messages.value.firstOrNull { it.message.id == messageId }?.message

    private fun ApiMessage.piece(attachmentId: String): ApiMessageAttachment? = attachments.firstOrNull { it.id == attachmentId }

    /** La conversation de l'écran et celle que porte le message : le geste ne part que si TOUTES sont connues claires. */
    private fun conversationsOf(host: ChatControllerHost, message: ApiMessage): List<String> =
        listOf(host.conversationId, message.conversationId).filter { it.isNotBlank() }.distinct()

    /** Relecture bornée : un mode qui ne se lit pas à temps, ou dont la lecture échoue, vaut un mode inconnu — rien ne part. */
    private suspend fun admitsPlainGesture(conversations: List<String>): Boolean =
        conversations.isNotEmpty() && conversations.all { id -> admits(id) }

    private suspend fun admits(conversationId: String): Boolean = try {
        withTimeoutOrNull(MODE_READ_BUDGET_MILLIS) { verdict.verdictFor(conversationId) } == OutboxAdmissionVerdict.ADMIT
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }

    /** Pose ou retire [emoji] sur la pièce : retire si ce lecteur l'a déjà posé. */
    fun react(messageId: String, attachmentId: String, emoji: String) {
        val current = host ?: return
        val state = current.uiState.value
        if (!state.viewerMayWrite) return
        val message = carrier(current, messageId) ?: return
        val piece = message.piece(attachmentId) ?: return
        if (MessagePieceTarget.isProtected(piece, message)) return
        val adding = emoji !in piece.currentUserReactions.orEmpty()
        val conversations = conversationsOf(current, message)
        current.scope.launch {
            if (!admitsPlainGesture(conversations)) return@launch
            try {
                realtime.toggleAttachmentReaction(messageId, attachmentId, emoji, adding)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // L'optimiste est déjà défait par le contrôleur du temps réel ; une pill qui revient suffit.
            }
        }
    }

    /** Supprime la pièce visée — jamais une voisine ; un lot sans visée ne supprime rien. */
    fun delete(messageId: String, attachmentId: String) {
        val current = host ?: return
        val message = carrier(current, messageId) ?: return
        if (!PieceDeletion.mayDelete(message, sessionRepository.currentUser.value?.id, current.uiState.value.isEndToEnd)) return
        val plan = PieceDeletion.plan(message, attachmentId)
        if (plan == PieceDeletion.Plan.Nothing) return
        val conversations = conversationsOf(current, message)
        current.scope.launch {
            if (admitsPlainGesture(conversations)) carryOut(messageId, plan) else _failures.emit(PieceFailure.REMOVE)
        }
    }

    private suspend fun carryOut(messageId: String, plan: PieceDeletion.Plan) {
        when (plan) {
            PieceDeletion.Plan.Nothing -> Unit
            PieceDeletion.Plan.DeleteMessage -> {
                try {
                    if (messageRepository.deleteOptimistic(messageId)) workManager.enqueue(OutboxFlushWorker.buildRequest())
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    _failures.emit(PieceFailure.REMOVE)
                }
            }
            is PieceDeletion.Plan.RemovePiece -> {
                try {
                    if (remover.remove(messageId, plan.attachmentId) == PieceRemoval.FAILED) _failures.emit(PieceFailure.REMOVE)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    _failures.emit(PieceFailure.REMOVE)
                }
            }
        }
    }

    private companion object {
        const val MODE_READ_BUDGET_MILLIS = 5_000L
    }
}
